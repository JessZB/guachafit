/**
 * RF-014 RN-01 (ADR-010): eventos de dominio de notificaciones.
 *
 * Los servicios de negocio (finanzas, entrenamiento, alumnos, cobranza) SOLO publican estas
 * clases en el bus `EventEmitter2`; jamás invocan al despachador ni a un proveedor externo.
 * El `NotificationDispatcherService` escucha el patrón `notificacion.**` y ejecuta el pipeline
 * (In-App universal + encolamiento según preferencias).
 *
 * Convención de nombres: `notificacion.<evento-en-kebab>` con separador `.` (EventEmitter2 usa
 * `.` como delimitador de namespaces). El patrón wildcard exige `EventEmitterModule.forRoot({ wildcard: true })`.
 *
 * Cada clase es inmutable a nivel de dominio: envuelve el `EventoNotificacionPayload` compartido y
 * fija el instante de ocurrencia (`ocurridoEnUtc`) para trazabilidad.
 */
import { EventoNotificacionPayload } from '@guachafit/shared';

/** Patrón EventEmitter2 que el despachador escucha (requiere `wildcard: true`). */
export const PATRON_EVENTOS_NOTIFICACION = 'notificacion.**';

export abstract class EventoNotificacionDominio {
  readonly ocurridoEnUtc: string;

  constructor(public readonly payload: EventoNotificacionPayload) {
    this.ocurridoEnUtc = payload.timestampUtc ?? new Date().toISOString();
  }
}

/** Finanzas: el alumno reportó un comprobante de pago (destinatario: coach). */
export class PagoReportadoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.pago-reportado';
}

/** Finanzas: el coach aprobó el pago (destinatario: alumno, crítico → Email garantizado). */
export class PagoAprobadoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.pago-aprobado';
}

/** Finanzas: el coach rechazó el comprobante (destinatario: alumno). */
export class PagoRechazadoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.pago-rechazado';
}

/** Finanzas: el coach registró un cobro directo en efectivo (destinatario: alumno). */
export class CobroDirectoRegistradoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.cobro-directo-registrado';
}

/** Entrenamiento: el alumno finalizó una sesión (destinatario: coach). */
export class SesionAlumnoFinalizadaEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.sesion-alumno-finalizada';
}

/** Alumnos: alta por deep link `coach_code` (destinatario: coach). */
export class AlumnoRegistradoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.alumno-registrado';
}

/**
 * Cobranza (RF-008 / ADR-008): un hito programado de recordatorio de cuota (T-5, T-1, T, T+2)
 * llegó a su hora y la cuota sigue impaga. El hito viaja en `datosAdicionales.hito`.
 */
export class RecordatorioCuotaEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.recordatorio-cuota';
}

/** Cobranza (RF-009 RN-02): recordatorio manual de un clic del coach (con cooldown anti-spam). */
export class RecordatorioManualCobroEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.recordatorio-manual-cobro';
}

/** Notificaciones (Ola 3): digest semanal del coach (adherencia + cobros/por vencer). */
export class ResumenSemanalCoachEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.resumen-semanal-coach';
}

/**
 * Antropometría (RF-003 RN-01 / WU RF-003a): recordatorio del día de check-in del alumno.
 *
 * El calendario lo fija la periodicidad que configura el coach; el aviso viaja por la categoría
 * `ANTROPOMETRIA`, que para el alumno enruta por la fila "Check-in Antropométrico" de RF-015 §A
 * (In-App universal + Push/Email según sus preferencias).
 */
export class RecordatorioCheckinAntropometricoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.recordatorio-checkin-antropometrico';
}

/**
 * Antropometría (RF-003 Escenario 2 / WU "RF-003 · cierre"): el alumno remoto envió un check-in
 * pendiente de validación (destinatario: coach).
 *
 * Viaja por la categoría `ANTROPOMETRIA`, que para el entrenador enruta por la fila "Reportes de
 * Progreso" de RF-015 §B (In-App universal + Push/Email según sus preferencias).
 */
export class CheckinAntropometricoRecibidoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.checkin-antropometrico-recibido';
}

/**
 * Antropometría (RF-003 §6 / WU "RF-003 · cierre"): la ventana de check-in de una fecha programada
 * cerró sin medición (destinatario: coach, para reprogramar).
 *
 * `referenciaId` determinista por alumno + fecha programada: el barrido horario puede repetirse sin
 * duplicar la entrega.
 */
export class CheckinAntropometricoExpiradoEvent extends EventoNotificacionDominio {
  static readonly NOMBRE = 'notificacion.checkin-antropometrico-expirado';
}
