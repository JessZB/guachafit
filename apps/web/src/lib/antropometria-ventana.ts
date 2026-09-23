/**
 * RF-003 RN-01 / RN-04 / §6 (WU RF-003b): calendario y ventana del check-in antropométrico en la web.
 *
 * Espejo PURO (sin red ni DOM) del helper del API `antropometria-periodicidad.util.ts`, limitado a
 * lo que la UI necesita para ser honesta:
 *
 * - **Calendario (RN-01)**: fechas programadas `inicio + k * intervalo` (días para semanal/quincenal,
 *   meses calendario para mensual, con saturación al último día del mes).
 * - **Ventana (RN-04 + §6)**: el día programado `D` habilita el registro desde `D-1` 00:00 locales
 *   hasta `D+1` 00:00 locales (fin EXCLUSIVO) ⇒ en fechas de calendario local la ventana cubre
 *   exactamente los días `D-1` y `D`.
 * - **Sin periodicidad o sin ancla** la ventana NO aplica (mismo contrato que el API): la UI
 *   conserva el comportamiento previo y el 400 del servidor sigue siendo la red de seguridad.
 *
 * El día "hoy" entra como `hoyLocal` (YYYY-MM-DD) para que el módulo sea determinista en tests y
 * en la UI se use `fechaCalendarioLocal()` (nunca `toISOString()`, que desplaza el día en zonas
 * como America/Caracas durante la tarde/noche).
 */
import { PeriodicidadAntropometria } from '@guachafit/shared';
import { formatFechaCalendario, sumarDiasCalendario } from './date-format';

/** Estado visible del calendario del alumno. */
export type EstadoVentanaCheckinAntropometrico = 'sin_calendario' | 'abierta' | 'proxima' | 'cerrada';

/**
 * Rango local de una ventana de check-in.
 *
 * `desde`/`hasta` son días de calendario locales INCLUSIVOS para mostrar ("del 24 al 25 sept");
 * `hastaExclusivo` es el instante local en que cierra (00:00 del día siguiente a `hasta`).
 */
export interface RangoVentanaCheckinAntropometrico {
  /** Fecha programada `D` de la ventana. */
  fechaProgramada: string;
  /** `D-1`: primer día local en que la ventana está abierta. */
  desde: string;
  /** `D`: último día local completo en que la ventana está abierta. */
  hasta: string;
  /** `D+1`: día local en que la ventana ya está cerrada (00:00, fin exclusivo). */
  hastaExclusivo: string;
}

export interface EstadoVentanaCheckinCalculado {
  estado: EstadoVentanaCheckinAntropometrico;
  /** `false` sin periodicidad/ancla: RN-04 no aplica y el registro conserva el comportamiento previo. */
  aplica: boolean;
  /** `true` cuando el alumno remoto puede enviar su check-in AHORA (o cuando no hay calendario). */
  permiteRegistrar: boolean;
  hoyLocal: string;
  /** Ventana abierta hoy; `null` si no hay ninguna. */
  ventanaVigente: RangoVentanaCheckinAntropometrico | null;
  /** Próxima ventana futura (dato accionable del banner); `null` si no existe. */
  proximaVentana: RangoVentanaCheckinAntropometrico | null;
  /** Última ventana ya vencida; `null` si el calendario nunca se abrió. */
  ultimaVentanaVencida: RangoVentanaCheckinAntropometrico | null;
  /** Fecha programada vigente o más cercana al pasado (`null` sin calendario). */
  fechaProgramadaAnterior: string | null;
  /** Próxima fecha programada (`null` sin calendario). */
  proximaFechaProgramada: string | null;
  /** Copy humano del banner; cadena vacía cuando no hay calendario (no se pinta nada). */
  mensaje: string;
  /** Motivo corto para el control deshabilitado; `null` cuando se puede registrar. */
  motivoBloqueo: string | null;
}

/** Intervalo en días de las periodicidades de aritmética diaria (mensual usa meses calendario). */
const INTERVALO_DIAS: Record<PeriodicidadAntropometria, number> = {
  [PeriodicidadAntropometria.SEMANAL]: 7,
  [PeriodicidadAntropometria.QUINCENAL]: 14,
  [PeriodicidadAntropometria.MENSUAL]: 0,
};

