/**
 * RF-004 RN-01: helpers puros del gráfico de evolución corporal.
 *
 * Todo el cálculo (rangos de fecha, series por métrica, ejes, dominio, deltas y resumen
 * accesible) vive aquí para poder testearlo sin montar el componente. El componente
 * `GraficoEvolucion` solo proyecta estas estructuras a SVG.
 *
 * Decisiones de diseño:
 * - Sin dependencias nuevas: el gráfico es SVG propio. El repo no trae librería de charts y
 *   los tokens semánticos (claro/oscuro) + accesibilidad se controlan mejor a mano.
 * - Máximo 3 métricas activas y 2 unidades distintas por gráfico (eje Y izquierdo/derecho),
 *   que es exactamente el escenario de doble eje de RN-01 (peso en kg vs % grasa).
 * - Los puntos con métrica faltante NO se conectan: la línea se corta (nunca se inventa un
 *   tramo entre dos mediciones que no existen en una fecha intermedia).
 */
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';

export type IdMetricaEvolucion =
  | 'peso'
  | 'grasa'
  | 'cintura'
  | 'brazo'
  | 'pecho'
  | 'muslo'
  | 'cadera'
  | 'cuello';

export type UnidadMetrica = 'kg' | '%' | 'cm';

/** Tokens semánticos con variante claro/oscuro (00_Reglas §6.10); nada de hex fijos. */
export type ColorMetrica = 'primary' | 'success' | 'info' | 'warning' | 'decor';

export type RangoEvolucion = '1M' | '3M' | '6M' | '1A' | 'todo';

export interface DefinicionMetrica {
  id: IdMetricaEvolucion;
  etiqueta: string;
  unidad: UnidadMetrica;
  /** Color preferido; si ya está en uso, `construirSeries` asigna el primer token libre. */
  colorPreferido: ColorMetrica;
  extraer: (control: ControlAntropometricoDetalleDTO) => number | null;
}

export interface PuntoSerie {
  fecha: string; // YYYY-MM-DD
  valor: number;
}

export interface SerieMetrica {
  metrica: DefinicionMetrica;
  /** Color resuelto para que las métricas activas nunca compartan token. */
  color: ColorMetrica;
  eje: 'izquierda' | 'derecha';
  /** Puntos no nulos en orden cronológico (para dominio, tooltip y deltas). */
  puntos: PuntoSerie[];
  /**
   * Tramos continuos de la línea: una métrica sin valor en una fecha intermedia corta el
   * trazo en vez de conectar dos mediciones que no existen.
   */
  segmentos: PuntoSerie[][];
}

export interface DeltaMetrica {
  metrica: DefinicionMetrica;
  valorInicial: number | null;
  valorFinal: number | null;
  /** `null` cuando hay menos de dos mediciones en el rango: no se fabrica un delta. */
  diferencia: number | null;
}

export interface RangoOpcion {
  id: RangoEvolucion;
  etiqueta: string;
  aria: string;
  meses: number | null;
}

export const RANGOS_EVOLUCION: RangoOpcion[] = [
  { id: '1M', etiqueta: '1M', aria: 'Último mes', meses: 1 },
  { id: '3M', etiqueta: '3M', aria: 'Últimos tres meses', meses: 3 },
  { id: '6M', etiqueta: '6M', aria: 'Últimos seis meses', meses: 6 },
  { id: '1A', etiqueta: '1A', aria: 'Último año', meses: 12 },
  { id: 'todo', etiqueta: 'Todo', aria: 'Todo el historial', meses: null },
];

