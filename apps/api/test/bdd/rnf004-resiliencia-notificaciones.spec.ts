import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Job, Queue } from 'bullmq';
import { PushNotificationProcessor } from '../../src/modules/notificaciones/processors/push-notification.processor';
import { EmailNotificationProcessor } from '../../src/modules/notificaciones/processors/email-notification.processor';
import {
  agotoIntentos,
  construirJobIdDlq,
  moverJobADeadLetter,
} from '../../src/modules/notificaciones/dead-letter';
import {
  COLA_EMAIL,
  COLA_PUSH,
  LIMITADOR_WORKER_EMAIL,
  LIMITADOR_WORKER_PUSH,
  OPCIONES_JOB_EMAIL,
  OPCIONES_JOB_PUSH,
  construirJobIdNotificacion,
  nombreColaDlq,
  resolverReferenciaEvento,
  retrocesoRnf004,
} from '../../src/modules/notificaciones/notificaciones.config';
import type { EventoNotificacionPayload } from '@guachafit/shared';

/**
 * RNF-004 (Ola 3): resiliencia del pipeline de notificaciones.
 *
 * Cubre las cuatro piezas exigidas:
 * 1. `jobId` determinista (idempotencia de entregas dentro de la jornada UTC).
 * 2. Dead-Letter Queue para jobs que agotan intentos (patrón del evento `failed`).
 * 3. Push processor que RELANZA errores reintentables (BullMQ reintenta de verdad).
 * 4. Rate limit por worker y política de backoff del RNF-004 §4.
 */
