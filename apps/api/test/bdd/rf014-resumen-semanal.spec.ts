import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import {
  CRON_RESUMEN_SEMANAL_POR_DEFECTO,
  ENV_RESUMEN_SEMANAL_CRON,
  JOB_GENERAR_RESUMEN_SEMANAL,
  JOB_SCHEDULER_RESUMEN_SEMANAL_ID,
  ResumenSemanalSchedulerService,
} from '../../src/modules/notificaciones/resumen-semanal.scheduler';
import {
  ResumenSemanalProcessor,
  construirCuerpoResumenSemanal,
} from '../../src/modules/notificaciones/processors/resumen-semanal.processor';
import { ResumenSemanalCoachEvent } from '../../src/modules/notificaciones/events/eventos-notificacion';
import { COLA_RESUMEN_SEMANAL, OPCIONES_JOB_RESUMEN_SEMANAL } from '../../src/modules/notificaciones/notificaciones.config';
import { EstadoCuota } from '@guachafit/shared';

/**
 * Ola 3 (RF-014/RF-015 §B): digest semanal del coach.
 *
 * Verifica el upsert idempotente del scheduler (patrón billing-scheduler), el compositor puro del
 * cuerpo y el pipeline del processor: agrega adherencia + cobros/por vencer por coach y publica un
 * evento por coach (un fallo puntual no cancela el resto).
 */
