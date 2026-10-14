/**
 * RF-003 RN-01 / §6 (WU RF-003a): calendario de periodicidad del check-in remoto.
 *
 * 1. **Periodicidad (RN-01, precondición 2)**: `Semanal`, `Quincenal` o `Mensual`, anclada en la
 *    fecha `antropometriaInicio`. Las fechas programadas son `inicio + k * intervalo` (días para
 *    semanal/quincenal, meses calendario para mensual). Sin ancla o sin periodicidad NO hay
 *    calendario: la ventana de RN-04 no aplica y el alumno conserva el comportamiento previo.
 *
 * 3. **Día local**: se usa la zona IANA del usuario (`usuarios.timezone`) — mismo patrón que
 *    nutrición y entrenamiento (`adherencia.util.ts`)—; una zona inválida cae a
 *    `America/Caracas`, la zona por defecto del producto.
 */
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  esTimezoneIanaValida,
  obtenerFechaLocalYyyyMmDd,
  sumarDiasCalendario,
} from '../../../common/adherencia.util';
import { TIMEZONE_ANTROPOMETRIA_POR_DEFECTO } from './constantes';

// Ronda 1 (LOTE API-N2): una sola implementación de la aritmética de fechas de calendario; se
// reexporta para los consumidores existentes de este módulo.
export { sumarDiasCalendario };

/** Intervalo en días de las periodicidades de aritmética diaria (mensual usa meses calendario). */
const INTERVALO_DIAS: Record<PeriodicidadAntropometria, number> = {
  [PeriodicidadAntropometria.SEMANAL]: 7,
  [PeriodicidadAntropometria.QUINCENAL]: 14,
  // `Mensual` no es un múltiplo fijo de días: se resuelve con meses calendario.
  [PeriodicidadAntropometria.MENSUAL]: 0,
};

/** Zona IANA válida del alumno o la zona por defecto del producto. */
export function resolverTimezoneAntropometria(timezone?: string | null): string {
  return timezone && esTimezoneIanaValida(timezone)
    ? timezone
    : TIMEZONE_ANTROPOMETRIA_POR_DEFECTO;
}

