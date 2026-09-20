/**
 * WU20: filtros de la cola de evaluaciones antropométricas pendientes.
 *
 * La página muestra el nombre del alumno resuelto por el servidor (`alumnoNombre`) y cae al
 * ID recortado cuando falta. La búsqueda opera sobre esa misma etiqueta visible.
 */
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

type PendienteFiltrable = Pick<ControlAntropometricoDetalleDTO, 'alumnoId' | 'alumnoNombre'>;

/**
 * Etiqueta visible del alumno en la cola: nombre completo si el servidor lo resolvió,
 * o el ID recortado como fallback honesto (nunca un nombre inventado).
 */
export function etiquetaAlumnoPendiente(pendiente: PendienteFiltrable): string {
  const nombre = (pendiente.alumnoNombre ?? '').trim();
  if (nombre.length > 0) return nombre;
  return `ID Alumno: ${pendiente.alumnoId.slice(0, 8)}...`;
}

/** Filtro por nombre del alumno (también acepta el ID como texto, útil para el fallback). */
export function filtrarPendientesAntropometria<T extends PendienteFiltrable>(
  pendientes: readonly T[],
  busqueda = ''
): T[] {
  const termino = normalizarTextoBusqueda(busqueda);
  if (termino.length === 0) return [...pendientes];

  return pendientes.filter((pendiente) => {
    if (normalizarTextoBusqueda(pendiente.alumnoNombre).includes(termino)) return true;
    return normalizarTextoBusqueda(pendiente.alumnoId).includes(termino);
  });
}

/** ¿Hay búsqueda activa? (para "N de M" y el vacío "Sin resultados"). */
export function hayBusquedaAntropometriaActiva(busqueda = ''): boolean {
  return normalizarTextoBusqueda(busqueda).length > 0;
}
