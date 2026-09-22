/**
 * Reglas de presentación del módulo de nutrición (RF-002 RN-01/RN-03/§6).
 *
 * Este módulo es la única fuente de verdad de:
 * - Las etiquetas humanas del semáforo nutricional y del estado DERIVADO `No reportado`
 *   (nunca se imprimen valores crudos en snake_case).
 * - El calendario nutricional del coach: `NO_REPORTADO` se deriva para los días CERRADOS
 *   (anteriores al día local en curso) sin check-in; el día en curso sin reporte NO es un
 *   estado (`null`): mostrarlo como no reportado antes de las 23:59 sería deshonesto.
 * - La lectura del resultado de tolerancia ±10 % que devuelve la API: el cálculo replica el
 *   evaluador del servidor (`evaluarToleranciaNutricional`) con la MISMA constante compartida
 *   para poder presentar el detalle por dimensión de un día ya registrado sin volver a reportar.
 */
import {
  EstadoDiaNutricional,
  SemaforoNutricional,
  TOLERANCIA_TOTALES_NUTRICIONAL_PCT,
  TipoComida,
  type CheckinNutricionalDetalleDTO,
  type MetasNutricionalesDetalleDTO,
  type ToleranciaNutricionalDTO,
} from '@guachafit/shared';
import type { EtiquetaVisual, TonoSemaforo } from './adherencia';

// =============================================================================
// ETIQUETAS HUMANAS
// =============================================================================

const ETIQUETAS_TIPO_COMIDA: Record<TipoComida, string> = {
  [TipoComida.DESAYUNO]: 'Desayuno',
  [TipoComida.ALMUERZO]: 'Almuerzo',
  [TipoComida.CENA]: 'Cena',
  [TipoComida.SNACK]: 'Merienda',
};

/** Etiqueta humana de la comida de una foto de platos (RN-03). */
export function etiquetaTipoComida(tipo?: string | null): string {
  return ETIQUETAS_TIPO_COMIDA[tipo as TipoComida] ?? 'Comida';
}