function numero(valor?: string | null): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export const METRICAS_EVOLUCION: DefinicionMetrica[] = [
  {
    id: 'peso',
    etiqueta: 'Peso',
    unidad: 'kg',
    colorPreferido: 'primary',
    extraer: (control) => numero(control.pesoKg),
  },
  {
    id: 'grasa',
    etiqueta: '% Grasa',
    unidad: '%',
    colorPreferido: 'warning',
    extraer: (control) => numero(control.porcentajeGrasa),
  },
  {
    id: 'cintura',
    etiqueta: 'Cintura',
    unidad: 'cm',
    colorPreferido: 'info',
    extraer: (control) => numero(control.perimetros?.cinturaCm),
  },
  {
    id: 'brazo',
    etiqueta: 'Brazo',
    unidad: 'cm',
    colorPreferido: 'success',
    extraer: (control) => numero(control.perimetros?.brazoCm),
  },
  {
    id: 'pecho',
    etiqueta: 'Pecho',
    unidad: 'cm',
    colorPreferido: 'decor',
    extraer: (control) => numero(control.perimetros?.pechoCm),
  },
  {
    id: 'muslo',
    etiqueta: 'Muslo',
    unidad: 'cm',
    colorPreferido: 'info',
    extraer: (control) => numero(control.perimetros?.musloCm),
  },
  {
    id: 'cadera',
    etiqueta: 'Cadera',
    unidad: 'cm',
    colorPreferido: 'success',
    extraer: (control) => numero(control.perimetros?.caderaCm),
  },
  {
    id: 'cuello',
    etiqueta: 'Cuello',
    unidad: 'cm',
    colorPreferido: 'warning',
    extraer: (control) => numero(control.perimetros?.cuelloCm),
  },
];

const METRICAS_POR_ID = new Map(METRICAS_EVOLUCION.map((m) => [m.id, m]));

const PALETA: ColorMetrica[] = ['primary', 'warning', 'info', 'success', 'decor'];

export const MAX_METRICAS_ACTIVAS = 3;
export const MAX_UNIDADES_POR_GRAFICO = 2;

export function metricaPorId(id: IdMetricaEvolucion): DefinicionMetrica {
  const metrica = METRICAS_POR_ID.get(id);
  if (!metrica) throw new Error(`Métrica de evolución desconocida: ${id}`);
  return metrica;
}

/** Día calendario local a milisegundos, sin desfase de zona horaria. */
export function fechaCalendarioMs(fecha: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) return Number.NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

/** Fecha local `YYYY-MM-DD` (mismo criterio que `construirPayloadCheckinAntropometrico`). */
export function fechaCalendarioLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Filtra la serie por rango relativo a `ahora` (fecha local). `todo` devuelve la serie tal cual.
 * El orden de entrada (cronológico ascendente que entrega la API) se conserva.
 */
export function filtrarPorRango(
  evaluaciones: ControlAntropometricoDetalleDTO[],
  rango: RangoEvolucion,
  ahora: Date = new Date()
): ControlAntropometricoDetalleDTO[] {
  const opcion = RANGOS_EVOLUCION.find((r) => r.id === rango);
  if (!opcion || opcion.meses === null) return [...evaluaciones];

  const corte = new Date(ahora.getFullYear(), ahora.getMonth() - opcion.meses, ahora.getDate());
  const corteMs = corte.getTime();

  return evaluaciones.filter((e) => {
    const ms = fechaCalendarioMs(e.fechaEvaluacion);
    return Number.isFinite(ms) && ms >= corteMs;
  });
}

/**
 * Construye las series de las métricas activas: color único por serie y eje Y asignado por
 * orden de aparición de la unidad (primera unidad → eje izquierdo, segunda → derecho).
 */
export function construirSeries(
  evaluaciones: ControlAntropometricoDetalleDTO[],
  idsActivos: IdMetricaEvolucion[]
): SerieMetrica[] {
  const usados = new Set<ColorMetrica>();
  const unidadesVistas: UnidadMetrica[] = [];

  return idsActivos.map((id) => {
    const metrica = metricaPorId(id);

    let color = metrica.colorPreferido;
    if (usados.has(color)) {
      color = PALETA.find((c) => !usados.has(c)) ?? color;
    }
    usados.add(color);

    if (!unidadesVistas.includes(metrica.unidad)) unidadesVistas.push(metrica.unidad);
    const eje: SerieMetrica['eje'] = unidadesVistas.indexOf(metrica.unidad) === 0 ? 'izquierda' : 'derecha';

    const puntos: PuntoSerie[] = [];
    const segmentos: PuntoSerie[][] = [];
    let segmentoActual: PuntoSerie[] = [];
    for (const evaluacion of evaluaciones) {
      const valor = metrica.extraer(evaluacion);
      if (valor === null) {
        if (segmentoActual.length > 0) segmentos.push(segmentoActual);
        segmentoActual = [];
        continue;
      }
      const punto: PuntoSerie = { fecha: evaluacion.fechaEvaluacion, valor };
      puntos.push(punto);
      segmentoActual.push(punto);
    }
    if (segmentoActual.length > 0) segmentos.push(segmentoActual);

    return { metrica, color, eje, puntos, segmentos };
  });
}

