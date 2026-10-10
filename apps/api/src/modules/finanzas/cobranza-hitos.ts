/**
 * WU-H (RF-008 §4.B / ADR-008 §3.1): hitos deterministas del cronograma de recordatorios.
 *
 * El `jobId` es determinista (mismo cuota+hito => mismo id), de modo que BullMQ descarta
 * automáticamente cualquier re-emisión duplicada y la cancelación por id es exacta.
 *
 * DESVIACIÓN DOCUMENTADA del literal `cuota:{cuotaId}:hito:{HITO}` del ADR-008 §3.1:
 * BullMQ 5.81 (`job.js#validateOptions`) RECHAZA todo jobId personalizado que contenga `:`
 * salvo que tenga exactamente 3 segmentos (`Custom Id cannot contain :`), verificado contra el
 * Redis real del proyecto. Se adopta el formato del diagrama del propio ADR-008 §3
 * (`cuota_{id}_T-5`) con separador `_`, que es determinista, seguro y estable.
 *
 * Con la zona del alumno (M5-L1), cada hito sale a las 09:00 locales del día `fecha local del
 * corte + offset`, respetando el horario de verano. Sin zona (ruta heredada) se mantiene el
 * cálculo previo: `fecha_corte_utc + offset` en milisegundos UTC (ADR-002). Ninguno de los dos
 * depende de la zona horaria del proceso.
 */
import {
  instanteUtcDesdeHoraLocal,
  obtenerFechaLocalYyyyMmDd,
  sumarDiasCalendario,
} from '../../common/adherencia.util';

export const HITOS_COBRANZA = ['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2'] as const;

export type HitoCobranza = (typeof HITOS_COBRANZA)[number];

/** Días (en UTC) que separan cada hito de la fecha de corte. */
export const OFFSET_DIAS_HITO: Record<HitoCobranza, number> = {
  T_MINUS_5: -5,
  T_MINUS_1: -1,
  T_ZERO: 0,
  T_PLUS_2: 2,
};

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const COBRANZA_QUEUE = 'cobranza';

/** Nombre de job para un recordatorio puntual de cuota. */
export const JOB_RECORDATORIO_CUOTA = 'recordatorio-cuota';

/** Nombre de job del barrido diario de estados. */
export const JOB_BARRIDO_ESTADOS = 'barrido-estados';

/** Clave determinista del job scheduler repetible (upsert idempotente al boot). */
export const JOB_SCHEDULER_BARRIDO_ID = 'cobranza:barrido-diario';

/** Cron UTC por defecto: 09:00 UTC (RF-008 §4.B). Configurable con `COBRANZA_BARRIDO_CRON`. */
export const CRON_BARRIDO_POR_DEFECTO = '0 9 * * *';

/** JobId determinista de un hito (ver nota de desviación del ADR-008 en el encabezado). */
export function construirJobIdCobranza(cuotaId: string, hito: HitoCobranza): string {
  return `cuota_${cuotaId}_hito_${hito}`;
}

/** Hora local a la que sale cada recordatorio de cobro (RF-008 §4.B: 09:00 del alumno). */
export const HORA_LOCAL_RECORDATORIO = 9;

/** Día local (`YYYY-MM-DD`) en que cae el hito para un alumno de esa zona. */
export function calcularDiaLocalHito(
  fechaCorteUtc: Date,
  hito: HitoCobranza,
  zonaHoraria: string
): string {
  return sumarDiasCalendario(
    obtenerFechaLocalYyyyMmDd(fechaCorteUtc, zonaHoraria),
    OFFSET_DIAS_HITO[hito]
  );
}

/**
 * Timestamp UTC del hito.
 * - Con `zonaHoraria` (M5-L1): 09:00 locales del día `fecha local del corte + offsetDias`,
 *   también en los días de cambio de horario.
 * - Sin zona: `fecha_corte_utc + offsetDias` exacto (comportamiento previo).
 */
export function calcularTimestampHito(
  fechaCorteUtc: Date,
  hito: HitoCobranza,
  zonaHoraria?: string
): Date {
  if (!zonaHoraria) {
    return new Date(fechaCorteUtc.getTime() + OFFSET_DIAS_HITO[hito] * MS_POR_DIA);
  }
  return instanteUtcDesdeHoraLocal(
    calcularDiaLocalHito(fechaCorteUtc, hito, zonaHoraria),
    HORA_LOCAL_RECORDATORIO,
    zonaHoraria
  );
}
