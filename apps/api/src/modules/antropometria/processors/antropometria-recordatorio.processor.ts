/**
 * RF-003 RN-01 (WU RF-003a): barrido horario del recordatorio de check-in antropométrico.
 *
 * Ejecuta el job repetible que registra `AntropometriaRecordatorioSchedulerService` y, para cada
 * alumno con calendario configurado por el coach:
 *
 * 1. Resuelve su día/hora LOCALES (zona IANA de `usuarios.timezone`).
 * 2. Solo actúa si hoy es una fecha programada por la periodicidad (RN-01) Y su hora local es la
 *    del recordatorio (06:00). Ese doble filtro es lo que permite un único cron horario en UTC.
 * 3. Descarta a quien ya registró un check-in dentro de la ventana ±24 h de su fecha programada.
 * 4. Descarta a quien ya tiene el aviso persistido en su bandeja In-App desde su medianoche local:
 *    así una segunda ejecución del worker (reintento, doble proceso) NO duplica el aviso.
 * 5. Publica `RecordatorioCheckinAntropometricoEvent` en el bus: el despachador persiste el aviso
 *    In-App y encola Push/Email por la fila "Check-in Antropométrico" de RF-015 §A, con
 *    `jobId` determinista (`notif_ANTROPOMETRIA_{tipo}_{alumno}_{referencia}_{YYYYMMDD}`).
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
import { EstadoAlumno, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  fechaAnteriorYyyyMmDd,
  instanteUtcDesdeMedianocheLocal,
} from '../../../common/adherencia.util';
import {
  MENSAJE_RECORDATORIO_ANTROPOMETRIA,
  evaluarRecordatorioAntropometria,
  sumarDiasCalendario,
} from '../antropometria-periodicidad.util';
import {
  JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
} from '../antropometria-recordatorio.scheduler';
import { RecordatorioCheckinAntropometricoEvent } from '../../notificaciones/events/eventos-notificacion';

/** Tipo de evento persistido en la bandeja: prefijo `ANTROPOMETRIA_` (icono de progreso físico). */
export const TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA =
  'ANTROPOMETRIA_RECORDATORIO_CHECKIN' as const;

/** Ruta real del router web con el formulario de check-in del alumno. */
export const LINK_RECORDATORIO_ANTROPOMETRIA = '/app/progreso';

export interface ResultadoRecordatorioAntropometria {
  /** Alumnos con calendario configurado evaluados en esta pasada. */
  evaluados: number;
  /** Alumnos descartados porque ya registraron su check-in en la ventana ±24 h. */
  omitidosPorReporte: number;
  /** Alumnos descartados porque el aviso de hoy ya está en su bandeja (idempotencia). */
  omitidosPorAviso: number;
  /** Recordatorios emitidos al bus de notificaciones. */
  despachados: number;
}

interface AlumnoConCalendario {
  usuarioId: string;
  entrenadorId: string;
  nombres: string;
  apellidos: string;
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
  ): Promise<ResultadoRecordatorioAntropometria | { procesado: false }> {
    if (job.name !== JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA) {
      this.logger.warn(
        `Job desconocido '${job.name}' en la cola ${COLA_ANTROPOMETRIA_RECORDATORIO}; ignorado.`
      );
      return { procesado: false };
    }
    return this.generarYDespachar();
  }

  /** Barrido principal (parametrizable en tests con un instante fijo). */
  async generarYDespachar(
    ahora: Date = new Date()
  ): Promise<ResultadoRecordatorioAntropometria> {
    const alumnos = (await this.db
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
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

    // Rango global (inclusivo) de fechas de control a consultar: la ventana ±24 h de cada
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
}
