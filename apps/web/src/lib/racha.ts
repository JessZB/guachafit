/**
 * RN-02 (RF-001): estimación local de la regla de racha por VOLUMEN.
 *
 * Espeja exactamente `evaluarCumplimientoRachaPorVolumen` del API
 * (`apps/api/src/modules/entrenamiento/entrenamiento.service.ts`):
 *  - Parte ponderada: series con peso prescrito > 0 → Σ(peso real × reps logradas) / Σ(peso prescrito × reps objetivo).
 *  - Parte cualitativa: series sin peso prescrito → series completadas / series prescritas.
 *  - `cumple` es true solo si TODAS las partes existentes alcanzan >= 70%.
 *
 * La UI la usa como estimación optimista mientras la respuesta real de `POST /sesiones/:id/finalizar`
 * llega; la autoridad final (y la persistencia de la racha) es siempre el servidor.
 */
export interface SerieParaEstimacionRacha {
  pesoPrescritoKg?: string | null;
  pesoKg?: string | null;
  repsObjetivo: number;
  repsLogradas?: number | null;
  completada: boolean;
}

export function estimarCumpleRachaPorVolumen(series: SerieParaEstimacionRacha[]): boolean {
  let volumenRealizadoKg = 0;
  let volumenPrescritoKg = 0;
  let seriesCualitativas = 0;
  let seriesCualitativasCompletadas = 0;

  for (const s of series) {
    const pesoPrescrito = parseFloat(s.pesoPrescritoKg || '0') || 0;
    if (pesoPrescrito > 0) {
      volumenPrescritoKg += pesoPrescrito * (s.repsObjetivo ?? 0);
      if (s.completada) {
        const repsLogradas = s.repsLogradas ?? s.repsObjetivo ?? 0;
        const pesoReal = parseFloat(s.pesoKg || '0') || 0;
        volumenRealizadoKg += pesoReal * repsLogradas;
      }
    } else {
      seriesCualitativas++;
      if (s.completada) seriesCualitativasCompletadas++;
    }
  }

  const partes: boolean[] = [];
  if (volumenPrescritoKg > 0) {
    partes.push((volumenRealizadoKg / volumenPrescritoKg) * 100 >= 70.0);
  }
  if (seriesCualitativas > 0) {
    partes.push((seriesCualitativasCompletadas / seriesCualitativas) * 100 >= 70.0);
  }

  return partes.length > 0 && partes.every(Boolean);
}
