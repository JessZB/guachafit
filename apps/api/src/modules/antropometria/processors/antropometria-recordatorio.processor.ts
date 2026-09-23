/**
 * RF-003 RN-01 / §6 (WU RF-003a + cierre): barrido periódico del check-in antropométrico.
 *
 * Ejecuta el job repetible que registra `AntropometriaRecordatorioSchedulerService` y, para cada
 * alumno con calendario configurado por el coach:
 *
 * 1. Resuelve su día/hora LOCALES (zona IANA de `usuarios.timezone`).
 * 2. Solo actúa si hoy es una fecha programada por la periodicidad (RN-01) Y su hora local es la
 *    del recordatorio (06:00). Ese doble filtro es lo que permite un único cron UTC de 15 min.
 * 3. Descarta a quien ya registró un check-in dentro de la ventana de 48 h ([D-1 00:00, D+1 00:00)
 *    local) de su fecha programada.
 * 4. Descarta a quien ya tiene el aviso persistido en su bandeja In-App desde su medianoche local:
 *    así una segunda ejecución del worker (reintento, doble proceso) NO duplica el aviso.
 * 5. Publica `RecordatorioCheckinAntropometricoEvent` en el bus: el despachador persiste el aviso
 *    In-App y encola Push/Email por la fila "Check-in Antropométrico" de RF-015 §A, con
 *    `jobId` determinista (`notif_ANTROPOMETRIA_{tipo}_{alumno}_{referencia}_{YYYYMMDD}`).
 *
 * Y además, en la misma pasada (§6, WU "RF-003 · cierre"): detecta alumnos REMOTOS con periodicidad
 * cuya última fecha programada ya cerró su ventana sin medición y avisa al coach una vez por fecha
 * (`CheckinAntropometricoExpiradoEvent`, referencia determinista alumno + fecha programada).
 */
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Database,
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  perfilesAlumno,
  usuarios,
  controlesAntropometricos,
  notificacionesInApp,
} from '@guachafit/database';
import {
  COLA_ANTROPOMETRIA_RECORDATORIO,
} from '../../notificaciones/notificaciones.config';
import { DRIZZLE_DB } from '../../../database/database.module';
import { EstadoAlumno, Modalidad, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  fechaAnteriorYyyyMmDd,
  instanteUtcDesdeMedianocheLocal,
} from '../../../common/adherencia.util';
import {
  MENSAJE_RECORDATORIO_ANTROPOMETRIA,
  evaluarExpiracionAntropometria,
  evaluarRecordatorioAntropometria,
  sumarDiasCalendario,
} from '../antropometria-periodicidad.util';
import {
  JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
} from '../antropometria-recordatorio.scheduler';
import {
  CheckinAntropometricoExpiradoEvent,
  RecordatorioCheckinAntropometricoEvent,
} from '../../notificaciones/events/eventos-notificacion';

/** Tipo de evento persistido en la bandeja: prefijo `ANTROPOMETRIA_` (icono de progreso físico). */
export const TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA =
  'ANTROPOMETRIA_RECORDATORIO_CHECKIN' as const;

/** Ruta real del router web con el formulario de check-in del alumno. */
export const LINK_RECORDATORIO_ANTROPOMETRIA = '/app/progreso';

/** §6: aviso de ventana cerrada sin check-in (prefijo `CHECKIN_` → categoría visual antropometría). */
export const TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA =
  'CHECKIN_ANTROPOMETRICO_EXPIRADO' as const;

/** Ruta real de la cola de revisión antropométrica del coach (router web). */
export const LINK_EXPIRACION_ANTROPOMETRIA = '/coach/antropometria';

export interface ResultadoRecordatorioAntropometria {
  /** Alumnos con calendario configurado evaluados en esta pasada. */
  evaluados: number;
  /** Alumnos descartados porque ya registraron su check-in en la ventana de 48 h ([D-1, D+1) local). */
  omitidosPorReporte: number;
  /** Alumnos descartados porque el aviso de hoy ya está en su bandeja (idempotencia). */
  omitidosPorAviso: number;
  /** Recordatorios emitidos al bus de notificaciones. */
  despachados: number;
}

/** Resultado combinado del barrido periódico: recordatorio (RN-01) + expiraciones (§6). */
export interface ResultadoBarridoAntropometria extends ResultadoRecordatorioAntropometria {
  /** Avisos de ventana vencida emitidos al coach en esta pasada. */
  expiracionesDespachadas: number;
  /** Alumnos descartados porque ya tienen una medición posterior al inicio de la ventana. */
  expiracionesOmitidasPorMedicion: number;
  /** Alumnos descartados porque el aviso de esa fecha ya está en la bandeja del coach. */
  expiracionesOmitidasPorAviso: number;
}

