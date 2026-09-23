import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import { Modalidad, PeriodicidadAntropometria, Rol } from '@guachafit/shared';
import {
  CRON_RECORDATORIO_ANTROPOMETRIA_POR_DEFECTO,
  ENV_RECORDATORIO_ANTROPOMETRIA_CRON,
  JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
  JOB_SCHEDULER_ANTROPOMETRIA_ID,
  AntropometriaRecordatorioSchedulerService,
} from '../../src/modules/antropometria/antropometria-recordatorio.scheduler';
import {
  LINK_EXPIRACION_ANTROPOMETRIA,
  TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA,
  TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
  LINK_RECORDATORIO_ANTROPOMETRIA,
  AntropometriaRecordatorioProcessor,
} from '../../src/modules/antropometria/processors/antropometria-recordatorio.processor';
import {
  CheckinAntropometricoExpiradoEvent,
  RecordatorioCheckinAntropometricoEvent,
} from '../../src/modules/notificaciones/events/eventos-notificacion';
import { decidirCanalesNotificacion } from '../../src/modules/notificaciones/matriz-preferencias';
import { construirJobIdNotificacion } from '../../src/modules/notificaciones/notificaciones.config';
import { MENSAJE_RECORDATORIO_ANTROPOMETRIA } from '../../src/modules/antropometria/antropometria-periodicidad.util';

/**
 * WU RF-003a (RF-003 RN-01): recordatorio de las 06:00 locales.
 *
 * Verifica el upsert idempotente del scheduler (patrón resumen-semanal/billing), el barrido del
 * processor (día local programado + sin check-in + sin aviso previo) y el enrutamiento RF-015 de
 * la categoría ANTROPOMETRIA hacia la fila "Check-in Antropométrico" del alumno.
 */
