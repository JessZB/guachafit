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
 * Los offsets se calculan SIEMPRE contra `fecha_corte_utc` en milisegundos UTC (ADR-002), sin
 * depender de la zona horaria del proceso.
 */
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

/** Timestamp UTC exacto del hito: `fecha_corte_utc + offsetDias`. */
export function calcularTimestampHito(fechaCorteUtc: Date, hito: HitoCobranza): Date {
  return new Date(fechaCorteUtc.getTime() + OFFSET_DIAS_HITO[hito] * MS_POR_DIA);
}
