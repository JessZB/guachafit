/**
 * RF-003 RN-01 / RN-04: constantes del calendario de periodicidad y la ventana del check-in.
 */

/** Zona por defecto del producto cuando el usuario no tiene una zona IANA válida (ADR-002). */
export const TIMEZONE_ANTROPOMETRIA_POR_DEFECTO = 'America/Caracas';

/** RN-01: hora local del recordatorio ("06:00 AM hora local"). */
export const HORA_RECORDATORIO_ANTROPOMETRIA = 6;

/**
 * RN-04: radio de la ventana activa en horas alrededor del día programado ("± 24 horas").
 * La ventana completa mide `2 * 24 = 48 h` (§6).
 */
export const HORAS_RADIO_VENTANA_ANTROPOMETRIA = 24;

/** Copy del recordatorio de RN-01 (mensaje literal del doc). */
export const MENSAJE_RECORDATORIO_ANTROPOMETRIA =
  'Hoy es día de check-in: registra tus métricas en ayunas.';
