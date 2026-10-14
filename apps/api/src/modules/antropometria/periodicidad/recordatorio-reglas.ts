/**
 * RF-003 RN-01 / §6 (WU RF-003a): recordatorio de las 06:00 locales y aviso de ventana vencida.
 *
 * RN-01 con job de 15 min (documentado): el processor corre cada 15 minutos en UTC y solo emite
 * para los alumnos cuya HORA LOCAL es la del recordatorio (06:00) y cuyo día local es una fecha
 * programada. La cadencia cubre offsets de hora entera, media hora (p. ej. Asia/Kolkata) y 45 min
 * (p. ej. Asia/Kathmandu) dentro de su hora local 6. Límite: si el worker está caído durante toda
 * la hora local 6, ese día no hay reemisión (no hay catch-up).
 */
import { PeriodicidadAntropometria } from '@guachafit/shared';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import { HORA_RECORDATORIO_ANTROPOMETRIA } from './constantes';
import {
  esDiaProgramadoAntropometria,
  fechasProgramadasAntropometria,
  resolverTimezoneAntropometria,
} from './calendario-reglas';

/** Resultado de la evaluación del recordatorio de las 06:00 locales (RN-01). */
export interface ResultadoRecordatorioAntropometria {
  /** `true` si hoy es la fecha programada Y la hora local es la del recordatorio (06:00). */
  corresponde: boolean;
  hoyLocal: string;
  horaLocal: number;
  fechaProgramada: string | null;
  /** Referencia determinista del aviso: `antropometria_YYYY-MM-DD` (fecha local programada). */
  referenciaId: string | null;
}

/** Hora local 0–23 de un instante en una zona IANA (h23: medianoche = 00, nunca 24). */
export function obtenerHoraLocalEnTimezone(fecha: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: resolverTimezoneAntropometria(timezone),
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(hora) ? hora % 24 : 0;
}

/** Referencia determinista del recordatorio (alimenta el `jobId` de RNF-004 §3). */
export function construirReferenciaRecordatorioAntropometria(fechaLocal: string): string {
  return `antropometria_${fechaLocal}`;
}

/** Resultado de la detección de ventana vencida sin check-in (RF-003 §6). */
export interface ResultadoExpiracionAntropometria {
  /** `true` si la última fecha programada cumplida ya cerró su ventana de 48 h. */
  expirado: boolean;
  hoyLocal: string;
  /** Fecha programada `D` cuya ventana `[D-1, D+1)` ya cerró (la más reciente). */
  fechaProgramada: string | null;
  /** Referencia determinista alumno + fecha programada (dedupe del aviso entre corridas). */
  referenciaId: string | null;
}

/** Referencia determinista de la expiración (alimenta el `jobId` de RNF-004 §3). */
export function construirReferenciaExpiracionAntropometria(
  alumnoId: string,
  fechaProgramada: string
): string {
  return `antropometria_expirado_${alumnoId}_${fechaProgramada}`;
}

/**
 * RF-003 §6: ¿el calendario del alumno tiene una fecha programada cuya ventana ya cerró?
 *
 * La ventana de `D` cierra al comenzar `D+1` local, así que la fecha vencida es la programada MÁS
 * RECIENTE anterior al día local de hoy (`anterior < hoyLocal`). La de hoy (`anterior === hoyLocal`)
 * tiene la ventana abierta y NO cuenta como expirada. El aviso es uno por fecha programada: la
 * referencia determinista `alumno + fecha` permite al barrido deduplicarlo entre corridas.
 */
export function evaluarExpiracionAntropometria(params: {
  alumnoId: string;
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoExpiracionAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return { expirado: false, hoyLocal, fechaProgramada: null, referenciaId: null };
  }

  const { anterior } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  if (!anterior || anterior >= hoyLocal) {
    return { expirado: false, hoyLocal, fechaProgramada: null, referenciaId: null };
  }

  return {
    expirado: true,
    hoyLocal,
    fechaProgramada: anterior,
    referenciaId: construirReferenciaExpiracionAntropometria(params.alumnoId, anterior),
  };
}

/** Evaluación del recordatorio de las 06:00 locales en fecha programada (RN-01). */
export function evaluarRecordatorioAntropometria(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoRecordatorioAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);
  const horaLocal = obtenerHoraLocalEnTimezone(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return { corresponde: false, hoyLocal, horaLocal, fechaProgramada: null, referenciaId: null };
  }

  const esHoy = esDiaProgramadoAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  if (!esHoy) {
    return { corresponde: false, hoyLocal, horaLocal, fechaProgramada: null, referenciaId: null };
  }

  return {
    corresponde: horaLocal === HORA_RECORDATORIO_ANTROPOMETRIA,
    hoyLocal,
    horaLocal,
    fechaProgramada: hoyLocal,
    referenciaId: construirReferenciaRecordatorioAntropometria(hoyLocal),
  };
}