describe('WU RF-003a: recordatorio de check-in antropométrico (RN-01)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const alumnoId = 'a3333333-3333-4333-8333-333333333333';
  const coachId = 'c1111111-1111-4111-8111-111111111111';
  // 2026-09-07 06:00 en Caracas (UTC-4) → el día programado semanal del ancla.
  const AHORA_LUNES_CARACAS_06 = new Date('2026-09-07T10:00:00.000Z');

  const alumnoSemanal = {
    usuarioId: alumnoId,
    entrenadorId: coachId,
    nombres: 'Laura',
    apellidos: 'Remota',
    periodicidad: PeriodicidadAntropometria.SEMANAL,
    inicio: '2026-09-07',
    timezone: 'America/Caracas',
  };

  /** Mismo alumno con modalidad: el aviso de expiración (§6) solo aplica a remotos. */
  const alumnoRemoto = { ...alumnoSemanal, modalidad: Modalidad.REMOTO };

  describe('scheduler (upsert idempotente)', () => {
    let mockQueue: any;
    let scheduler: AntropometriaRecordatorioSchedulerService;

    beforeEach(() => {
      mockQueue = { upsertJobScheduler: vi.fn().mockResolvedValue({ id: 'scheduler-mock' }) };
      scheduler = new AntropometriaRecordatorioSchedulerService(mockQueue);
    });

    it('registra el job repetible cada hora en punto UTC con clave estable', async () => {
      const cron = await scheduler.registrarRecordatorioHorario();

      expect(cron).toBe(CRON_RECORDATORIO_ANTROPOMETRIA_POR_DEFECTO);
      expect(CRON_RECORDATORIO_ANTROPOMETRIA_POR_DEFECTO).toBe('0 * * * *');
      expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
        JOB_SCHEDULER_ANTROPOMETRIA_ID,
        { pattern: '0 * * * *', tz: 'UTC' },
        {
          name: JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
          data: {},
          opts: expect.objectContaining({ attempts: 4 }),
        }
      );
    });

    it('respeta `ANTROPOMETRIA_RECORDATORIO_CRON` y no cae al boot si Redis falla', async () => {
      vi.stubEnv(ENV_RECORDATORIO_ANTROPOMETRIA_CRON, '30 * * * *');
      expect(await scheduler.registrarRecordatorioHorario()).toBe('30 * * * *');

      mockQueue.upsertJobScheduler.mockRejectedValueOnce(new Error('Redis caído'));
      await expect(scheduler.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('processor (barrido del día local)', () => {
    /** Mock secuencial: cada `select()` devuelve la siguiente respuesta configurada. */
    function crearDbBarrido(respuestas: any[][]) {
      let indice = 0;
      const db: any = {
        select: vi.fn(() => {
          const resultado = respuestas[indice++] ?? [];
          const consulta: any = {
            from: vi.fn(() => consulta),
            innerJoin: vi.fn(() => consulta),
            where: vi.fn(() => ({
              then: (resolve: (valor: any) => unknown) => resolve(resultado),
            })),
          };
          return consulta;
        }),
      };
      return db;
    }

    it('emite el recordatorio del día programado al alumno que no ha reportado', async () => {
      const db = crearDbBarrido([[alumnoSemanal], [], []]);
      const emitAsync = vi.fn().mockResolvedValue([]);
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado).toEqual({
        evaluados: 1,
        omitidosPorReporte: 0,
        omitidosPorAviso: 0,
        despachados: 1,
        expiracionesDespachadas: 0,
        expiracionesOmitidasPorMedicion: 0,
        expiracionesOmitidasPorAviso: 0,
      });
      expect(emitAsync).toHaveBeenCalledTimes(1);

      const [nombre, evento] = emitAsync.mock.calls[0];
      expect(nombre).toBe(RecordatorioCheckinAntropometricoEvent.NOMBRE);
      expect(evento.payload).toEqual(
        expect.objectContaining({
          tipoEvento: TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
          categoria: 'ANTROPOMETRIA',
          destinatarioUserId: alumnoId,
          entrenadorId: coachId,
          titulo: 'Hoy es día de check-in',
          cuerpo: MENSAJE_RECORDATORIO_ANTROPOMETRIA,
          linkAccion: LINK_RECORDATORIO_ANTROPOMETRIA,
          referenciaId: 'antropometria_2026-09-07',
          esCriticoSeguridad: false,
        })
      );
      expect(evento.payload.datosAdicionales).toEqual(
        expect.objectContaining({
          alumnoId,
          fechaProgramada: '2026-09-07',
          periodicidad: PeriodicidadAntropometria.SEMANAL,
        })
      );
    });

    it('NO emite si el alumno ya registró su check-in en la ventana ±24 h', async () => {
      const db = crearDbBarrido([
        [alumnoSemanal],
        [{ alumnoId, fechaEvaluacion: '2026-09-06' }],
        [],
      ]);
      const emitAsync = vi.fn();
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado.despachados).toBe(0);
      expect(resultado.omitidosPorReporte).toBe(1);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('NO emite si el aviso de HOY ya está en la bandeja (worker repetido, sin duplicar)', async () => {
      const db = crearDbBarrido([
        [alumnoSemanal],
        [],
        [{ usuarioId: alumnoId, createdAtUtc: new Date('2026-09-07T05:00:00.000Z') }],
      ]);
      const emitAsync = vi.fn();
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado.despachados).toBe(0);
      expect(resultado.omitidosPorAviso).toBe(1);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('el aviso de un día anterior NO bloquea el recordatorio de hoy (idempotencia por día local)', async () => {
      const db = crearDbBarrido([
        [alumnoSemanal],
        [],
        // 2026-09-04 06:00 en Caracas: aviso de un día local anterior.
        [{ usuarioId: alumnoId, createdAtUtc: new Date('2026-09-04T10:00:00.000Z') }],
      ]);
      const emitAsync = vi.fn().mockResolvedValue([]);
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado.omitidosPorAviso).toBe(0);
      expect(resultado.despachados).toBe(1);
    });

    it('no emite fuera de la hora local del recordatorio ni en días no programados', async () => {
      // 07:00 en Caracas: la pasada horaria de las 07:00 no es la del recordatorio.
      const dbSiete = crearDbBarrido([[alumnoSemanal]]);
      const emitAsyncSiete = vi.fn();
      const processorSiete = new AntropometriaRecordatorioProcessor(dbSiete, {
        emitAsync: emitAsyncSiete,
      } as any);
      const aLasSiete = await processorSiete.generarYDespachar(
        new Date('2026-09-07T11:00:00.000Z')
      );
      expect(aLasSiete.despachados).toBe(0);
      expect(emitAsyncSiete).not.toHaveBeenCalled();
      // Solo se consultaron calendarios: sin candidatos no se toca la BD de controles.
      expect(dbSiete.select).toHaveBeenCalledTimes(1);

      // Martes 06:00 local: día no programado del calendario semanal del lunes.
      const dbMartes = crearDbBarrido([[alumnoSemanal]]);
      const emitAsyncMartes = vi.fn();
      const processorMartes = new AntropometriaRecordatorioProcessor(dbMartes, {
        emitAsync: emitAsyncMartes,
      } as any);
      const elMartes = await processorMartes.generarYDespachar(
        new Date('2026-09-08T10:00:00.000Z')
      );
      expect(elMartes.despachados).toBe(0);
      expect(emitAsyncMartes).not.toHaveBeenCalled();
    });

    it('sin alumnos con calendario configurado no consulta nada más', async () => {
      const db = crearDbBarrido([[]]);
      const emitAsync = vi.fn();
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado).toEqual({
        evaluados: 0,
        omitidosPorReporte: 0,
        omitidosPorAviso: 0,
        despachados: 0,
        expiracionesDespachadas: 0,
        expiracionesOmitidasPorMedicion: 0,
        expiracionesOmitidasPorAviso: 0,
      });
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('un fallo al despachar un alumno NO cancela el recordatorio de los demás', async () => {
      const otroAlumno = {
        ...alumnoSemanal,
        usuarioId: 'a4444444-4444-4444-8444-444444444444',
      };
      const db = crearDbBarrido([[alumnoSemanal, otroAlumno], [], []]);
      const emitAsync = vi
        .fn()
        .mockRejectedValueOnce(new Error('Redis no disponible'))
        .mockResolvedValueOnce([]);
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.generarYDespachar(AHORA_LUNES_CARACAS_06);

      expect(resultado.evaluados).toBe(2);
      expect(resultado.despachados).toBe(1);
      expect(emitAsync).toHaveBeenCalledTimes(2);
    });

    /**
     * WU "RF-003 · cierre" (§6): el barrido también detecta alumnos REMOTOS con la última fecha
     * programada vencida sin medición y avisa al coach una vez por fecha (referencia determinista).
     */
    describe('§6: aviso de ventana vencida al coach', () => {
      it('la ventana abierta (día programado) NO emite expiración', async () => {
        // 07:00 Caracas del lunes programado: fuera de la hora del recordatorio y sin ventana vencida.
        const db = crearDbBarrido([[alumnoRemoto]]);
        const emitAsync = vi.fn();
        const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

        const resultado = await processor.generarYDespachar(
          new Date('2026-09-07T11:00:00.000Z')
        );

        expect(resultado.expiracionesDespachadas).toBe(0);
        expect(emitAsync).not.toHaveBeenCalled();
        // Sin candidatos de expiración solo se consultó el calendario de alumnos.
        expect(db.select).toHaveBeenCalledTimes(1);
      });

      it('emite el aviso al coach cuando la ventana cerró sin check-in', async () => {
        const db = crearDbBarrido([[alumnoRemoto], [], []]);
        const emitAsync = vi.fn().mockResolvedValue([]);
        const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

        // Martes 06:00 Caracas: la ventana del lunes 2026-09-07 ya cerró (00:00 local del martes).
        const resultado = await processor.generarYDespachar(
          new Date('2026-09-08T10:00:00.000Z')
        );

        expect(resultado.expiracionesDespachadas).toBe(1);
        expect(resultado.expiracionesOmitidasPorMedicion).toBe(0);
        expect(resultado.expiracionesOmitidasPorAviso).toBe(0);
        expect(emitAsync).toHaveBeenCalledTimes(1);

        const [nombre, evento] = emitAsync.mock.calls[0];
        expect(nombre).toBe(CheckinAntropometricoExpiradoEvent.NOMBRE);
        expect(evento.payload).toEqual(
          expect.objectContaining({
            tipoEvento: TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA,
            destinatarioUserId: coachId,
            entrenadorId: coachId,
            categoria: 'ANTROPOMETRIA',
            titulo: 'Check-in antropométrico vencido',
            cuerpo: 'Laura Remota no completó su medición del 2026-09-07; considera reprogramar.',
            linkAccion: LINK_EXPIRACION_ANTROPOMETRIA,
            referenciaId: `antropometria_expirado_${alumnoId}_2026-09-07`,
            esCriticoSeguridad: false,
          })
        );
        expect(evento.payload.datosAdicionales).toEqual(
          expect.objectContaining({
            alumnoId,
            fechaProgramada: '2026-09-07',
            periodicidad: PeriodicidadAntropometria.SEMANAL,
          })
        );
      });

      it('NO emite si hubo una medición desde que abrió la ventana', async () => {
        const db = crearDbBarrido([
          [alumnoRemoto],
          [{ alumnoId, fechaEvaluacion: '2026-09-07' }],
          [],
        ]);
        const emitAsync = vi.fn();
        const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

        const resultado = await processor.generarYDespachar(
          new Date('2026-09-08T10:00:00.000Z')
        );

        expect(resultado.expiracionesDespachadas).toBe(0);
        expect(resultado.expiracionesOmitidasPorMedicion).toBe(1);
        expect(emitAsync).not.toHaveBeenCalled();
      });

      it('el worker repetido NO duplica: la referencia de esa fecha ya está en la bandeja del coach', async () => {
        const db = crearDbBarrido([
          [alumnoRemoto],
          [],
          [
            {
              usuarioId: coachId,
              referenciaId: `antropometria_expirado_${alumnoId}_2026-09-07`,
            },
          ],
        ]);
        const emitAsync = vi.fn();
        const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

        const resultado = await processor.generarYDespachar(
          new Date('2026-09-08T10:00:00.000Z')
        );

        expect(resultado.expiracionesDespachadas).toBe(0);
        expect(resultado.expiracionesOmitidasPorAviso).toBe(1);
        expect(emitAsync).not.toHaveBeenCalled();
      });

      it('NO expira para alumnos presenciales (solo remotos con periodicidad)', async () => {
        const alumnoPresencial = { ...alumnoRemoto, modalidad: Modalidad.PRESENCIAL };
        const db = crearDbBarrido([[alumnoPresencial]]);
        const emitAsync = vi.fn();
        const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

        const resultado = await processor.generarYDespachar(
          new Date('2026-09-08T10:00:00.000Z')
        );

        expect(resultado.expiracionesDespachadas).toBe(0);
        expect(emitAsync).not.toHaveBeenCalled();
        expect(db.select).toHaveBeenCalledTimes(1);
      });

      it('el jobId de push/email es determinista por coach + alumno + fecha programada', () => {
        const payload = {
          tipoEvento: TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA,
          destinatarioUserId: coachId,
          categoria: 'ANTROPOMETRIA' as const,
          titulo: 'Check-in antropométrico vencido',
          cuerpo: 'Laura Remota no completó su medición del 2026-09-07; considera reprogramar.',
          referenciaId: `antropometria_expirado_${alumnoId}_2026-09-07`,
        };

        const jobId = construirJobIdNotificacion(
          payload,
          new Date('2026-09-08T10:00:00.000Z')
        );

        expect(jobId).toBe(
          `notif_ANTROPOMETRIA_${TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA}_${coachId}_` +
            `antropometria_expirado_${alumnoId}_2026-09-07_20260908`
        );
      });
    });

    it('ignora jobs desconocidos de la cola', async () => {
      const db = crearDbBarrido([]);
      const emitAsync = vi.fn();
      const processor = new AntropometriaRecordatorioProcessor(db, { emitAsync } as any);

      const resultado = await processor.process({
        name: 'job-raro',
        data: {},
      } as unknown as Job);

      expect(resultado).toEqual({ procesado: false });
      expect(emitAsync).not.toHaveBeenCalled();
    });
  });

  describe('RF-015: enrutamiento del aviso por la fila del alumno', () => {
    it('la categoría ANTROPOMETRIA resuelve CHECKIN_ANTROPOMETRICO con las preferencias del alumno', () => {
      const payload = {
        tipoEvento: TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
        destinatarioUserId: alumnoId,
        categoria: 'ANTROPOMETRIA' as const,
        titulo: 'Hoy es día de check-in',
        cuerpo: MENSAJE_RECORDATORIO_ANTROPOMETRIA,
        referenciaId: 'antropometria_2026-09-07',
        esCriticoSeguridad: false,
      };

      const decision = decidirCanalesNotificacion(payload, Rol.ALUMNO, {
        notifyCheckinsPush: true,
        notifyCheckinsEmail: false,
      });

      expect(decision.filaMatriz).toBe('CHECKIN_ANTROPOMETRICO');
      expect(decision.push).toBe(true);
      expect(decision.email).toBe(false);
      // La categoría no es crítica: ningún canal se fuerza.
      expect(decision.emailForzado).toBe(false);
      expect(decision.pushForzado).toBe(false);
    });

    it('el jobId de push/email es determinista por alumno+fecha (reintentos no duplican)', () => {
      const payload = {
        tipoEvento: TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
        destinatarioUserId: alumnoId,
        categoria: 'ANTROPOMETRIA' as const,
        titulo: 'Hoy es día de check-in',
        cuerpo: MENSAJE_RECORDATORIO_ANTROPOMETRIA,
        referenciaId: 'antropometria_2026-09-07',
      };

      const primeraPasada = construirJobIdNotificacion(
        payload,
        new Date('2026-09-07T10:00:00.000Z')
      );
      const segundaPasada = construirJobIdNotificacion(
        payload,
        new Date('2026-09-07T10:00:05.000Z')
      );

      expect(primeraPasada).toBe(segundaPasada);
      expect(primeraPasada).toBe(
        `notif_ANTROPOMETRIA_${TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA}_${alumnoId}_antropometria_2026-09-07_20260907`
      );
    });
  });
});