interface AlumnoConCalendario {
  usuarioId: string;
  entrenadorId: string;
  nombres: string;
  apellidos: string;
  modalidad: Modalidad;
  periodicidad: PeriodicidadAntropometria;
  inicio: string;
  timezone: string | null;
}

@Processor(COLA_ANTROPOMETRIA_RECORDATORIO)
export class AntropometriaRecordatorioProcessor extends WorkerHost {
  private readonly logger = new Logger(AntropometriaRecordatorioProcessor.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly eventEmitter: EventEmitter2
  ) {
    super();
  }

  async process(
    job: Job
  ): Promise<ResultadoBarridoAntropometria | { procesado: false }> {
    if (job.name !== JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA) {
      this.logger.warn(
        `Job desconocido '${job.name}' en la cola ${COLA_ANTROPOMETRIA_RECORDATORIO}; ignorado.`
      );
      return { procesado: false };
    }
    return this.generarYDespachar();
  }

  /** Barrido principal (parametrizable en tests con un instante fijo). */
  async generarYDespachar(ahora: Date = new Date()): Promise<ResultadoBarridoAntropometria> {
    const alumnos = await this.cargarAlumnosConCalendario();

    const recordatorio = await this.despacharRecordatorios(alumnos, ahora);
    const expiracion = await this.despacharExpiraciones(alumnos, ahora);

    return { ...recordatorio, ...expiracion };
  }