/** Límite defensivo del barrido (jamás un bucle sin salida con datos corruptos). */
const MAXIMO_PASOS_CALENDARIO = 4000;

const FECHA_CALENDARIO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Desplaza una fecha en meses calendario conservando el día del mes y saturando al último día
 * disponible (2026-01-31 + 1 mes → 2026-02-28). Misma regla que el helper del API.
 */
export function desplazarMesesCalendario(fechaYyyyMmDd: string, meses: number): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const destinoMesAbsoluto = y * 12 + (m - 1) + meses;
  const anio = Math.floor(destinoMesAbsoluto / 12);
  const mes = ((destinoMesAbsoluto % 12) + 12) % 12;
  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaDelMes);
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Diferencia de días de calendario `hasta - desde` (aritmética UTC, sin TZ del dispositivo). */
function diferenciaDiasFirmada(desdeYyyyMmDd: string, hastaYyyyMmDd: string): number {
  const [y1, m1, d1] = desdeYyyyMmDd.split('-').map(Number);
  const [y2, m2, d2] = hastaYyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Fechas programadas que rodean al día local `hoyLocal`:
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
  while (
    sumarDiasCalendario(inicio, (k + 1) * intervaloDias) <= hoyLocal &&
    pasos < MAXIMO_PASOS_CALENDARIO
  ) {
    k += 1;
    anterior = sumarDiasCalendario(inicio, k * intervaloDias);
    pasos += 1;
  }

  return {
    anterior,
    siguiente:
      anterior === hoyLocal ? hoyLocal : sumarDiasCalendario(inicio, (k + 1) * intervaloDias),
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
  while (desplazarMesesCalendario(inicio, k + 1) <= hoyLocal && pasos < MAXIMO_PASOS_CALENDARIO) {
    k += 1;
    anterior = desplazarMesesCalendario(inicio, k);
    pasos += 1;
  }

  return {
    anterior,
    siguiente: anterior === hoyLocal ? hoyLocal : desplazarMesesCalendario(inicio, k + 1),
  };
}

/** Rango local de la ventana de la fecha programada `D` (días inclusivos `D-1` y `D`). */
export function rangoVentanaAntropometria(fechaProgramada: string): RangoVentanaCheckinAntropometrico {
  return {
    fechaProgramada,
    desde: sumarDiasCalendario(fechaProgramada, -1),
    hasta: fechaProgramada,
    hastaExclusivo: sumarDiasCalendario(fechaProgramada, 1),
  };
}

/** ¿`hoyLocal` cae dentro de la ventana de la fecha programada `D`? (`D-1` o `D`, fin exclusivo). */
function ventanaAbiertaEn(rango: RangoVentanaCheckinAntropometrico, hoyLocal: string): boolean {
  return hoyLocal === rango.desde || hoyLocal === rango.hasta;
}

/** Fecha local en copy humano; si el dato viniera corrupto, cae al valor crudo (nunca "Invalid Date"). */
function fechaHumana(fecha: string): string {
  return formatFechaCalendario(fecha) ?? fecha;
}

/** Rango en copy humano: "del 24 sept al 25 sept". */
function rangoHumano(rango: RangoVentanaCheckinAntropometrico): string {
  return `del ${fechaHumana(rango.desde)} al ${fechaHumana(rango.hasta)}`;
}

/**
 * Evalúa el estado del calendario y la ventana en el día local `hoyLocal`.
 *
 * Reglas:
 * - Sin periodicidad o sin ancla (o con un ancla malformada) → `sin_calendario` y registro permitido
 *   (comportamiento previo preservado; el API tampoco aplica la ventana).
 * - Con calendario: abierta si hoy es `D-1` o `D` de alguna fecha programada; `proxima` si ninguna
 *   ventana se abrió todavía; `cerrada` si al menos una venció (con la próxima ventana si existe).
 */
export function calcularEstadoVentanaCheckinAntropometrico(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  hoyLocal: string;
}): EstadoVentanaCheckinCalculado {
  const { periodicidad, antropometriaInicio, hoyLocal } = params;

  const sinCalendario = (): EstadoVentanaCheckinCalculado => ({
    estado: 'sin_calendario',
    aplica: false,
    permiteRegistrar: true,
    hoyLocal,
    ventanaVigente: null,
    proximaVentana: null,
    ultimaVentanaVencida: null,
    fechaProgramadaAnterior: null,
    proximaFechaProgramada: null,
    mensaje: '',
    motivoBloqueo: null,
  });

  if (
    !periodicidad ||
    !antropometriaInicio ||
    !FECHA_CALENDARIO_REGEX.test(antropometriaInicio) ||
    !FECHA_CALENDARIO_REGEX.test(hoyLocal)
  ) {
    return sinCalendario();
  }

  const { anterior, siguiente } = fechasProgramadasAntropometria(
    antropometriaInicio,
    periodicidad,
    hoyLocal
  );

  const candidatas = (anterior === siguiente ? [siguiente] : [anterior, siguiente]).filter(
    (fecha): fecha is string => Boolean(fecha)
  );

  const vigente = candidatas
    .map(rangoVentanaAntropometria)
    .find((rango) => ventanaAbiertaEn(rango, hoyLocal));

  if (vigente) {
    return {
      estado: 'abierta',
      aplica: true,
      permiteRegistrar: true,
      hoyLocal,
      ventanaVigente: vigente,
      proximaVentana: null,
      ultimaVentanaVencida: null,
      fechaProgramadaAnterior: anterior,
      proximaFechaProgramada: siguiente,
      mensaje: `Ventana abierta: puedes registrar tu check-in hasta el ${fechaHumana(vigente.hasta)} (fechas locales).`,
      motivoBloqueo: null,
    };
  }

  const rangoSiguiente = rangoVentanaAntropometria(siguiente);
  const proximaVentana = rangoSiguiente.desde > hoyLocal ? rangoSiguiente : null;

  const rangoAnterior = anterior ? rangoVentanaAntropometria(anterior) : null;
  const ultimaVentanaVencida = rangoAnterior && rangoAnterior.hasta < hoyLocal ? rangoAnterior : null;

  // Ninguna ventana vencida todavía (el ancla está en el futuro o la primera aún no se abrió).
  if (!ultimaVentanaVencida) {
    return {
      estado: 'proxima',
      aplica: true,
      permiteRegistrar: false,
      hoyLocal,
      ventanaVigente: null,
      proximaVentana,
      ultimaVentanaVencida: null,
      fechaProgramadaAnterior: anterior,
      proximaFechaProgramada: siguiente,
      mensaje: proximaVentana
        ? `Tu ventana abre ${rangoHumano(proximaVentana)} (fechas locales).`
        : 'Tu ventana de check-in aún no está abierta.',
      motivoBloqueo: proximaVentana
        ? `Tu ventana abre el ${fechaHumana(proximaVentana.desde)}`
        : 'Tu ventana de check-in aún no está abierta',
    };
  }

  const cierre = proximaVentana
    ? ` La próxima abre ${rangoHumano(proximaVentana)} (fechas locales).`
    : '';

  return {
    estado: 'cerrada',
    aplica: true,
    permiteRegistrar: false,
    hoyLocal,
    ventanaVigente: null,
    proximaVentana,
    ultimaVentanaVencida,
    fechaProgramadaAnterior: anterior,
    proximaFechaProgramada: siguiente,
    mensaje:
      'Ventana cerrada.' +
      cierre +
      ' Contacta a tu entrenador para reprogramar tu medición si necesitas registrar antes.',
    motivoBloqueo: 'Tu ventana de check-in está cerrada',
  };
}

/** Próxima fecha programada futura (o la de hoy) en el día local dado; `null` sin calendario. */
export function proximaFechaProgramadaAntropometria(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  hoyLocal: string;
}): string | null {
  return calcularEstadoVentanaCheckinAntropometrico(params).proximaFechaProgramada;
}
