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
import { Inject, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import {
  COLA_ANTROPOMETRIA_RECORDATORIO,
} from '../../notificaciones/notificaciones.config';
import { DRIZZLE_DB, WITH_TENANT } from '../../../database/database.module';
import { Modalidad, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  MENSAJE_RECORDATORIO_ANTROPOMETRIA,
} from '../antropometria-periodicidad.util';
import {
  cargarAlumnosConCalendario,
  consultarAvisosExpiracion,
  consultarAvisosRecordatorio,
  consultarControlesExpiracion,
  consultarControlesRecordatorio,
} from './recordatorio/recordatorio-lecturas';
import {
  calcularDesdeGlobalExpiracion,
  calcularRangoGlobalRecordatorio,
  filtrarCandidatosExpiracion,
  filtrarCandidatosRecordatorio,
} from './recordatorio/recordatorio-reglas';
import {
  emitirExpiracionesCandidatas,
  emitirRecordatoriosCandidatos,
} from './recordatorio/recordatorio-emision';
import {
  JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
} from '../antropometria-recordatorio.scheduler';

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

  /**
   * RNF-003/ADR-011 (etapa 3): RUTA DE SISTEMA. El barrido cubre TODOS los tenants; la lectura
   * de `perfiles_alumno` (RLS) corre con el bypass explícito `is_superadmin`, nunca con un
   * `entrenador_id` arbitrario.
   */
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly eventEmitter: EventEmitter2,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    super();
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
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
    const alumnos = await cargarAlumnosConCalendario(this.withTenant);

    const recordatorio = await this.despacharRecordatorios(alumnos, ahora);
    const expiracion = await this.despacharExpiraciones(alumnos, ahora);

    return { ...recordatorio, ...expiracion };
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
    const candidatos = filtrarCandidatosRecordatorio(alumnos, ahora);

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
    const { desdeGlobal, hastaGlobal, inicioAvisoGlobalUtc } =
      calcularRangoGlobalRecordatorio(candidatos);

    const controles = await consultarControlesRecordatorio(
      this.db,
      alumnoIds,
      desdeGlobal,
      hastaGlobal
    );

    // Idempotencia: avisos del MISMO tipo persistidos desde la medianoche local de cada alumno.
    const avisosPrevios = await consultarAvisosRecordatorio(
      this.db,
      alumnoIds,
      inicioAvisoGlobalUtc,
      TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA
    );

    const emitido = await emitirRecordatoriosCandidatos({
      candidatos,
      controles,
      avisosPrevios,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
      totalEvaluados: alumnos.length,
      tipoEvento: TIPO_EVENTO_RECORDATORIO_ANTROPOMETRIA,
      linkAccion: LINK_RECORDATORIO_ANTROPOMETRIA,
      mensaje: MENSAJE_RECORDATORIO_ANTROPOMETRIA,
    });

    return {
      evaluados: alumnos.length,
      ...emitido,
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
    const candidatos = filtrarCandidatosExpiracion(alumnos, ahora);

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
    const desdeGlobal = calcularDesdeGlobalExpiracion(candidatos);

    const controles = await consultarControlesExpiracion(this.db, alumnoIds, desdeGlobal);

    // Idempotencia exacta por referencia determinista: el aviso de esa fecha programada ya emitido
    // para el coach (una segunda corrida del worker no duplica).
    const avisosPrevios = await consultarAvisosExpiracion(
      this.db,
      coachIds,
      referencias,
      TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA
    );

    return emitirExpiracionesCandidatas({
      candidatos,
      controles,
      avisosPrevios,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
      tipoEvento: TIPO_EVENTO_EXPIRACION_ANTROPOMETRIA,
      linkAccion: LINK_EXPIRACION_ANTROPOMETRIA,
    });
  }
}
