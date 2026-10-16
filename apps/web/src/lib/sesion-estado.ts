/**
 * Estado de la sesión del alumno en la pantalla de entrenamiento (RF-001, lote E7).
 * Funciones puras o con el almacenamiento inyectado, sin React.
 */
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { estimarCumpleRachaPorVolumen } from './racha';

/**
 * Copia para editar sin tocar el estado anterior: ejercicios, series y cada serie son objetos
 * nuevos. Los handlers mutan la copia y la publican con `setSesion`.
 */
export function clonarSesionParaEdicion(
  sesion: SesionEntrenamientoDetalleDTO
): SesionEntrenamientoDetalleDTO {
  return {
    ...sesion,
    ejercicios: sesion.ejercicios.map((ejercicio) => ({
      ...ejercicio,
      series: ejercicio.series.map((serie) => ({ ...serie })),
    })),
  };
}

/**
 * Porcentaje de series completadas y estimación local de la racha desde las series ACTUALES.
 * D8 (RN-02): la racha usa la MISMA regla que el servidor (volumen ponderado con fallback a
 * series), no un simple % de series; el servidor sigue siendo la autoridad.
 */
export function recalcularCumplimiento(sesion: SesionEntrenamientoDetalleDTO): {
  porcentajeCumplimiento: string;
  cumpleReglaRacha: boolean;
} {
  const series = sesion.ejercicios.flatMap((ejercicio) => ejercicio.series);
  const completadas = series.filter((serie) => serie.completada).length;
  return {
    porcentajeCumplimiento:
      series.length > 0 ? ((completadas / series.length) * 100).toFixed(2) : '0.00',
    cumpleReglaRacha: estimarCumpleRachaPorVolumen(series),
  };
}

/** Clave de `sessionStorage` del ejercicio elegido con "Hacer ahora" en una sesión. */
export function claveEjercicioPreferido(sesionId: string): string {
  return `guachafit_foco_preferido_${sesionId}`;
}

/** Ejercicio preferido guardado; `null` si no hay, no es válido o el almacenamiento falla. */
export function leerEjercicioPreferido(
  almacen: Pick<Storage, 'getItem'> | null,
  sesionId: string
): number | null {
  if (!almacen) return null;
  try {
    const valor = almacen.getItem(claveEjercicioPreferido(sesionId));
    if (valor === null || !/^\d+$/.test(valor)) return null;
    return Number(valor);
  } catch {
    return null;
  }
}

/** Guarda (o borra con `null`) el ejercicio preferido; nunca rompe la pantalla. */
export function guardarEjercicioPreferido(
  almacen: Pick<Storage, 'setItem' | 'removeItem'> | null,
  sesionId: string,
  indice: number | null
): void {
  if (!almacen) return;
  try {
    const clave = claveEjercicioPreferido(sesionId);
    if (indice === null) almacen.removeItem(clave);
    else almacen.setItem(clave, String(indice));
  } catch {
    // Almacenamiento no disponible (modo privado): el preferido vive solo en memoria.
  }
}

/** `sessionStorage` si está disponible; `null` en SSR o si el navegador lo bloquea. */
export function almacenDeSesion(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
