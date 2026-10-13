/**
 * Helpers puros residuales de `GraficoEvolucion` (Ola 3, módulo `grafico-evolucion`).
 *
 * El cálculo grueso vive en `evolucion-graficos.ts`; aquí solo quedan los dos formateos
 * que el componente definía en local (`GraficoEvolucion.tsx:101-107`): el tick del eje Y
 * y el aplanado de series para el dominio. Sin DOM ni datos: testeable sin montar.
 */
import type { SerieMetrica } from './evolucion-graficos';

/** Tick del eje Y: sin decimales desde 100, una decimal por debajo. */
export function formatearTickEvolucion(valor: number): string {
  return Math.abs(valor) >= 100 ? valor.toFixed(0) : valor.toFixed(1);
}

/** Todos los valores de las series, para calcular el dominio del eje. */
export function valoresDeSeriesEvolucion(series: SerieMetrica[]): number[] {
  return series.flatMap((serie) => serie.puntos.map((punto) => punto.valor));
}
