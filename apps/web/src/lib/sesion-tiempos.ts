/**
 * WU15: helpers puros para derivar tiempos REALES entre series y ejercicios a partir de las
 * marcas `timestampCompletadaUtc` del historial de entrenamiento.
 * WU17: se suma la marca de INICIO (`timestampInicioUtc`) para medir el descanso REAL:
 *
 * SEMÁNTICA (importante, no renombrar a "descanso exacto"):
 * - `SerieRegistroDetalleDTO.descansoSegundos` es el valor del TEMPORIZADOR de descanso que el
 *   alumno ve/ajusta en pantalla (objetivo), no una medición del descanso efectivo.
 * - Con WU17, el descanso REAL se mide con marcas de inicio y fin del mismo dispositivo:
 *     descanso_real(serie N) = inicio(serie N) − completada(serie N−1)
 *     descanso_real(ejercicio M) = inicio(primera serie de M) − completada(última de M−1)
 *   Es una medición observada, no una estimación; si falta la marca de inicio, NO se inventa
 *   (se devuelve null y la UI muestra '—').
 * - Las marcas de finalización solas (sin inicio) siguen permitiendo las cotas superiores Δ
 *   de WU15 ("Δ desde serie anterior"): incluyen la ejecución posterior, no son descanso exacto.
 *
 * Robustez: timestamps ausentes, inválidos o en orden no cronológico se OMITEN (null), jamás
 * rompen el cálculo ni producen deltas negativos.
 */
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';

/** Subconjunto mínimo de una serie para derivar sus marcas reales de inicio y finalización. */
export type SerieConMarca = Pick<
  SerieRegistroDetalleDTO,
  'numeroSerie' | 'completada' | 'timestampInicioUtc' | 'timestampCompletadaUtc'
>;

/** Subconjunto mínimo de un ejercicio para encadenar marcas entre ejercicios. */
export interface EjercicioConMarcas {
  series: readonly SerieConMarca[];
}

/** Texto único para un dato de tiempo no disponible (UI honesta, sin inventar valores). */
export const DELTA_SIN_DATO = '—';

/**
 * Marca de finalización de una serie en milisegundos UTC.
 * Solo cuentan series completadas con timestamp parseable: una serie no completada sin marca
 * real no participa del cálculo.
 */
function marcaSegundosSerie(serie: SerieConMarca): number | null {
  if (serie.completada !== true) return null;
  const iso = serie.timestampCompletadaUtc;
  if (!iso) return null;
  const milisegundos = new Date(iso).getTime();
  return Number.isFinite(milisegundos) ? milisegundos : null;
}

/** Diferencia en segundos redondeada, o null si no es un intervalo positivo utilizable. */
function segundosEntre(desdeMs: number, hastaMs: number): number | null {
  const delta = Math.round((hastaMs - desdeMs) / 1000);
  return delta >= 0 ? delta : null;
}

/**
 * Δ real entre cada serie completada y la marcada inmediatamente antes en el MISMO ejercicio.
 *
 * Devuelve un arreglo alineado por índice con el arreglo original: `resultado[i]` es el delta
 * de `series[i]` (la primera serie marcada, y las series sin marca, devuelven `null`).
 * Las marcas se ordenan cronológicamente antes de encadenarlas, de modo que un arreglo
 * desordenado no produce deltas negativos; los empates temporales dan delta 0.
 */
export function deltasEntreSeries(series: readonly SerieConMarca[]): Array<number | null> {
  const resultado: Array<number | null> = series.map(() => null);

  const marcas = series
    .map((serie, indice) => ({ indice, ms: marcaSegundosSerie(serie) }))
    .filter((entrada): entrada is { indice: number; ms: number } => entrada.ms !== null)
    .sort((a, b) => a.ms - b.ms || a.indice - b.indice);

  for (let i = 1; i < marcas.length; i += 1) {
    resultado[marcas[i].indice] = segundosEntre(marcas[i - 1].ms, marcas[i].ms);
  }

  return resultado;
}

/**
 * Δ real entre la última serie completada del ejercicio anterior y la primera del siguiente.
 * `null` cuando a cualquiera de los dos le falta marca (o el orden temporal es inconsistente).
 */
export function deltaEntreEjerciciosSegundos(
  anterior: EjercicioConMarcas,
  siguiente: EjercicioConMarcas
): number | null {
  const marcasAnterior = anterior.series
    .map(marcaSegundosSerie)
    .filter((ms): ms is number => ms !== null);
  const marcasSiguiente = siguiente.series
    .map(marcaSegundosSerie)
    .filter((ms): ms is number => ms !== null);

  if (marcasAnterior.length === 0 || marcasSiguiente.length === 0) return null;

  const ultimaDelAnterior = Math.max(...marcasAnterior);
  const primeraDelSiguiente = Math.min(...marcasSiguiente);
  return segundosEntre(ultimaDelAnterior, primeraDelSiguiente);
}

/**
 * Δ real entre cada ejercicio y el inmediatamente anterior en el orden dado (orden prescrito),
 * alineado por índice. El primer ejercicio y los saltos sin datos devuelven `null`.
 */
export function deltasEntreEjercicios(
  ejercicios: readonly EjercicioConMarcas[]
): Array<number | null> {
  return ejercicios.map((ejercicio, indice) => {
    if (indice === 0) return null;
    return deltaEntreEjerciciosSegundos(ejercicios[indice - 1], ejercicio);
  });
}

// ---------------------------------------------------------------------------
// WU17: MARCA DE INICIO, DESCANSO REAL Y EJECUCIÓN REAL
// ---------------------------------------------------------------------------

