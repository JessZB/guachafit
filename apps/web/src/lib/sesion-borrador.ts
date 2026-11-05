/**
 * Borrador de series (RF-001, ADR-021): lo tecleado en series NO completadas no se pierde al
 * recargar. No hay un segundo almacén: la copia local de la sesión (`offlineDb.rutinaHoy`) ya
 * guarda lo tecleado, y aquí se vuelca sobre la sesión del servidor antes de mostrarla.
 */
import {
  esPesoKgValido,
  esRpeValido,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { validarReps } from './weight-unit';

/** Un valor local "vacío" (null, undefined o cadena vacía) nunca borra lo del servidor. */
function valorLocalPresente<T>(valor: T | null | undefined): valor is T {
  return valor !== null && valor !== undefined && (valor as unknown) !== '';
}

function combinarSerie(
  servidor: SerieRegistroDetalleDTO,
  local: SerieRegistroDetalleDTO | undefined
): SerieRegistroDetalleDTO {
  const copia = { ...servidor };
  // Gana el servidor en las completadas; el borrador solo aplica si ambas siguen pendientes.
  if (!local || servidor.completada !== false || local.completada !== false) return copia;
  // La copia local vive en IndexedDB y puede venir corrupta o de una versión anterior: cada valor
  // se valida con las mismas reglas del contrato (@guachafit/shared) y, si no cumple, se conserva
  // el del servidor en vez de mostrar o reenviar un dato que el API rechazaría.
  if (valorLocalPresente(local.pesoKg) && typeof local.pesoKg === 'string' && esPesoKgValido(local.pesoKg)) {
    copia.pesoKg = local.pesoKg;
  } else if (local.pesoKg === '' && (servidor.pesoKg === null || servidor.pesoKg === undefined)) {
    // Precarga con el plan: un '' local es "el alumno borró el peso a propósito". Si el servidor
    // aún no tiene peso, se respeta para que el plan no reaparezca al recargar. Con un peso del
    // servidor, el '' local sigue sin borrarlo (arriba).
    copia.pesoKg = '';
  }
  if (
    valorLocalPresente(local.repsLogradas) &&
    typeof local.repsLogradas === 'number' &&
    validarReps(local.repsLogradas) === null
  ) {
    copia.repsLogradas = local.repsLogradas;
  }
  if (valorLocalPresente(local.rpe) && typeof local.rpe === 'string' && esRpeValido(local.rpe)) {
    copia.rpe = local.rpe;
  }
  return copia;
}

/** La copia local es utilizable solo si su estructura `ejercicios[].series[]` es de arrays. */
function estructuraLocalValida(local: SesionEntrenamientoDetalleDTO): boolean {
  return (
    Array.isArray(local.ejercicios) &&
    local.ejercicios.every(
      (ejercicio) =>
        ejercicio !== null && typeof ejercicio === 'object' && Array.isArray(ejercicio.series)
    )
  );
}

/**
 * Devuelve una copia de la sesión del servidor con `pesoKg`, `repsLogradas` y `rpe` locales en
 * las series pendientes (buscadas por `id`). No añade series que el servidor no tiene ni toca
 * `timestampInicioUtc`, `descansoSegundos` ni el estado de la sesión. No muta sus argumentos.
 */
export function combinarSeriesPendientesLocales(
  servidor: SesionEntrenamientoDetalleDTO,
  local: SesionEntrenamientoDetalleDTO | null
): SesionEntrenamientoDetalleDTO {
  // Solo se combina una copia de la MISMA sesión y del MISMO alumno (un cambio de cuenta en el
  // equipo no debe filtrar el borrador de otro alumno) y con estructura íntegra.
  const aplicable =
    local !== null &&
    local.id === servidor.id &&
    local.alumnoId === servidor.alumnoId &&
    estructuraLocalValida(local);
  const seriesLocales = new Map<string, SerieRegistroDetalleDTO>();
  if (aplicable) {
    for (const ejercicio of local.ejercicios) {
      for (const serie of ejercicio.series) {
        if (serie && typeof serie.id === 'string') seriesLocales.set(serie.id, serie);
      }
    }
  }
  return {
    ...servidor,
    ejercicios: servidor.ejercicios.map((ejercicio) => ({
      ...ejercicio,
      series: ejercicio.series.map((serie) => combinarSerie(serie, seriesLocales.get(serie.id))),
    })),
  };
}