describe('Ola 3: resumen semanal del coach', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('scheduler (upsert idempotente)', () => {
    let mockQueue: any;
    let scheduler: ResumenSemanalSchedulerService;

    beforeEach(() => {
      mockQueue = { upsertJobScheduler: vi.fn().mockResolvedValue({ id: 'scheduler-mock' }) };
      scheduler = new ResumenSemanalSchedulerService(mockQueue);
    });

    it('registra el job repetible semanal con el cron por defecto (lunes 08:00 UTC)', async () => {
      const cron = await scheduler.registrarResumenSemanal();

      expect(cron).toBe(CRON_RESUMEN_SEMANAL_POR_DEFECTO);
      expect(CRON_RESUMEN_SEMANAL_POR_DEFECTO).toBe('0 8 * * 1');
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        JOB_SCHEDULER_RESUMEN_SEMANAL_ID,
        { pattern: '0 8 * * 1', tz: 'UTC' },
        {
          name: JOB_GENERAR_RESUMEN_SEMANAL,
          data: {},
          opts: OPCIONES_JOB_RESUMEN_SEMANAL,
        }
      );
    });

    it('respeta `RESUMEN_SEMANAL_CRON` y no cae al boot si Redis falla', async () => {
      vi.stubEnv(ENV_RESUMEN_SEMANAL_CRON, '0 9 * * 5');
      expect(await scheduler.registrarResumenSemanal()).toBe('0 9 * * 5');

      mockQueue.upsertJobScheduler.mockRejectedValueOnce(new Error('Redis caído'));
      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('compositor del cuerpo (puro)', () => {
    it('incluye adherencia, cobros y cartera sin inventar datos', () => {
      const cuerpo = construirCuerpoResumenSemanal({
        coachNombre: 'Studio Ana',
        alumnosActivos: 2,
        sesionesCompletadas: 3,
        sesionesProgramadas: 6,
        cobradoUsd: '120.00',
        cuotasPorVencer: 2,
        cuotasEnMora: 1,
      });

      expect(cuerpo).toContain('Hola Studio Ana');
      expect(cuerpo).toContain('3 de 6 sesiones completadas (50%)');
      expect(cuerpo).toContain('$120.00 USD cobrados');
      expect(cuerpo).toContain('2 cuota(s) por vencer');
      expect(cuerpo).toContain('1 en mora');
    });

    it('sin sesiones programadas no divide por cero', () => {
      const cuerpo = construirCuerpoResumenSemanal({
        coachNombre: 'Luis Pérez',
        alumnosActivos: 0,
        sesionesCompletadas: 0,
        sesionesProgramadas: 0,
        cobradoUsd: '0.00',
        cuotasPorVencer: 0,
        cuotasEnMora: 0,
      });

      expect(cuerpo).toContain('0 sesiones completadas (sin sesiones programadas esta semana)');
    });
  });

  describe('processor', () => {
    const ahora = new Date('2026-09-22T08:00:00.000Z');

    /** Mock secuencial: cada `select()` devuelve la siguiente respuesta configurada. */
    function crearDbDigest(respuestas: any[][]) {
      let indice = 0;
      const db: any = {
        select: vi.fn(() => {
          const resultado = respuestas[indice++] ?? [];
          const consulta: any = {
            from: vi.fn(() => consulta),
            innerJoin: vi.fn(() => consulta),
            where: vi.fn(() => ({
              groupBy: vi.fn(async () => resultado),
              then: (resolve: (valor: any) => unknown) => resolve(resultado),
            })),
          };
          return consulta;
        }),
      };
      return db;
    }

    function respuestasDigest() {
      return [
        // 1. Coaches activos.
        [
          {
            usuarioId: 'coach-1',
            nombres: 'Ana',
            apellidos: 'Gómez',
            nombreComercial: 'Studio Ana',
          },
          { usuarioId: 'coach-2', nombres: 'Luis', apellidos: 'Pérez', nombreComercial: null },
        ],
        // 2. Alumnos activos.
        [
          { usuarioId: 'alumno-1', entrenadorId: 'coach-1' },
          { usuarioId: 'alumno-2', entrenadorId: 'coach-1' },
        ],
        // 3. Sesiones completadas en la ventana.
        [{ alumnoId: 'alumno-1', total: 3 }],
        // 4. Sesiones programadas en la ventana.
        [
          { alumnoId: 'alumno-1', total: 4 },
          { alumnoId: 'alumno-2', total: 2 },
        ],
        // 5. Cobros aprobados de la ventana.
        [{ entrenadorId: 'coach-1', total: '120.00' }],
        // 6. Cartera por estado.
        [
          { entrenadorId: 'coach-1', estado: EstadoCuota.POR_VENCER, total: 2 },
          { entrenadorId: 'coach-1', estado: EstadoCuota.VENCIDA, total: 1 },
        ],
      ];
    }

    it('agrega métricas por coach y publica un evento por coach', async () => {
      const db = crearDbDigest(respuestasDigest());
      const emitAsync = vi.fn().mockResolvedValue([]);
      const processor = new ResumenSemanalProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(ahora);

      expect(resultado).toEqual({ coaches: 2, despachados: 2 });
      expect(emitAsync).toHaveBeenCalledTimes(2);

      const [nombre1, evento1] = emitAsync.mock.calls[0];
      expect(nombre1).toBe(ResumenSemanalCoachEvent.NOMBRE);
      expect(evento1.payload).toEqual(
        expect.objectContaining({
          tipoEvento: 'RESUMEN_SEMANAL_COACH',
          categoria: 'RESUMEN_SEMANAL',
          destinatarioUserId: 'coach-1',
          entrenadorId: 'coach-1',
          linkAccion: '/coach',
          referenciaId: 'semana_2026-09-22',
        })
      );
      expect(evento1.payload.cuerpo).toContain('Hola Studio Ana');
      expect(evento1.payload.cuerpo).toContain('3 de 6 sesiones completadas (50%)');
      expect(evento1.payload.cuerpo).toContain('$120.00 USD cobrados');
      expect(evento1.payload.datosAdicionales).toEqual(
        expect.objectContaining({
          alumnosActivos: 2,
          sesionesCompletadas: 3,
          sesionesProgramadas: 6,
          cobradoUsd: '120.00',
          cuotasPorVencer: 2,
          cuotasEnMora: 1,
        })
      );

      const [, evento2] = emitAsync.mock.calls[1];
      expect(evento2.payload.destinatarioUserId).toBe('coach-2');
      expect(evento2.payload.cuerpo).toContain('Hola Luis Pérez');
      expect(evento2.payload.cuerpo).toContain('$0.00 USD cobrados');
      expect(evento2.payload.datosAdicionales).toEqual(
        expect.objectContaining({ alumnosActivos: 0, cuotasPorVencer: 0, cuotasEnMora: 0 })
      );
    });

    it('un fallo al despachar un coach NO cancela el digest de los demás', async () => {
      const db = crearDbDigest(respuestasDigest());
      const emitAsync = vi
        .fn()
        .mockRejectedValueOnce(new Error('Redis no disponible'))
        .mockResolvedValueOnce([]);
      const processor = new ResumenSemanalProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(ahora);

      expect(resultado).toEqual({ coaches: 2, despachados: 1 });
      expect(emitAsync).toHaveBeenCalledTimes(2);
    });

    it('ignora jobs desconocidos sin emitir nada', async () => {
      const db = crearDbDigest([]);
      const emitAsync = vi.fn();
      const processor = new ResumenSemanalProcessor(db, { emitAsync } as any);

      const resultado = await processor.process({
        name: 'job-raro',
        data: {},
      } as unknown as Job);

      expect(resultado).toEqual({ procesado: false });
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('sin coaches activos no consulta métricas ni emite', async () => {
      const db = crearDbDigest([[]]);
      const emitAsync = vi.fn();
      const processor = new ResumenSemanalProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(ahora);

      expect(resultado).toEqual({ coaches: 0, despachados: 0 });
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('la cola del digest es la registrada en la configuración', () => {
      expect(COLA_RESUMEN_SEMANAL).toBe('notificaciones-resumen-semanal');
      expect(JOB_GENERAR_RESUMEN_SEMANAL).toBe('generar-resumen-semanal');
    });
  });
});