/** Marca de inicio de una serie en milisegundos UTC (no exige que la serie esté completada). */
function marcaInicioSegundosSerie(serie: SerieConMarca): number | null {
  const iso = serie.timestampInicioUtc;
  if (!iso) return null;
  const milisegundos = new Date(iso).getTime();
  return Number.isFinite(milisegundos) ? milisegundos : null;
}

/** Índices de las series ordenados por `numeroSerie` (empates conservan el orden original). */
function indicesOrdenadosPorNumeroSerie(series: readonly SerieConMarca[]): number[] {
  return series
    .map((serie, indice) => ({ indice, numeroSerie: serie.numeroSerie }))
    .sort((a, b) => a.numeroSerie - b.numeroSerie || a.indice - b.indice)
    .map((entrada) => entrada.indice);
}

/**
 * Captura SIN fricción del inicio real de una serie (WU17).
 *
 * Devuelve una copia con `timestampInicioUtc` fijado SOLO cuando corresponde marcar:
 * - la serie no está completada (nunca se retro-marcan series ya cerradas);
 * - no tiene ya una marca de inicio (la primera interacción gana; re-editar no la desplaza).
 * Devuelve `null` cuando no hay nada que marcar, de modo que el llamador no cambia el estado.
 */
export function marcarInicioSerieReal<T extends SerieConMarca>(
  serie: T,
  ahoraUtc: string
): T | null {
  if (serie.completada) return null;
  if (marcaInicioSegundosSerie(serie) !== null) return null;
  return { ...serie, timestampInicioUtc: ahoraUtc } as T;
}

/**
 * Descanso REAL por serie: `inicio(serie N) − completada(serie N−1)` en el orden de
 * `numeroSerie`. Alineado por índice con el arreglo original. `null` cuando falta cualquiera
 * de las dos marcas, cuando la serie anterior no está completada o cuando el orden temporal es
 * inconsistente (nunca negativos).
 */
export function descansosRealesEntreSeries(
  series: readonly SerieConMarca[]
): Array<number | null> {
  const resultado: Array<number | null> = series.map(() => null);
  const orden = indicesOrdenadosPorNumeroSerie(series);

  for (let posicion = 1; posicion < orden.length; posicion += 1) {
    const indiceActual = orden[posicion];
    const indiceAnterior = orden[posicion - 1];
    const inicioActual = marcaInicioSegundosSerie(series[indiceActual]);
    const finAnterior = marcaSegundosSerie(series[indiceAnterior]);
    if (inicioActual === null || finAnterior === null) continue;
    resultado[indiceActual] = segundosEntre(finAnterior, inicioActual);
  }

  return resultado;
}

/**
 * Descanso REAL entre ejercicios: `inicio(primera serie con marca de M) − completada(última
 * serie con marca de M−1)`. Alineado por índice: el primer ejercicio devuelve `null`.
 */
export function descansosRealesEntreEjercicios(
  ejercicios: readonly EjercicioConMarcas[]
): Array<number | null> {
  return ejercicios.map((ejercicio, indice) => {
    if (indice === 0) return null;
    const anterior = ejercicios[indice - 1];
    const ordenAnterior = indicesOrdenadosPorNumeroSerie(anterior.series);
    const ordenSiguiente = indicesOrdenadosPorNumeroSerie(ejercicio.series);

    let finAnterior: number | null = null;
    for (const posicion of [...ordenAnterior].reverse()) {
      finAnterior = marcaSegundosSerie(anterior.series[posicion]);
      if (finAnterior !== null) break;
    }
    let inicioSiguiente: number | null = null;
    for (const posicion of ordenSiguiente) {
      inicioSiguiente = marcaInicioSegundosSerie(ejercicio.series[posicion]);
      if (inicioSiguiente !== null) break;
    }

    if (finAnterior === null || inicioSiguiente === null) return null;
    return segundosEntre(finAnterior, inicioSiguiente);
  });
}

/**
 * Duración de EJECUCIÓN por serie: `completada − inicio` cuando ambas marcas existen y la serie
 * está completada. Alineado por índice; `null` cuando no es derivable (nunca negativo).
 */
export function duracionesEjecucionSeries(
  series: readonly SerieConMarca[]
): Array<number | null> {
  return series.map((serie) => {
    if (serie.completada !== true) return null;
    const inicio = marcaInicioSegundosSerie(serie);
    const fin = marcaSegundosSerie(serie);
    if (inicio === null || fin === null) return null;
    return segundosEntre(inicio, fin);
  });
}

/**
 * Formato humano de un delta en segundos: '45 s', '1 min 45 s', '9 min 50 s', '1 h 12 min'.
 * Devuelve `DELTA_SIN_DATO` ('—') cuando no hay dato válido (null, NaN o negativo).
 */
export function formatearDeltaSegundos(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos) || segundos < 0) {
    return DELTA_SIN_DATO;
  }

  const total = Math.round(segundos);
  if (total < 60) return `${total} s`;

  const minutos = Math.floor(total / 60);
  const segundosRestantes = total % 60;
  if (minutos < 60) {
    return segundosRestantes === 0 ? `${minutos} min` : `${minutos} min ${segundosRestantes} s`;
  }

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return minutosRestantes === 0 ? `${horas} h` : `${horas} h ${minutosRestantes} min`;
}

/**
 * WU18: mismo formato humano ('45 s', '2 min 30 s') para CUALQUIER tiempo en segundos visible
 * (descanso planificado, temporizador, duración), no solo para deltas. Es un alias explícito
 * para que la UI de descansos no tenga que llamar "delta" a un valor planificado; la
 * implementación es única y no se duplica.
 */
export const formatearSegundos = formatearDeltaSegundos;