/** Delta neto por métrica sobre la serie YA filtrada por rango (Gherkin Escenario 1). */
export function calcularDeltas(
  evaluaciones: ControlAntropometricoDetalleDTO[],
  idsActivos: IdMetricaEvolucion[]
): DeltaMetrica[] {
  return idsActivos.map((id) => {
    const metrica = metricaPorId(id);
    const valores: number[] = [];
    for (const evaluacion of evaluaciones) {
      const valor = metrica.extraer(evaluacion);
      if (valor !== null) valores.push(valor);
    }

    const valorInicial = valores.length > 0 ? valores[0] : null;
    const valorFinal = valores.length > 0 ? valores[valores.length - 1] : null;
    const diferencia = valores.length >= 2 ? valorFinal! - valorInicial! : null;

    return { metrica, valorInicial, valorFinal, diferencia };
  });
}

/**
 * Alterna una métrica respetando los topes del gráfico. Devuelve el motivo visible cuando la
 * acción se rechaza (nunca se falla en silencio).
 */
export function alternarMetricaActiva(
  activas: IdMetricaEvolucion[],
  id: IdMetricaEvolucion
): { activas: IdMetricaEvolucion[]; cambio: boolean; motivo: string | null } {
  if (activas.includes(id)) {
    if (activas.length === 1) {
      return {
        activas,
        cambio: false,
        motivo: 'Deja al menos una métrica en el gráfico.',
      };
    }
    return { activas: activas.filter((m) => m !== id), cambio: true, motivo: null };
  }

  if (activas.length >= MAX_METRICAS_ACTIVAS) {
    return {
      activas,
      cambio: false,
      motivo: `Máximo ${MAX_METRICAS_ACTIVAS} métricas a la vez. Quita una para agregar otra.`,
    };
  }

  const unidades = new Set<UnidadMetrica>(activas.map((m) => metricaPorId(m).unidad));
  unidades.add(metricaPorId(id).unidad);
  if (unidades.size > MAX_UNIDADES_POR_GRAFICO) {
    return {
      activas,
      cambio: false,
      motivo: 'Máximo dos unidades por gráfico (kg, % o cm). Quita una métrica para cambiar de unidad.',
    };
  }

  return { activas: [...activas, id], cambio: true, motivo: null };
}

/** Valor humano de una métrica: '74.50 kg', '14.80%', '81.00 cm'. */
export function formatearValorMetrica(metrica: DefinicionMetrica, valor: number): string {
  const numero = valor.toFixed(2);
  return metrica.unidad === '%' ? `${numero}%` : `${numero} ${metrica.unidad}`;
}

/** Delta humano con signo: '+0.50 kg', '-3.20 kg', '0.00 kg'. */
export function formatearDeltaMetrica(metrica: DefinicionMetrica, diferencia: number): string {
  const redondeado = diferencia.toFixed(2);
  const numero = diferencia > 0 ? `+${redondeado}` : redondeado;
  return metrica.unidad === '%' ? `${numero}%` : `${numero} ${metrica.unidad}`;
}

/**
 * Dominio de un eje con margen simétrico. Con un único valor (o todos iguales) se abre una
 * ventana alrededor para que la línea no quede pegada al borde.
 */
export function calcularDominio(valores: number[], margen = 0.08): { min: number; max: number } | null {
  if (valores.length === 0) return null;
  let min = valores[0];
  let max = valores[0];
  for (const valor of valores) {
    if (valor < min) min = valor;
    if (valor > max) max = valor;
  }

  if (min === max) {
    const relleno = Math.abs(min) * margen || 1;
    return { min: min - relleno, max: max + relleno };
  }

  const relleno = (max - min) * margen;
  return { min: min - relleno, max: max + relleno };
}

/** Proyección X de una fecha (ms) al área de dibujo. Con una sola fecha se centra. */
export function mapearX(fechaMs: number, minMs: number, maxMs: number, xIzquierda: number, xDerecha: number): number {
  if (maxMs === minMs) return (xIzquierda + xDerecha) / 2;
  const proporcion = (fechaMs - minMs) / (maxMs - minMs);
  return xIzquierda + proporcion * (xDerecha - xIzquierda);
}

/** Proyección Y de un valor: `yArriba` es el borde superior del área. */
export function mapearY(
  valor: number,
  dominio: { min: number; max: number },
  yArriba: number,
  yAbajo: number
): number {
  if (dominio.max === dominio.min) return (yArriba + yAbajo) / 2;
  const proporcion = (valor - dominio.min) / (dominio.max - dominio.min);
  return yAbajo - proporcion * (yAbajo - yArriba);
}