/** Diferencia de días de calendario `hasta - desde` (firmada; nunca la del reloj del proceso). */
function diferenciaDiasFirmada(desdeYyyyMmDd: string, hastaYyyyMmDd: string): number {
  const [y1, m1, d1] = desdeYyyyMmDd.split('-').map(Number);
  const [y2, m2, d2] = hastaYyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Desplaza una fecha en meses calendario conservando el día del mes y saturando al último día
 * disponible (2026-01-31 + 1 mes → 2026-02-28). Nunca depende de la TZ del servidor.
 */
export function desplazarMesesCalendario(fechaYyyyMmDd: string, meses: number): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const destinoMesAbsoluto = (y * 12 + (m - 1)) + meses;
  const anio = Math.floor(destinoMesAbsoluto / 12);
  const mes = (destinoMesAbsoluto % 12 + 12) % 12;
  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaDelMes);
  const mm = String(mes + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${anio}-${mm}-${dd}`;
}

/** Límite defensivo del barrido (jamás un bucle sin salida con datos corruptos). */
const MAXIMO_PASOS_CALENDARIO = 4000;

/**
 * Fechas programadas que rodean al día local `hoyLocal`:
 *
 * - `anterior`: la mayor fecha programada `<= hoyLocal` (`null` si el ancla está en el futuro).
 * - `siguiente`: la menor fecha programada `>= hoyLocal` (igual a `hoyLocal` si hoy toca control).
 */
export function fechasProgramadasAntropometria(
  inicio: string,
  periodicidad: PeriodicidadAntropometria,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  if (periodicidad === PeriodicidadAntropometria.MENSUAL) {
    return fechasMensuales(inicio, hoyLocal);
  }
  return fechasPorIntervaloDias(inicio, INTERVALO_DIAS[periodicidad], hoyLocal);
}

function fechasPorIntervaloDias(
  inicio: string,
  intervaloDias: number,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  const diferencia = diferenciaDiasFirmada(inicio, hoyLocal);

  // Ancla futura: todavía no hay ninguna fecha programada cumplida.
  if (diferencia < 0) {
    return { anterior: null, siguiente: inicio };
  }

  let k = Math.max(0, Math.floor(diferencia / intervaloDias));
  let anterior = sumarDiasCalendario(inicio, k * intervaloDias);

  let pasos = 0;
  while (anterior > hoyLocal && k > 0 && pasos < MAXIMO_PASOS_CALENDARIO) {
    k -= 1;
    anterior = sumarDiasCalendario(inicio, k * intervaloDias);
    pasos += 1;
  }
  while (sumarDiasCalendario(inicio, (k + 1) * intervaloDias) <= hoyLocal && pasos < MAXIMO_PASOS_CALENDARIO) {
    k += 1;
    anterior = sumarDiasCalendario(inicio, k * intervaloDias);
    pasos += 1;
  }

  return {
    anterior,
    siguiente: anterior === hoyLocal ? hoyLocal : sumarDiasCalendario(inicio, (k + 1) * intervaloDias),
  };
}

function fechasMensuales(
  inicio: string,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  const [anioInicio, mesInicio] = inicio.split('-').map(Number);
  const [anioHoy, mesHoy] = hoyLocal.split('-').map(Number);
  const diferenciaMeses = (anioHoy - anioInicio) * 12 + (mesHoy - mesInicio);

  if (diferenciaMeses < 0 || (diferenciaMeses === 0 && inicio > hoyLocal)) {
    return { anterior: null, siguiente: inicio };
  }

  let k = Math.max(0, diferenciaMeses);
  let anterior = desplazarMesesCalendario(inicio, k);

  let pasos = 0;
  while (anterior > hoyLocal && k > 0 && pasos < MAXIMO_PASOS_CALENDARIO) {
    k -= 1;
    anterior = desplazarMesesCalendario(inicio, k);
    pasos += 1;
  }
  while (
    desplazarMesesCalendario(inicio, k + 1) <= hoyLocal &&
    pasos < MAXIMO_PASOS_CALENDARIO
  ) {
    k += 1;
    anterior = desplazarMesesCalendario(inicio, k);
    pasos += 1;
  }

  return {
    anterior,
    siguiente: anterior === hoyLocal ? hoyLocal : desplazarMesesCalendario(inicio, k + 1),
  };
}

/** `true` si `hoyLocal` es una fecha programada del calendario (RN-01: toca control hoy). */
export function esDiaProgramadoAntropometria(
  inicio: string,
  periodicidad: PeriodicidadAntropometria,
  hoyLocal: string
): boolean {
  const { anterior, siguiente } = fechasProgramadasAntropometria(inicio, periodicidad, hoyLocal);
  return anterior === hoyLocal || siguiente === hoyLocal;
}

/** Estado del calendario de un alumno (lectura para la UI y para el recordatorio). */
export interface EstadoCalendarioAntropometria {
  /** `false` sin periodicidad/ancla configuradas: no hay fechas programadas. */
  configurado: boolean;
  hoyLocal: string;
  /** Fecha programada vigente o más cercana (la de hoy si toca control; si no, la anterior). */
  fechaProgramada: string | null;
  /** Próxima fecha programada futura (o la de hoy). `null` si no está configurado. */
  proximaFecha: string | null;
  /** `true` si hoy (día local) es una fecha programada. */
  esDiaProgramado: boolean;
}

/** Lectura del calendario de periodicidad en el día local del alumno. */
export function calcularEstadoCalendarioAntropometria(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): EstadoCalendarioAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return {
      configurado: false,
      hoyLocal,
      fechaProgramada: null,
      proximaFecha: null,
      esDiaProgramado: false,
    };
  }

  const { anterior, siguiente } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  return {
    configurado: true,
    hoyLocal,
    fechaProgramada: anterior ?? siguiente,
    proximaFecha: siguiente,
    esDiaProgramado: anterior === hoyLocal || siguiente === hoyLocal,
  };
}
