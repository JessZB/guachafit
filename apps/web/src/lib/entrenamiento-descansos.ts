import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';
import { formatearSegundos } from './sesion-tiempos';

export interface ResumenDescansos {
  totalReal: number;
  totalPrescrito: number;
  count: number;
  avgReal: number;
  avgPrescrito: number;
  diff: number;
}

/**
 * Promedio de descanso prescrito vs real sobre las series completadas con dato.
 * Unifica el cálculo que vivía duplicado en la página (notas de cierre y resumen
 * del modal): si una copia cambiaba, las notas al coach y el resumen divergían.
 */
export function resumirDescansos(
  ejercicios: EjercicioSesionDetalleDTO[]
): ResumenDescansos | null {
  let totalReal = 0;
  let totalPrescrito = 0;
  let count = 0;
  ejercicios.forEach((ej) => {
    const prescrito = ej.descansoPrescritoSegundos || 90;
    ej.series.forEach((s) => {
      if (s.completada && s.descansoSegundos) {
        totalReal += s.descansoSegundos;
        totalPrescrito += prescrito;
        count++;
      }
    });
  });
  if (count === 0) return null;
  const avgReal = Math.round(totalReal / count);
  const avgPrescrito = Math.round(totalPrescrito / count);
  return { totalReal, totalPrescrito, count, avgReal, avgPrescrito, diff: avgReal - avgPrescrito };
}

/**
 * Etiqueta de descanso para las notas al coach.
 * Separador interno "·" (no "•") para que parsearNotasAlumno lo trate
 * como una sola etiqueta y no parta el tag en dos.
 */
export function construirEtiquetaDescanso(resumen: ResumenDescansos): string {
  const diffStr =
    resumen.diff > 0
      ? `+${formatearSegundos(resumen.diff)}`
      : resumen.diff < 0
      ? `${formatearSegundos(-resumen.diff)} menos`
      : 'exacto';
  return `[Descanso promedio: ${formatearSegundos(resumen.avgReal)} (planificado: ${formatearSegundos(resumen.avgPrescrito)} · ${diffStr})]`;
}
