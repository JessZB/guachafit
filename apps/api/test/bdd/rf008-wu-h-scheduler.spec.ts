import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Job } from 'bullmq';
import { EstadoCuota } from '@guachafit/shared';
import {
  BillingSchedulerService,
  OPCIONES_JOBS_COBRANZA,
} from '../../src/modules/finanzas/billing-scheduler.service';
import {
  BillingReminderProcessor,
  construirMensajeMoraParcial,
  construirMensajeRecordatorio,
} from '../../src/modules/finanzas/billing-reminder.processor';
import {
  COBRANZA_QUEUE,
  JOB_BARRIDO_ESTADOS,
  JOB_RECORDATORIO_CUOTA,
  JOB_SCHEDULER_BARRIDO_ID,
  construirJobIdCobranza,
} from '../../src/modules/finanzas/cobranza-hitos';

/**
 * WU-H (RF-008 §4.B / ADR-008): planificador BullMQ con cola MOCK.
 * Verifica jobIds deterministas, timestamps UTC exactos de cada hito, retries/backoff,
 * cancelación al liquidar y registro idempotente del barrido diario.
 */
describe('RF-008 WU-H: BillingSchedulerService (cola mock)', () => {
  const cuotaId = '123e4567-e89b-12d3-a456-426614174000';
  const fechaCorteUtc = new Date('2026-09-15T23:59:59Z');
  const ahora = new Date('2026-09-01T00:00:00Z');

  let mockQueue: any;
  let scheduler: BillingSchedulerService;

  beforeEach(() => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-mock' }),
      remove: vi.fn().mockResolvedValue(1),
      upsertJobScheduler: vi.fn().mockResolvedValue({ id: 'scheduler-mock' }),
    };
    scheduler = new BillingSchedulerService(mockQueue);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('programación de hitos al emitir', () => {
    it('agenda los 4 jobs T-5/T-1/T/T+2 con jobId determinista y timestamps UTC exactos', async () => {
      const programados = await scheduler.programarRecordatoriosCuota(
        { id: cuotaId, fechaCorteUtc },
        ahora
      );

      expect(programados).toEqual(['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
      expect(mockQueue.add).toHaveBeenCalledTimes(4);

      const esperados = [
        { hito: 'T_MINUS_5', timestamp: '2026-09-10T23:59:59.000Z' },
        { hito: 'T_MINUS_1', timestamp: '2026-09-14T23:59:59.000Z' },
        { hito: 'T_ZERO', timestamp: '2026-09-15T23:59:59.000Z' },
        { hito: 'T_PLUS_2', timestamp: '2026-09-17T23:59:59.000Z' },
      ] as const;

      for (const esperado of esperados) {
        const timestampMs = new Date(esperado.timestamp).getTime();
        expect(mockQueue.add).toHaveBeenCalledWith(
          JOB_RECORDATORIO_CUOTA,
          {
            cuotaId,
            hito: esperado.hito,
            timestampHitoUtc: esperado.timestamp,
          },
          expect.objectContaining({
            jobId: `cuota_${cuotaId}_hito_${esperado.hito}`,
            delay: timestampMs - ahora.getTime(),
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          })
        );
      }

      // El contrato exacto del ADR-008 (formato seguro para BullMQ 5.x).
      expect(construirJobIdCobranza(cuotaId, 'T_MINUS_1')).toBe(
        `cuota_${cuotaId}_hito_T_MINUS_1`
      );
    });

    it('omite los hitos ya vencidos al emitir tarde (nunca un recordatorio tardío/incorrecto)', async () => {
      // Corte en 12 horas: T-5 y T-1 ya pasaron; T y T+2 siguen en el futuro.
      const corteCercano = new Date(ahora.getTime() + 12 * 60 * 60 * 1000);
      const programados = await scheduler.programarRecordatoriosCuota(
        { id: cuotaId, fechaCorteUtc: corteCercano },
        ahora
      );

      expect(programados).toEqual(['T_ZERO', 'T_PLUS_2']);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelación al pagar (ADR-008 §3.2)', () => {
    it('elimina por jobId los 4 recordatorios y suma los removidos', async () => {
      const eliminados = await scheduler.cancelarRecordatoriosCuota(cuotaId);

      expect(eliminados).toBe(4);
      const idsEsperados = ['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2'].map((hito) =>
        construirJobIdCobranza(cuotaId, hito as any)
      );
      expect(mockQueue.remove.mock.calls.map((c: any[]) => c[0])).toEqual(idsEsperados);
    });

    it('tolera que un job ya no exista o no pueda removerse sin romper la liquidación', async () => {
      mockQueue.remove
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('Job is active and cannot be removed'))
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      const eliminados = await scheduler.cancelarRecordatoriosCuota(cuotaId);

      expect(eliminados).toBe(2);
      expect(mockQueue.remove).toHaveBeenCalledTimes(4);
    });
  });

  describe('registro idempotente del barrido diario', () => {
    it('usa upsertJobScheduler por clave con cron UTC por defecto 09:00', async () => {
      const cron = await scheduler.registrarBarridoDiario();

      expect(cron).toBe('0 9 * * *');
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        JOB_SCHEDULER_BARRIDO_ID,
        { pattern: '0 9 * * *', tz: 'UTC' },
        expect.objectContaining({
          name: JOB_BARRIDO_ESTADOS,
          opts: expect.objectContaining({ attempts: 3 }),
        })
      );
    });

    it('respeta COBRANZA_BARRIDO_CRON cuando está configurado', async () => {
      vi.stubEnv('COBRANZA_BARRIDO_CRON', '30 4 * * *');

      const cron = await scheduler.registrarBarridoDiario();

      expect(cron).toBe('30 4 * * *');
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        JOB_SCHEDULER_BARRIDO_ID,
        { pattern: '30 4 * * *', tz: 'UTC' },
        expect.any(Object)
      );
    });

    it('onModuleInit no derriba el API si Redis falla al registrar (se loguea y continúa)', async () => {
      mockQueue.upsertJobScheduler.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });

    it('las opciones de job cumplen ADR-008: 3 intentos, backoff exponencial 5s y retención acotada', () => {
      expect(OPCIONES_JOBS_COBRANZA).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    });
  });
});

/**
 * WU-H: worker de la cola `cobranza` (recordatorios + barrido diario) con dependencias mock.
 */
describe('RF-008 WU-H: BillingReminderProcessor (DB y despachador mock)', () => {
  const cuotaId = '123e4567-e89b-12d3-a456-426614174000';
  const clienteId = '11111111-1111-4111-8111-111111111111';
  const entrenadorId = '22222222-2222-4222-8222-222222222222';

  let mockDispatcher: any;
  let mockFinanzas: any;

  function cuotaBase(overrides: Record<string, any> = {}) {
    return {
      id: cuotaId,
      clienteId,
      entrenadorId,
      estado: EstadoCuota.EMITIDA,
      montoTotalUsd: '60.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '60.00',
      fechaCorteUtc: new Date('2026-09-15T23:59:59Z'),
      ...overrides,
    };
  }

  function crearDbMock(filas: any[]) {
    const updates: Array<{ set: any; id: any }> = [];
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(filas),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((valores: any) => ({
          where: vi.fn((predicado: any) => {
            updates.push({ set: valores, id: predicado });
            return Promise.resolve(undefined);
          }),
        })),
      })),
    };
    return { db, updates };
  }

  function crearJob(name: string, data: any): Job {
    return { name, data } as Job;
  }

  beforeEach(() => {
    mockDispatcher = { despacharEvento: vi.fn().mockResolvedValue({ inAppId: 'inapp-1' }) };
    mockFinanzas = {
      obtenerTasaVigente: vi.fn().mockResolvedValue({ tasaEfectiva: '60.0000' }),
      proyectarVES: vi.fn((usd: string, tasa: string) =>
        (Number(usd) * Number(tasa)).toFixed(2)
      ),
    };
  });

  describe('recordatorios por hito', () => {
    it('despacha por FINANZAS cuando la cuota sigue con saldo, con saldo dual USD/Bs (T-1)', async () => {
      const { db } = crearDbMock([cuotaBase()]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      const resultado = await processor.process(
        crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_MINUS_1' })
      );

      expect(resultado).toEqual({ enviado: true, motivo: 'despachado' });
      expect(mockDispatcher.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'CUOTA_POR_VENCER',
          destinatarioUserId: clienteId,
          entrenadorId,
          categoria: 'FINANZAS',
          linkAccion: '/app/pagos',
          cuerpo: expect.stringContaining('$60.00 USD (o Bs. 3600.00)'),
        })
      );
    });

    it('NO envía si la cuota ya está saldada (AL_DIA o saldo 0)', async () => {
      const { db } = crearDbMock([
        cuotaBase({ estado: EstadoCuota.AL_DIA, saldoPendienteUsd: '0.00' }),
      ]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      const resultado = await processor.process(
        crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_ZERO' })
      );

      expect(resultado).toEqual({ enviado: false, motivo: 'cuota_saldada' });
      expect(mockDispatcher.despacharEvento).not.toHaveBeenCalled();
    });

    it('PAUSA el envío en PENDIENTE_REVISION (RF-008 Gherkin 2)', async () => {
      const { db } = crearDbMock([cuotaBase({ estado: EstadoCuota.PENDIENTE_REVISION })]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      const resultado = await processor.process(
        crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_PLUS_2' })
      );

      expect(resultado).toEqual({ enviado: false, motivo: 'pausa_revision' });
      expect(mockDispatcher.despacharEvento).not.toHaveBeenCalled();
    });

    it('NO envía sobre cuotas anuladas ni inexistentes', async () => {
      const { db: dbAnulada } = crearDbMock([cuotaBase({ estado: EstadoCuota.ANULADA })]);
      const processorAnulada = new BillingReminderProcessor(dbAnulada, mockDispatcher, mockFinanzas);
      expect(
        await processorAnulada.process(crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_ZERO' }))
      ).toEqual({ enviado: false, motivo: 'cuota_anulada' });

      const { db: dbVacia } = crearDbMock([]);
      const processorVacia = new BillingReminderProcessor(dbVacia, mockDispatcher, mockFinanzas);
      expect(
        await processorVacia.process(crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_ZERO' }))
      ).toEqual({ enviado: false, motivo: 'cuota_no_encontrada' });

      expect(mockDispatcher.despacharEvento).not.toHaveBeenCalled();
    });

    it('adapta el mensaje de T+2 cuando hubo abono parcial (RF-008 §6)', async () => {
      const { db } = crearDbMock([
        cuotaBase({
          estado: EstadoCuota.VENCIDA,
          montoAbonadoUsd: '30.00',
          saldoPendienteUsd: '30.00',
        }),
      ]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      await processor.process(crearJob(JOB_RECORDATORIO_CUOTA, { cuotaId, hito: 'T_PLUS_2' }));

      expect(mockDispatcher.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'CUOTA_VENCIDA',
          cuerpo: expect.stringContaining('parcialmente vencida con un saldo remanente de $30.00 USD'),
        })
      );
    });

    it('los mensajes base respetan las plantillas del RF-008 §4.B', () => {
      expect(construirMensajeRecordatorio('T_MINUS_5', '60.00').cuerpo).toContain(
        'Tu mensualidad vence en 5 días'
      );
      expect(construirMensajeRecordatorio('T_ZERO', '60.00').cuerpo).toContain(
        'Hoy vence tu mensualidad'
      );
      expect(construirMensajeMoraParcial('20.00').cuerpo).toContain('parcialmente vencida');
    });
  });

  describe('barrido diario de estados', () => {
    it('aplica POR_VENCER y VENCIDA y respeta la pausa en revisión', async () => {
      const ahora = new Date();
      const { db, updates } = crearDbMock([
        cuotaBase({
          id: 'cuota-por-vencer',
          estado: EstadoCuota.EMITIDA,
          fechaCorteUtc: new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000), // faltan 3 días
        }),
        cuotaBase({
          id: 'cuota-vencida',
          estado: EstadoCuota.EMITIDA,
          fechaCorteUtc: new Date(ahora.getTime() - 24 * 60 * 60 * 1000), // ya pasó
        }),
        cuotaBase({
          id: 'cuota-en-revision',
          estado: EstadoCuota.PENDIENTE_REVISION,
          fechaCorteUtc: new Date(ahora.getTime() - 24 * 60 * 60 * 1000),
        }),
        cuotaBase({
          id: 'cuota-ya-vencida',
          estado: EstadoCuota.VENCIDA,
          fechaCorteUtc: new Date(ahora.getTime() - 24 * 60 * 60 * 1000),
        }),
      ]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      const resultado = await processor.process(crearJob(JOB_BARRIDO_ESTADOS, {}));

      expect(resultado).toEqual({
        evaluadas: 4,
        actualizadas: 2,
        porVencer: 1,
        vencidas: 2,
      });
      expect(updates).toHaveLength(2);
      expect(updates[0].set.estado).toBe(EstadoCuota.POR_VENCER);
      expect(updates[1].set.estado).toBe(EstadoCuota.VENCIDA);
    });

    it('ignora jobs desconocidos sin romper el worker', async () => {
      const { db } = crearDbMock([]);
      const processor = new BillingReminderProcessor(db, mockDispatcher, mockFinanzas);

      const resultado = await processor.process(crearJob('job-raro', {}));

      expect(resultado).toEqual({ procesado: false });
      expect(mockDispatcher.despacharEvento).not.toHaveBeenCalled();
    });

    it('la cola procesada es la cola de cobranza registrada', () => {
      expect(COBRANZA_QUEUE).toBe('cobranza');
    });
  });
});