  /** Alumnos con calendario configurado (modalidad incluida: §6 solo avisa a remotos). */
  private async cargarAlumnosConCalendario(): Promise<AlumnoConCalendario[]> {
    return (await this.db
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
        modalidad: perfilesAlumno.modalidad,
        periodicidad: perfilesAlumno.periodicidadAntropometria,
        inicio: perfilesAlumno.antropometriaInicio,
        timezone: usuarios.timezone,
      })
      .from(perfilesAlumno)
      .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
      .where(
        and(
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
          isNull(perfilesAlumno.deletedAtUtc),
          isNotNull(perfilesAlumno.periodicidadAntropometria),
          isNotNull(perfilesAlumno.antropometriaInicio)
        )
      )) as AlumnoConCalendario[];
  }

  /** RN-01: recordatorio del día programado a la hora local del alumno (06:00). */
  private async despacharRecordatorios(
    alumnos: AlumnoConCalendario[],
    ahora: Date
  ): Promise<ResultadoRecordatorioAntropometria> {
    if (alumnos.length === 0) {
      return { evaluados: 0, omitidosPorReporte: 0, omitidosPorAviso: 0, despachados: 0 };
    }

    // Día programado + hora local del recordatorio (RN-01).
    const candidatos = alumnos
      .map((alumno) => ({
        alumno,
        recordatorio: evaluarRecordatorioAntropometria({
          periodicidad: alumno.periodicidad,
          antropometriaInicio: alumno.inicio,
          timezone: alumno.timezone,
          ahora,
        }),
      }))
      .filter(({ recordatorio }) => recordatorio.corresponde && recordatorio.fechaProgramada);

    if (candidatos.length === 0) {
      return {
        evaluados: alumnos.length,
        omitidosPorReporte: 0,
        omitidosPorAviso: 0,
        despachados: 0,
      };
    }

    const alumnoIds = candidatos.map(({ alumno }) => alumno.usuarioId);

    // Rango global (inclusivo) de fechas de control a consultar: la ventana de 48 h de cada
    // candidato se resuelve después en memoria con su propio día local.
    const desdeGlobal = candidatos
      .map(({ recordatorio }) => fechaAnteriorYyyyMmDd(recordatorio.fechaProgramada!, 1))
      .sort()[0];
    const hastaGlobal = candidatos
      .map(({ recordatorio }) => sumarDiasCalendario(recordatorio.fechaProgramada!, 1))
      .sort()
      .at(-1)!;
    const inicioAvisoGlobalUtc = new Date(
      Math.min(
        ...candidatos.map(({ alumno, recordatorio }) =>
          instanteUtcDesdeMedianocheLocal(recordatorio.fechaProgramada!, alumno.timezone).getTime()
        )
      )
    );

    const controles = (await this.db
      .select({
        alumnoId: controlesAntropometricos.alumnoId,
        fechaEvaluacion: controlesAntropometricos.fechaEvaluacion,
      })
      .from(controlesAntropometricos)
      .where(
        and(
          inArray(controlesAntropometricos.alumnoId, alumnoIds),
          gte(controlesAntropometricos.fechaEvaluacion, desdeGlobal),
          lte(controlesAntropometricos.fechaEvaluacion, hastaGlobal)
        )
      )) as Array<{ alumnoId: string; fechaEvaluacion: string }>;

    // Idempotencia: avisos del MISMO tipo persistidos desde la medianoche local de cada alumno.
    const avisosPrevios = (await this.db
      .select({
        usuarioId: notificacionesInApp.usuarioId,
        createdAtUtc: notificacionesInApp.createdAtUtc,
      })
      .from(notificacionesInApp)
      .where(
        and(
          inArray(notificacionesInApp.usuarioId, alumnoIds),
          eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA),
          gte(notificacionesInApp.createdAtUtc, inicioAvisoGlobalUtc)
        )
      )) as Array<{ usuarioId: string; createdAtUtc: Date | string }>;

    let omitidosPorReporte = 0;
    let omitidosPorAviso = 0;
    let despachados = 0;

    for (const { alumno, recordatorio } of candidatos) {
      const fechaProgramada = recordatorio.fechaProgramada!;
      const desdeVentana = fechaAnteriorYyyyMmDd(fechaProgramada, 1);
      const hastaVentana = sumarDiasCalendario(fechaProgramada, 1);

      const yaReporto = controles.some(
        (control) =>
          control.alumnoId === alumno.usuarioId &&
          control.fechaEvaluacion >= desdeVentana &&
          control.fechaEvaluacion <= hastaVentana
      );

      if (yaReporto) {
        omitidosPorReporte += 1;
        continue;
      }

      const inicioAvisoLocal = instanteUtcDesdeMedianocheLocal(
        fechaProgramada,
        alumno.timezone
      ).getTime();
      const yaAvisado = avisosPrevios.some((aviso) => {
        if (aviso.usuarioId !== alumno.usuarioId) return false;
        const creado = new Date(aviso.createdAtUtc);
        return !Number.isNaN(creado.getTime()) && creado.getTime() >= inicioAvisoLocal;
      });

      if (yaAvisado) {
        omitidosPorAviso += 1;
        continue;
      }

      try {
        await this.eventEmitter.emitAsync(
          RecordatorioCheckinAntropometricoEvent.NOMBRE,
          new RecordatorioCheckinAntropometricoEvent({
            tipoEvento: TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
            destinatarioUserId: alumno.usuarioId,
            entrenadorId: alumno.entrenadorId,
            categoria: 'ANTROPOMETRIA',
            titulo: 'Hoy es día de check-in',
            cuerpo: MENSAJE_RECORDATORIO_ANTROPOMETRIA,
            linkAccion: LINK_RECORDATORIO_ANTROPOMETRIA,
            // RNF-004 §3: referencia determinista por alumno+fecha local (dedupe de push/email).
            referenciaId: recordatorio.referenciaId ?? undefined,
            datosAdicionales: {
              alumnoId: alumno.usuarioId,
              fechaProgramada,
              periodicidad: alumno.periodicidad,
            },
            esCriticoSeguridad: false,
          })
        );
        despachados += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo despachar el recordatorio antropométrico del alumno ${alumno.usuarioId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.logger.log(
      `Recordatorio antropométrico: ${despachados} despachados, ${omitidosPorReporte} ya reportaron, ` +
        `${omitidosPorAviso} ya avisados (${alumnos.length} alumnos con calendario evaluados).`
    );

    return {
      evaluados: alumnos.length,
      omitidosPorReporte,
      omitidosPorAviso,
      despachados,
    };
  }

  /**
   * §6: avisa al coach cuando la última fecha programada de un alumno REMOTO cerró su ventana sin
   * medición. Un aviso por fecha programada: la referencia determinista (alumno + fecha) permite
   * pre-chequear la bandeja del coach y no duplicar entre corridas del worker.
   *
   * "Sin check-in" se evalúa contra controles con `fechaEvaluacion >= D-1` (el día en que abrió la
   * ventana): una medición tomada después (p. ej. el coach reprogramó la toma en sala) también
   * cuenta como atendida y silencia el aviso.
   */
  private async despacharExpiraciones(
    alumnos: AlumnoConCalendario[],
    ahora: Date
  ): Promise<
    Pick<
      ResultadoBarridoAntropometria,
      'expiracionesDespachadas' | 'expiracionesOmitidasPorMedicion' | 'expiracionesOmitidasPorAviso'
    >
  > {
    const candidatos = alumnos
      .filter((alumno) => alumno.modalidad === Modalidad.REMOTO)
      .map((alumno) => ({
        alumno,
        expiracion: evaluarExpiracionAntropometria({
          alumnoId: alumno.usuarioId,
          periodicidad: alumno.periodicidad,
          antropometriaInicio: alumno.inicio,
          timezone: alumno.timezone,
          ahora,
        }),
      }))
      .filter(({ expiracion }) => expiracion.expirado && expiracion.fechaProgramada);

    if (candidatos.length === 0) {
      return {
        expiracionesDespachadas: 0,
        expiracionesOmitidasPorMedicion: 0,
        expiracionesOmitidasPorAviso: 0,
      };
    }

    const alumnoIds = candidatos.map(({ alumno }) => alumno.usuarioId);
    const coachIds = [...new Set(candidatos.map(({ alumno }) => alumno.entrenadorId))];
    const referencias = candidatos.map(({ expiracion }) => expiracion.referenciaId!);

    // Cota inferior global: la ventana de cada fecha programada `D` abre en `D-1` local. Sin cota
    // superior a propósito (una medición posterior también cuenta como atendida).
    const desdeGlobal = candidatos
      .map(({ expiracion }) => fechaAnteriorYyyyMmDd(expiracion.fechaProgramada!, 1))
      .sort()[0];

    const controles = (await this.db
      .select({
        alumnoId: controlesAntropometricos.alumnoId,
        fechaEvaluacion: controlesAntropometricos.fechaEvaluacion,
      })
      .from(controlesAntropometricos)
      .where(
        and(
          inArray(controlesAntropometricos.alumnoId, alumnoIds),
          gte(controlesAntropometricos.fechaEvaluacion, desdeGlobal)
        )
      )) as Array<{ alumnoId: string; fechaEvaluacion: string }>;

    // Idempotencia exacta por referencia determinista: el aviso de esa fecha programada ya emitido
    // para el coach (una segunda corrida del worker no duplica).
    const avisosPrevios = (await this.db
      .select({
        usuarioId: notificacionesInApp.usuarioId,
        referenciaId: notificacionesInApp.referenciaId,
      })
      .from(notificacionesInApp)
      .where(
        and(
          inArray(notificacionesInApp.usuarioId, coachIds),
          eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA),
          inArray(notificacionesInApp.referenciaId, referencias)
        )
      )) as Array<{ usuarioId: string; referenciaId: string | null }>;

    let expiracionesDespachadas = 0;
    let expiracionesOmitidasPorMedicion = 0;
    let expiracionesOmitidasPorAviso = 0;

    for (const { alumno, expiracion } of candidatos) {
      const fechaProgramada = expiracion.fechaProgramada!;
      const desdeVentana = fechaAnteriorYyyyMmDd(fechaProgramada, 1);

      const yaMedido = controles.some(
        (control) =>
          control.alumnoId === alumno.usuarioId && control.fechaEvaluacion >= desdeVentana
      );
      if (yaMedido) {
        expiracionesOmitidasPorMedicion += 1;
        continue;
      }

      const yaAvisado = avisosPrevios.some(
        (aviso) =>
          aviso.usuarioId === alumno.entrenadorId &&
          aviso.referenciaId === expiracion.referenciaId
      );
      if (yaAvisado) {
        expiracionesOmitidasPorAviso += 1;
        continue;
      }

      const nombre = `${alumno.nombres} ${alumno.apellidos}`.trim();

      try {
        await this.eventEmitter.emitAsync(
          CheckinAntropometricoExpiradoEvent.NOMBRE,
          new CheckinAntropometricoExpiradoEvent({
            tipoEvento: TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA,
            destinatarioUserId: alumno.entrenadorId,
            entrenadorId: alumno.entrenadorId,
            categoria: 'ANTROPOMETRIA',
            titulo: 'Check-in antropométrico vencido',
            cuerpo: `${nombre} no completó su medición del ${fechaProgramada}; considera reprogramar.`,
            linkAccion: LINK_EXPIRACION_ANTROPOMETRIA,
            // RNF-004 §3: referencia determinista por alumno + fecha programada (dedupe).
            referenciaId: expiracion.referenciaId ?? undefined,
            datosAdicionales: {
              alumnoId: alumno.usuarioId,
              fechaProgramada,
              periodicidad: alumno.periodicidad,
            },
            esCriticoSeguridad: false,
          })
        );
        expiracionesDespachadas += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo despachar la expiración antropométrica del alumno ${alumno.usuarioId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.logger.log(
      `Check-in antropométrico vencido: ${expiracionesDespachadas} avisos al coach, ` +
        `${expiracionesOmitidasPorMedicion} con medición, ${expiracionesOmitidasPorAviso} ya avisados ` +
        `(${candidatos.length} ventanas vencidas evaluadas).`
    );

    return {
      expiracionesDespachadas,
      expiracionesOmitidasPorMedicion,
      expiracionesOmitidasPorAviso,
    };
  }
}