describe('RNF-004: resiliencia, idempotencia y DLQ de notificaciones', () => {
  const payloadBase: EventoNotificacionPayload = {
    tipoEvento: 'CUOTA_POR_VENCER',
    destinatarioUserId: '11111111-1111-4111-8111-111111111111',
    entrenadorId: '22222222-2222-4222-8222-222222222222',
    categoria: 'FINANZAS',
    titulo: 'Tu cuota vence pronto',
    cuerpo: 'Tu mensualidad vence en 5 días.',
    datosAdicionales: { cuotaId: 'cuota-abc' },
  };

  // ===========================================================================
  // 1. jobId determinista (RNF-004 §3)
  // ===========================================================================
  describe('jobId determinista', () => {
    it('es determinista para el mismo evento y día UTC, con el esquema documentado', () => {
      const ahora = new Date('2026-09-22T15:30:00.000Z');
      const jobId = construirJobIdNotificacion(payloadBase, ahora);

      expect(jobId).toBe(
        'notif_FINANZAS_CUOTA_POR_VENCER_11111111-1111-4111-8111-111111111111_cuota-abc_20260922'
      );
      expect(construirJobIdNotificacion(payloadBase, new Date('2026-09-22T23:59:59.000Z'))).toBe(
        jobId
      );
    });

    it('cambia con el día UTC: un recordatorio legítimo de otro día no se deduplica', () => {
      const dia1 = construirJobIdNotificacion(payloadBase, new Date('2026-09-22T23:59:59.000Z'));
      const dia2 = construirJobIdNotificacion(payloadBase, new Date('2026-09-23T00:00:01.000Z'));
      expect(dia1).not.toBe(dia2);
    });

    it('usa `referenciaId` explícito y cae a las claves conocidas de datosAdicionales', () => {
      expect(resolverReferenciaEvento({ ...payloadBase, referenciaId: 'ref-explicita' })).toBe(
        'ref-explicita'
      );
      expect(resolverReferenciaEvento(payloadBase)).toBe('cuota-abc');
      expect(
        resolverReferenciaEvento({
          ...payloadBase,
          datosAdicionales: { transaccionId: 'tx-1', cuotaId: 'cuota-abc' },
        })
      ).toBe('tx-1');
      expect(resolverReferenciaEvento({ ...payloadBase, datosAdicionales: {} })).toBe('sin-ref');
    });

    it('nunca contiene `:` (BullMQ 5.x rechaza los ids personalizados con ese separador)', () => {
      const jobId = construirJobIdNotificacion(payloadBase);
      expect(jobId).not.toContain(':');
    });
  });

  // ===========================================================================
  // 2. Dead-Letter Queue (RNF-004 §4)
  // ===========================================================================
  describe('Dead-Letter Queue', () => {
    function crearJob(overrides: Partial<Job> = {}): Job {
      return {
        id: 'notif_FINANZAS_CUOTA_POR_VENCER_uid_ref_20260922',
        name: 'enviar-email',
        data: { email: 'alumno@guachafit.com' },
        attemptsMade: 1,
        opts: { attempts: 3 },
        ...overrides,
      } as unknown as Job;
    }

    it('no mueve a la DLQ mientras queden reintentos', async () => {
      const dlq = { add: vi.fn() } as unknown as Queue;
      const movido = await moverJobADeadLetter(dlq, COLA_EMAIL, crearJob({ attemptsMade: 1 }), new Error('boom'));

      expect(movido).toBe(false);
      expect(dlq.add).not.toHaveBeenCalled();
    });

    it('mueve a la DLQ cuando el job agotó intentos, con payload de triaje y jobId determinista', async () => {
      const dlq = { add: vi.fn().mockResolvedValue({ id: 'dlq-1' }) } as unknown as Queue;
      const job = crearJob({ attemptsMade: 3 });

      const movido = await moverJobADeadLetter(dlq, COLA_EMAIL, job, new Error('503 timeout'));

      expect(movido).toBe(true);
      expect(dlq.add).toHaveBeenCalledWith(
        'job-fallido',
        expect.objectContaining({
          colaOrigen: COLA_EMAIL,
          jobIdOriginal: job.id,
          nombreJob: 'enviar-email',
          datos: { email: 'alumno@guachafit.com' },
          error: '503 timeout',
          intentosRealizados: 3,
        }),
        expect.objectContaining({ jobId: `dlq_${COLA_EMAIL}_${job.id}` })
      );
    });

    it('`agotoIntentos` respeta opts.attempts (default 1 intento) y el id de DLQ es determinista', () => {
      expect(agotoIntentos(crearJob({ attemptsMade: 2, opts: { attempts: 3 } }))).toBe(false);
      expect(agotoIntentos(crearJob({ attemptsMade: 3, opts: { attempts: 3 } }))).toBe(true);
      expect(agotoIntentos(crearJob({ attemptsMade: 1, opts: {} }))).toBe(true);
      expect(construirJobIdDlq(COLA_PUSH, 'job-1')).toBe('dlq_notificaciones-push_job-1');
      expect(nombreColaDlq(COLA_PUSH)).toBe('notificaciones-push-dead-letter');
      expect(nombreColaDlq('cobranza')).toBe('cobranza-dead-letter');
    });

    it('un fallo del propio DLQ no tumba al worker ni oculta el fallo original', async () => {
      const dlq = {
        add: vi.fn().mockRejectedValue(new Error('Redis caído')),
      } as unknown as Queue;

      await expect(
        moverJobADeadLetter(dlq, COLA_EMAIL, crearJob({ attemptsMade: 3 }), new Error('503'))
      ).resolves.toBe(false);
    });
  });

  // ===========================================================================
  // 3. Push processor: reintentos REALES y tokens muertos sin retry (RNF-004 §4 / RF-016 RN-04)
  // ===========================================================================
  describe('Push processor', () => {
    let dispositivos: any;
    let dlq: any;
    let processor: PushNotificationProcessor;

    function crearJobPush(tokens: string[]): Job {
      return {
        id: 'job-push-1',
        name: 'enviar-push',
        attemptsMade: 0,
        opts: { attempts: 4 },
        data: {
          usuarioId: payloadBase.destinatarioUserId,
          tokens,
          titulo: 'Alerta',
          cuerpo: 'Cuerpo',
          tipoEvento: 'CUOTA_POR_VENCER',
        },
      } as unknown as Job;
    }

    beforeEach(() => {
      dispositivos = { marcarTokenInvalido: vi.fn().mockResolvedValue(undefined) };
      dlq = { add: vi.fn().mockResolvedValue({ id: 'dlq-push-1' }) };
      processor = new PushNotificationProcessor(dispositivos, dlq);
    });

    it('entrega a tokens válidos y desactiva tokens muertos SIN relanzar (no son reintentables)', async () => {
      const resultado = await processor.process(
        crearJobPush(['token_valido_1', 'token_unregistered_dead'])
      );

      expect(resultado).toEqual({ delivered: 1, failed: 1 });
      expect(dispositivos.marcarTokenInvalido).toHaveBeenCalledWith('token_unregistered_dead');
    });

    it('RELANZA el error ante un fallo transitorio del proveedor para que BullMQ reintente', async () => {
      await expect(
        processor.process(crearJobPush(['token_valido_1', 'token_error-500-simulado']))
      ).rejects.toThrow(/fallo transitorio/);
    });

    it('el listener failed solo copia a la DLQ cuando se agotaron los intentos', async () => {
      const jobAgotado = { ...crearJobPush(['token_valido_1']), attemptsMade: 4 } as Job;
      await processor.alAgotarIntentos(jobAgotado, new Error('timeout'));
      expect(dlq.add).toHaveBeenCalledTimes(1);

      const jobConReintentos = { ...crearJobPush(['token_valido_1']), attemptsMade: 2 } as Job;
      await processor.alAgotarIntentos(jobConReintentos, new Error('timeout'));
      expect(dlq.add).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 4. Email processor: DLQ + backoff exacto + rate limit (RNF-004 §4 y §5)
  // ===========================================================================
  describe('Email processor y política de reintentos/rate limit', () => {
    it('relanza el error 5xx del proveedor y copia a la DLQ al agotar intentos', async () => {
      const dlq = { add: vi.fn().mockResolvedValue({ id: 'dlq-email-1' }) };
      const processor = new EmailNotificationProcessor(dlq as any);

      await expect(
        processor.process({
          id: 'job-email-fail',
          name: 'enviar-email',
          attemptsMade: 1,
          opts: { attempts: 4 },
          data: {
            usuarioId: payloadBase.destinatarioUserId,
            email: 'error-500-simulado@guachafit.com',
            asunto: 'Recibo',
            cuerpo: 'Detalle',
            tipoEvento: 'PAGO_APROBADO',
          },
        } as unknown as Job)
      ).rejects.toThrow('503 Service Unavailable');

      await processor.alAgotarIntentos(
        {
          id: 'job-email-fail',
          name: 'enviar-email',
          attemptsMade: 4,
          opts: { attempts: 4 },
          data: {},
        } as unknown as Job,
        new Error('503 Service Unavailable')
      );

      expect(dlq.add).toHaveBeenCalledWith(
        'job-fallido',
        expect.objectContaining({ colaOrigen: COLA_EMAIL }),
        expect.any(Object)
      );
    });

    it('la política de backoff del RNF-004 §4 es 15s → 2min → 10min', () => {
      expect(retrocesoRnf004(1)).toBe(15_000);
      expect(retrocesoRnf004(2)).toBe(120_000);
      expect(retrocesoRnf004(3)).toBe(600_000);
      expect(retrocesoRnf004(4)).toBe(600_000);
    });

    it('la retención cubre la ventana de deduplicación de 24h y el rate limit es el del requisito', () => {
      expect(OPCIONES_JOB_PUSH.removeOnComplete).toEqual({ age: 24 * 60 * 60, count: 5000 });
      expect(OPCIONES_JOB_EMAIL.removeOnComplete).toEqual({ age: 24 * 60 * 60, count: 5000 });
      expect(OPCIONES_JOB_EMAIL.backoff).toEqual({ type: 'custom' });
      expect(LIMITADOR_WORKER_EMAIL).toEqual({ max: 50, duration: 1000 });
      expect(LIMITADOR_WORKER_PUSH).toEqual({ max: 100, duration: 1000 });
    });
  });
});
