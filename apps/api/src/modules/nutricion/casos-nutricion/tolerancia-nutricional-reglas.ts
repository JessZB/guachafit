import {
  TOLERANCIA_TOTALES_NUTRICIONAL_PCT,
  type ToleranciaNutricionalDTO,
} from '@guachafit/shared';

// =============================================================================
// METAS Y TOLERANCIA NUTRICIONAL (RF-002, RN-01, RN-04) — lógica pura sin I/O
// =============================================================================

/**
 * Metas del coach tal como las consume el evaluador de tolerancia.
 * Las dimensiones sin meta configurada (null/undefined) no se evalúan.
 */
export interface MetasNutricionalesCoach {
  caloriasObjetivo?: number | null;
  proteinaGramosObjetivo?: number | null;
  /** Meta de hidratación: informativa, no entra en la tolerancia de totales (RN-04). */
  aguaLitrosObjetivo?: string | null;
}

/** Redondeo a 2 decimales del porcentaje de desviación (contrato histórico del endpoint). */
export function redondearPorcentaje(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * RF-002 Escenario 3: compara los totales reportados contra las metas REALES del coach con una
 * tolerancia de ±10% (`TOLERANCIA_TOTALES_NUTRICIONAL_PCT`).
 *
 * - Se evalúa cada dimensión SOLO si hay meta configurada (meta > 0) y total reportado.
 * - `dentroMargenTolerancia` es el AND de las dimensiones evaluadas.
 * - Sin metas del coach, o sin ninguna dimensión evaluable, devuelve `{}` = "sin evaluar":
 *   el alumno no queda marcado, nunca se fabrica un OK (RN-01/Trazabilidad).
 */
export function evaluarToleranciaNutricional(
  caloriasReportadas?: number | null,
  proteinaGramosReportada?: number | null,
  metasCoach?: MetasNutricionalesCoach | null
): ToleranciaNutricionalDTO {
  if (!metasCoach) {
    return {};
  }

  const metaCalorias = metasCoach.caloriasObjetivo ?? null;
  const metaProteina = metasCoach.proteinaGramosObjetivo ?? null;
  const hayCalorias =
    metaCalorias !== null &&
    metaCalorias > 0 &&
    caloriasReportadas !== null &&
    caloriasReportadas !== undefined;
  const hayProteina =
    metaProteina !== null &&
    metaProteina > 0 &&
    proteinaGramosReportada !== null &&
    proteinaGramosReportada !== undefined;

  if (!hayCalorias && !hayProteina) {
    return {};
  }

  const desviacionCaloriasPct = hayCalorias
    ? redondearPorcentaje(((caloriasReportadas! - metaCalorias!) / metaCalorias!) * 100)
    : undefined;
  const desviacionProteinasPct = hayProteina
    ? redondearPorcentaje(((proteinaGramosReportada! - metaProteina!) / metaProteina!) * 100)
    : undefined;

  const caloriasEnMargen =
    desviacionCaloriasPct !== undefined &&
    Math.abs(desviacionCaloriasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT;
  const proteinaEnMargen =
    desviacionProteinasPct !== undefined &&
    Math.abs(desviacionProteinasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT;

  const dimensionesEvaluadas = [
    ...(desviacionCaloriasPct !== undefined ? [caloriasEnMargen] : []),
    ...(desviacionProteinasPct !== undefined ? [proteinaEnMargen] : []),
  ];

  return {
    dentroMargenTolerancia: dimensionesEvaluadas.every(Boolean),
    desviacionCaloriasPct,
    desviacionProteinasPct,
  };
}