/** Índice del valor más cercano al objetivo (empate → el primero). -1 si la lista está vacía. */
export function encontrarIndiceMasCercano(valores: number[], objetivo: number): number {
  if (valores.length === 0) return -1;
  let mejorIndice = 0;
  let mejorDistancia = Math.abs(valores[0] - objetivo);
  for (let i = 1; i < valores.length; i += 1) {
    const distancia = Math.abs(valores[i] - objetivo);
    if (distancia < mejorDistancia) {
      mejorIndice = i;
      mejorDistancia = distancia;
    }
  }
  return mejorIndice;
}

/** Fechas para las marcas del eje X: extremos + intermedios equiespaciados, sin repetir. */
export function seleccionarTicksX(fechas: string[], maxTicks = 4): string[] {
  if (fechas.length === 0) return [];
  if (fechas.length <= maxTicks) return [...fechas];

  const indices = new Set<number>();
  for (let i = 0; i < maxTicks; i += 1) {
    indices.add(Math.round((i * (fechas.length - 1)) / (maxTicks - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((i) => fechas[i]);
}

/** Series agrupadas por eje para pintar cada escala por separado. */
export function agruparSeriesPorEje(series: SerieMetrica[]): {
  izquierda: SerieMetrica[];
  derecha: SerieMetrica[];
} {
  return {
    izquierda: series.filter((s) => s.eje === 'izquierda'),
    derecha: series.filter((s) => s.eje === 'derecha'),
  };
}

/** Valor de una serie en una fecha exacta (para el tooltip); `null` si no hay medición. */
export function valorEnFecha(serie: SerieMetrica, fecha: string): number | null {
  const punto = serie.puntos.find((p) => p.fecha === fecha);
  return punto ? punto.valor : null;
}

/** Fechas únicas y ordenadas de la serie filtrada (eje X y tooltip). */
export function fechasOrdenadas(evaluaciones: ControlAntropometricoDetalleDTO[]): string[] {
  const fechas = new Set<string>();
  for (const evaluacion of evaluaciones) fechas.add(evaluacion.fechaEvaluacion);
  return [...fechas].sort((a, b) => fechaCalendarioMs(a) - fechaCalendarioMs(b));
}

function etiquetaDeltaAccesible(delta: DeltaMetrica): string {
  const { metrica, valorInicial, valorFinal, diferencia } = delta;
  if (valorInicial === null || valorFinal === null) {
    return `${metrica.etiqueta}: sin mediciones en el rango.`;
  }
  if (diferencia === null) {
    return `${metrica.etiqueta}: una sola medición de ${formatearValorMetrica(metrica, valorFinal)} en el rango.`;
  }
  const unidad = metrica.unidad === '%' ? 'puntos porcentuales' : metrica.unidad;
  const signo = diferencia > 0 ? '+' : '';
  return `${metrica.etiqueta}: de ${formatearValorMetrica(metrica, valorInicial)} a ${formatearValorMetrica(
    metrica,
    valorFinal
  )} (variación ${signo}${diferencia.toFixed(2)} ${unidad}).`;
}

/**
 * Resumen textual del gráfico para `aria-label` (RF-004: role="img" + resumen). Ejemplo:
 * "Gráfico de evolución del 3 de julio de 2026 al 21 de septiembre de 2026. Peso: de 77.70 kg
 * a 74.50 kg (variación -3.20 kg)."
 */
export function resumenAccesible(
  evaluaciones: ControlAntropometricoDetalleDTO[],
  deltas: DeltaMetrica[],
  formatoFecha: (fecha: string) => string | null
): string {
  if (evaluaciones.length === 0) {
    return 'Gráfico de evolución corporal sin mediciones en el rango seleccionado.';
  }

  const desde = formatoFecha(evaluaciones[0].fechaEvaluacion) ?? evaluaciones[0].fechaEvaluacion;
  const hasta =
    formatoFecha(evaluaciones[evaluaciones.length - 1].fechaEvaluacion) ??
    evaluaciones[evaluaciones.length - 1].fechaEvaluacion;

  const partes = deltas.map(etiquetaDeltaAccesible);
  return `Gráfico de evolución del ${desde} al ${hasta}. ${partes.join(' ')}`;
}
