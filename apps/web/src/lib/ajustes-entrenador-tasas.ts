/**
 * RF-018 · Ajustes del entrenador: reglas de tasas de cambio (lógica pura, ADR-003).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:227-240` (conversor) y `:352-372`
 * (`handleGuardarTasa`). Sin DOM ni red.
 */

/** Fuente de tasa del formulario. Unión propia de la vista (no es `CalculoConversionDTO.fuenteTasa`). */
export type FuenteTasaAjustes = 'oficial_bcv' | 'paralelo' | 'manual';

export interface EntradasTasa {
  tasaOficialBcv: string;
  tasaParalelo: string;
  tasaActiva: string;
}

/**
 * Tasa final a guardar según la fuente elegida. Con `oficial_bcv`/`paralelo` la tasa
 * activa se sincroniza con el campo de la fuente; con `manual` se conserva la activa.
 * Réplica exacta de `AjustesPage.tsx:353-360`.
 */
export function resolverTasaFinal(
  fuente: FuenteTasaAjustes,
  entradas: EntradasTasa
): { tasaFinal: string; tasaActivaSincronizada: string } {
  if (fuente === 'oficial_bcv') {
    return { tasaFinal: entradas.tasaOficialBcv, tasaActivaSincronizada: entradas.tasaOficialBcv };
  }
  if (fuente === 'paralelo') {
    return { tasaFinal: entradas.tasaParalelo, tasaActivaSincronizada: entradas.tasaParalelo };
  }
  return { tasaFinal: entradas.tasaActiva, tasaActivaSincronizada: entradas.tasaActiva };
}

/** Cuerpo de `PUT /finanzas/tasas`. Réplica exacta de `AjustesPage.tsx:364-372`. */
export function construirPayloadTasa(
  entradas: EntradasTasa,
  tasaFinal: string,
  fuente: FuenteTasaAjustes
): {
  tasaOficialBcv: string;
  tasaParalelo: string | undefined;
  tasaActivaEntrenador: string;
  fuente: FuenteTasaAjustes;
} {
  return {
    tasaOficialBcv: parseFloat(entradas.tasaOficialBcv).toFixed(4),
    // D6: paralelo no informado se omite (nunca se envía "NaN").
    tasaParalelo:
      parseFloat(entradas.tasaParalelo) > 0
        ? parseFloat(entradas.tasaParalelo).toFixed(4)
        : undefined,
    tasaActivaEntrenador: parseFloat(tasaFinal).toFixed(4),
    fuente,
  };
}

/**
 * USD→VES con `toFixed(2)`; sin tasa no se proyecta resultado ficticio (campo vacío).
 * Réplica exacta de `actualizarCalculosVes` (`AjustesPage.tsx:227-232`).
 */
export function calcularVesDesdeUsd(tasaStr: string, usdStr: string): string {
  const tasa = parseFloat(tasaStr) || 0;
  const usd = parseFloat(usdStr) || 0;
  return tasa > 0 ? (usd * tasa).toFixed(2) : '';
}

/**
 * VES→USD; sin tasa se conserva el valor actual (el original no tocaba el estado).
 * Réplica exacta de `actualizarCalculosUsd` (`AjustesPage.tsx:234-240`).
 */
export function calcularUsdDesdeVes(tasaStr: string, vesStr: string, usdActual: string): string {
  const tasa = parseFloat(tasaStr) || 0;
  const ves = parseFloat(vesStr) || 0;
  if (tasa > 0) {
    return (ves / tasa).toFixed(2);
  }
  return usdActual;
}
