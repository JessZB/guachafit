/**
 * Precarga del peso con el plan (RF-001, decisión del dueño): el campo de peso de una serie
 * pendiente que el alumno aún no ha tocado parte del peso prescrito, como valor real, editable y
 * enviable. Sin dependencias: lo comparten la fila de la serie, el marcado y el cronómetro.
 *
 * Contrato sobre `pesoKg` de la serie:
 * - `null` / `undefined`: el alumno no ha decidido nada; manda el plan.
 * - `''`: el alumno borró el peso a propósito (el peso es opcional, RN-01); el plan NO reaparece.
 * - cualquier otro texto (incluido `'0.00'`): peso propio, gana siempre sobre el plan.
 */

export interface PesoDeSerie {
  pesoKg?: string | null;
  pesoPrescritoKg?: string | null;
}

/** Devuelve el plan solo si es un número finito mayor que cero; si no, `null`. */
function pesoDelPlanValido(pesoPrescritoKg: string | null | undefined): string | null {
  if (pesoPrescritoKg === null || pesoPrescritoKg === undefined) return null;
  const numero = Number(pesoPrescritoKg);
  return Number.isFinite(numero) && numero > 0 ? pesoPrescritoKg : null;
}

/** `true` cuando el alumno no ha fijado peso (`null`/`undefined`) y el plan trae uno válido. */
export function pesoVieneDelPlan(serie: PesoDeSerie): boolean {
  if (serie.pesoKg !== null && serie.pesoKg !== undefined) return false;
  return pesoDelPlanValido(serie.pesoPrescritoKg) !== null;
}

/** Peso que se muestra y se envía: el propio de la serie, o el plan si aún no se ha fijado. */
export function pesoEfectivoKg(serie: PesoDeSerie): string | null {
  if (serie.pesoKg !== null && serie.pesoKg !== undefined) return serie.pesoKg;
  return pesoDelPlanValido(serie.pesoPrescritoKg);
}
