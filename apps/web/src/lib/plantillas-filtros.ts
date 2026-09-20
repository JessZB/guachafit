/**
 * WU20: filtros del banco de plantillas de ejercicios (estado + búsqueda + nivel objetivo).
 *
 * Lógica pura y testeable: el componente solo mantiene el estado y aplica estas funciones
 * sobre la lista cargada, preservando su orden. El vacío por estado (sin activas/sin
 * desactivadas) se distingue del vacío por búsqueda o nivel con `hayFiltroPlantillasActivo`.
 */
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

export type FiltroEstadoPlantilla = 'activas' | 'desactivadas' | 'todas';
export type FiltroNivelPlantilla = NivelObjetivoPlantilla | 'todos';

type PlantillaFiltrable = Pick<PlantillaRutinaResumenDTO, 'nombre' | 'activa' | 'nivelObjetivo'>;

/** ¿La plantilla entra en el grupo de estado seleccionado? */
export function coincideFiltroEstadoPlantilla(
  plantilla: Pick<PlantillaFiltrable, 'activa'>,
  estado: FiltroEstadoPlantilla
): boolean {
  if (estado === 'todas') return true;
  return estado === 'activas' ? plantilla.activa : !plantilla.activa;
}

/** Contadores de los chips de estado (paridad exacta con lo que muestra cada chip). */
export function contarPlantillasPorEstado(
  plantillas: readonly Pick<PlantillaFiltrable, 'activa'>[]
): Record<FiltroEstadoPlantilla, number> {
  const conteos: Record<FiltroEstadoPlantilla, number> = {
    activas: 0,
    desactivadas: 0,
    todas: plantillas.length,
  };
  for (const plantilla of plantillas) {
    if (plantilla.activa) conteos.activas += 1;
    else conteos.desactivadas += 1;
  }
  return conteos;
}

export interface OpcionesFiltroPlantillas {
  busqueda?: string;
  nivel?: FiltroNivelPlantilla;
  estado?: FiltroEstadoPlantilla;
}

/**
 * Filtro combinado (estado + nivel + nombre). Sin opciones aplica el estado por defecto
 * `activas` (mismo arranque que el listado actual).
 */
export function filtrarPlantillas<T extends PlantillaFiltrable>(
  plantillas: readonly T[],
  opciones: OpcionesFiltroPlantillas = {}
): T[] {
  const termino = normalizarTextoBusqueda(opciones.busqueda);
  const nivel = opciones.nivel ?? 'todos';
  const estado = opciones.estado ?? 'activas';

  return plantillas.filter((plantilla) => {
    if (!coincideFiltroEstadoPlantilla(plantilla, estado)) return false;
    if (nivel !== 'todos' && plantilla.nivelObjetivo !== nivel) return false;
    if (termino.length === 0) return true;
    return normalizarTextoBusqueda(plantilla.nombre).includes(termino);
  });
}

/**
 * ¿Hay búsqueda o nivel activo? (para "N de M", el estado vacío "Sin resultados" y su
 * botón "Limpiar filtros"). El filtro de estado NO cuenta aquí: su vacío tiene copy propio.
 */
export function hayFiltroPlantillasActivo(
  opciones: Pick<OpcionesFiltroPlantillas, 'busqueda' | 'nivel'> = {}
): boolean {
  return (
    normalizarTextoBusqueda(opciones.busqueda).length > 0 ||
    (opciones.nivel ?? 'todos') !== 'todos'
  );
}