/** Semáforo persistido del check-in (`cumplido` | `parcial` | `no_cumplido`). */
export function etiquetaSemaforoNutricional(semaforo?: string | null): EtiquetaVisual {
  switch (semaforo) {
    case SemaforoNutricional.CUMPLIDO:
    case EstadoDiaNutricional.CUMPLIDO:
      return { texto: 'Cumplido', tono: 'success' };
    case SemaforoNutricional.PARCIAL:
    case EstadoDiaNutricional.PARCIAL:
      return { texto: 'Parcial', tono: 'warning' };
    case SemaforoNutricional.NO_CUMPLIDO:
    case EstadoDiaNutricional.NO_CUMPLIDO:
      return { texto: 'No cumplido', tono: 'danger' };
    case EstadoDiaNutricional.NO_REPORTADO:
      return { texto: 'No reportado', tono: 'neutral' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}

/** Etiqueta del estado diario del calendario; `null` = día en curso sin estado todavía. */
export function etiquetaEstadoDia(estado: EstadoDiaNutricional | null | undefined): EtiquetaVisual {
  if (!estado) return { texto: 'Día en curso', tono: 'info' };
  return etiquetaSemaforoNutricional(estado);
}

// =============================================================================
// TOLERANCIA ±10 % (ESPECJO DEL EVALUADOR DEL SERVIDOR)
// =============================================================================

/** Redondeo a 2 decimales, idéntico al contrato del endpoint. */
function redondearPorcentaje(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Réplica cliente de `evaluarToleranciaNutricional` (API) para presentar el detalle de un día ya
 * registrado. Sin metas, o sin reporte en una dimensión, esa dimensión no se evalúa (`undefined`):
 * "sin evaluar", nunca un falso OK.
 */
export function evaluarToleranciaNutricionalLocal(
  caloriasReportadas?: number | null,
  proteinaGramosReportada?: number | null,
  metas?: Pick<MetasNutricionalesDetalleDTO, 'caloriasObjetivo' | 'proteinaGramosObjetivo'> | null
): ToleranciaNutricionalDTO {
  if (!metas) return {};

  const metaCalorias = metas.caloriasObjetivo ?? null;
  const metaProteina = metas.proteinaGramosObjetivo ?? null;
  const hayCalorias =
    metaCalorias !== null && metaCalorias > 0 && caloriasReportadas !== null && caloriasReportadas !== undefined;
  const hayProteina =
    metaProteina !== null &&
    metaProteina > 0 &&
    proteinaGramosReportada !== null &&
    proteinaGramosReportada !== undefined;

  if (!hayCalorias && !hayProteina) return {};

  const desviacionCaloriasPct = hayCalorias
    ? redondearPorcentaje(((caloriasReportadas! - metaCalorias!) / metaCalorias!) * 100)
    : undefined;
  const desviacionProteinasPct = hayProteina
    ? redondearPorcentaje(((proteinaGramosReportada! - metaProteina!) / metaProteina!) * 100)
    : undefined;

  const dimensiones = [
    ...(desviacionCaloriasPct !== undefined
      ? [Math.abs(desviacionCaloriasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT]
      : []),
    ...(desviacionProteinasPct !== undefined
      ? [Math.abs(desviacionProteinasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT]
      : []),
  ];

  return {
    dentroMargenTolerancia: dimensiones.every(Boolean),
    desviacionCaloriasPct,
    desviacionProteinasPct,
  };
}

export type NivelTolerancia = 'verde' | 'ambar' | 'rojo' | 'sin_evaluar';

export interface ClasificacionTolerancia {
  nivel: NivelTolerancia;
  texto: string;
  tono: TonoSemaforo;
}

/**
 * Semáforo de tolerancia derivado del DTO real: verde (todas las dimensiones evaluadas dentro
 * del ±10 %), ámbar (alguna dentro y otra fuera) y rojo (todas fuera). Sin dimensiones
 * evaluadas es "Sin evaluar" (neutral): el alumno no tiene metas o no reportó totales.
 */
export function clasificarTolerancia(tolerancia: ToleranciaNutricionalDTO): ClasificacionTolerancia {
  const desviaciones = [tolerancia.desviacionCaloriasPct, tolerancia.desviacionProteinasPct].filter(
    (valor): valor is number => valor !== undefined
  );

  if (desviaciones.length === 0) {
    return { nivel: 'sin_evaluar', texto: 'Sin evaluar', tono: 'neutral' };
  }

  const dentro = desviaciones.filter(
    (pct) => Math.abs(pct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT
  ).length;

  if (dentro === desviaciones.length) {
    return { nivel: 'verde', texto: `Dentro del margen (±${TOLERANCIA_TOTALES_NUTRICIONAL_PCT}%)`, tono: 'success' };
  }
  if (dentro === 0) {
    return { nivel: 'rojo', texto: `Fuera del margen (±${TOLERANCIA_TOTALES_NUTRICIONAL_PCT}%)`, tono: 'danger' };
  }
  return { nivel: 'ambar', texto: 'Parcialmente dentro del margen', tono: 'warning' };
}

/** Desvío con signo y hasta 2 decimales: `+4.5%`, `-12.3%`, `0%`. Null si no hay dato. */
export function formatearDesviacionPct(desviacionPct?: number | null): string | null {
  if (desviacionPct === null || desviacionPct === undefined || !Number.isFinite(desviacionPct)) {
    return null;
  }
  const signo = desviacionPct > 0 ? '+' : '';
  return `${signo}${desviacionPct}%`;
}

// =============================================================================
// METAS DEL COACH (RN-01)
// =============================================================================

export interface ObjetivoMeta {
  etiqueta: string;
  valor: string;
}

/**
 * Objetivos configurados listos para UI. Un objetivo `null` NO se muestra como 0: se omite de la
 * lista y el llamador declara "Sin metas configuradas" si la lista queda vacía.
 */
export function resumenMetas(metas?: MetasNutricionalesDetalleDTO | null): ObjetivoMeta[] {
  if (!metas) return [];
  const objetivos: ObjetivoMeta[] = [];
  if (metas.caloriasObjetivo !== null) {
    objetivos.push({ etiqueta: 'Calorías', valor: `${metas.caloriasObjetivo} kcal` });
  }
  if (metas.proteinaGramosObjetivo !== null) {
    objetivos.push({ etiqueta: 'Proteína', valor: `${metas.proteinaGramosObjetivo} g` });
  }
  if (metas.carbohidratosGramosObjetivo !== null) {
    objetivos.push({ etiqueta: 'Carbohidratos', valor: `${metas.carbohidratosGramosObjetivo} g` });
  }
  if (metas.grasasGramosObjetivo !== null) {
    objetivos.push({ etiqueta: 'Grasas', valor: `${metas.grasasGramosObjetivo} g` });
  }
  if (metas.aguaLitrosObjetivo !== null) {
    objetivos.push({ etiqueta: 'Agua', valor: `${metas.aguaLitrosObjetivo} L` });
  }
  return objetivos;
}

/** `true` si la fila de metas tiene al menos un objetivo o recurso declarado. */
export function metasConfiguradas(metas?: MetasNutricionalesDetalleDTO | null): boolean {
  if (!metas) return false;
  return (
    resumenMetas(metas).length > 0 || (metas.recursos?.length ?? 0) > 0
  );
}

// =============================================================================
// CALENDARIO NUTRICIONAL Y "NO REPORTADO" (§6)
// =============================================================================

/**
 * Estado del día para el calendario nutricional:
 * - Con check-in: el semáforo persistido.
 * - Día CERRADO (anterior al día local en curso) sin check-in: `NO_REPORTADO`.
 * - Día en curso o futuro sin check-in: `null` (todavía no hay estado que declarar).
 */
export function derivarEstadoDiaNutricional(
  fecha: string,
  hoyLocal: string,
  semaforo?: SemaforoNutricional | null
): EstadoDiaNutricional | null {
  if (semaforo) return semaforo as unknown as EstadoDiaNutricional;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha >= hoyLocal) return null;
  return EstadoDiaNutricional.NO_REPORTADO;
}

export interface DiaCalendarioNutricional {
  fecha: string;
  estado: EstadoDiaNutricional | null;
  checkin: CheckinNutricionalDetalleDTO | null;
}

/**
 * Calendario nutricional de las fechas indicadas (normalmente últimos N días, descendente):
 * combina los check-ins reales con el estado derivado de cada día.
 */
export function crearCalendarioNutricional(
  fechas: string[],
  checkins: CheckinNutricionalDetalleDTO[],
  hoyLocal: string
): DiaCalendarioNutricional[] {
  const porFecha = new Map(checkins.map((checkin) => [checkin.fecha, checkin]));
  return fechas.map((fecha) => {
    const checkin = porFecha.get(fecha) ?? null;
    return {
      fecha,
      checkin,
      estado: derivarEstadoDiaNutricional(fecha, hoyLocal, checkin?.semaforo ?? null),
    };
  });
}

/** Días cerrados sin reporte dentro del calendario (§6: alimenta la alerta del resumen semanal). */
export function contarNoReportados(dias: DiaCalendarioNutricional[]): number {
  return dias.filter((dia) => dia.estado === EstadoDiaNutricional.NO_REPORTADO).length;
}

// =============================================================================
// TOTALES REPORTADOS
// =============================================================================

/** Totales reportados de un check-in listos para UI; null cuando no hay dato (nunca 0 fabricado). */
export function resumenTotalesReportados(
  checkin?: CheckinNutricionalDetalleDTO | null
): ObjetivoMeta[] {
  if (!checkin) return [];
  const totales: ObjetivoMeta[] = [];
  if (checkin.caloriasReportadas !== null && checkin.caloriasReportadas !== undefined) {
    totales.push({ etiqueta: 'Calorías', valor: `${checkin.caloriasReportadas} kcal` });
  }
  if (
    checkin.proteinaGramosReportada !== null &&
    checkin.proteinaGramosReportada !== undefined
  ) {
    totales.push({ etiqueta: 'Proteína', valor: `${checkin.proteinaGramosReportada} g` });
  }
  if (checkin.aguaLitros) {
    totales.push({ etiqueta: 'Agua', valor: `${checkin.aguaLitros} L` });
  }
  return totales;
}
