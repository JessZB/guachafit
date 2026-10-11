/**
 * Modo foco del entrenamiento (RF-001, lote E5): qué serie se enfoca y cómo se describe el
 * avance. El foco sigue la primera serie pendiente en orden; "Hacer ahora" fija un ejercicio
 * preferido y, cuando ese termina, el foco sigue por los posteriores y vuelve al principio.
 * Funciones puras, sin React.
 */
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';

export interface PosicionFoco {
  ejercicioIndex: number;
  serieIndex: number;
}

export interface ProgresoFoco {
  ejercicioNumero: number;
  totalEjercicios: number;
  serieNumero: number;
  totalSeries: number;
  /** Series pendientes del ejercicio, incluida la actual. */
  seriesRestantes: number;
}

/** Índices de ejercicio desde `inicio`, hacia delante y volviendo al principio. */
function ordenDesde(inicio: number, total: number): number[] {
  return Array.from({ length: total }, (_, desplazamiento) => (inicio + desplazamiento) % total);
}

function primeraPendiente(sesion: SesionEntrenamientoDetalleDTO, ejercicioIndex: number): number {
  return sesion.ejercicios[ejercicioIndex]?.series.findIndex((serie) => !serie.completada) ?? -1;
}

export function posicionEnFoco(
  sesion: SesionEntrenamientoDetalleDTO,
  ejercicioPreferido: number | null
): PosicionFoco | null {
  const total = sesion.ejercicios.length;
  if (total === 0) return null;
  const inicio =
    ejercicioPreferido !== null && ejercicioPreferido >= 0 && ejercicioPreferido < total
      ? ejercicioPreferido
      : 0;
  for (const ejercicioIndex of ordenDesde(inicio, total)) {
    const serieIndex = primeraPendiente(sesion, ejercicioIndex);
    if (serieIndex >= 0) return { ejercicioIndex, serieIndex };
  }
  return null;
}

export function progresoFoco(
  sesion: SesionEntrenamientoDetalleDTO,
  posicion: PosicionFoco
): ProgresoFoco {
  const series = sesion.ejercicios[posicion.ejercicioIndex]?.series ?? [];
  return {
    ejercicioNumero: posicion.ejercicioIndex + 1,
    totalEjercicios: sesion.ejercicios.length,
    serieNumero: posicion.serieIndex + 1,
    totalSeries: series.length,
    seriesRestantes: series.filter((serie) => !serie.completada).length,
  };
}

/** 'Ejercicio 2 de 5 · Serie 3 de 4'. */
export function textoProgresoFoco(progreso: ProgresoFoco): string {
  return `Ejercicio ${progreso.ejercicioNumero} de ${progreso.totalEjercicios} · Serie ${progreso.serieNumero} de ${progreso.totalSeries}`;
}

/** 'Queda 1 serie de este ejercicio' / 'Quedan 3 series de este ejercicio'. */
export function textoSeriesRestantes(seriesRestantes: number): string {
  return seriesRestantes === 1
    ? 'Queda 1 serie de este ejercicio'
    : `Quedan ${seriesRestantes} series de este ejercicio`;
}

/** Siguiente ejercicio distinto del actual con series pendientes (hacia delante y en bucle). */
export function siguienteEjercicioPendiente(
  sesion: SesionEntrenamientoDetalleDTO,
  posicion: PosicionFoco
): number | null {
  const total = sesion.ejercicios.length;
  for (const ejercicioIndex of ordenDesde(posicion.ejercicioIndex + 1, total)) {
    if (ejercicioIndex === posicion.ejercicioIndex) continue;
    if (primeraPendiente(sesion, ejercicioIndex) >= 0) return ejercicioIndex;
  }
  return null;
}
