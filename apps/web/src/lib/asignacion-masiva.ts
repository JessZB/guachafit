/**
 * RF-017 RN-03 (A6): asignación de una plantilla a varios alumnos a la vez.
 * Lógica pura (selección con tope, textos de confirmación y resultado por alumno) para poder
 * testearla sin DOM.
 */
import { ModoAsignacionPlantilla, type ResultadoAsignacionAlumnoDTO } from '@guachafit/shared';
import { ApiError } from './api-client';
import { traducirMensajeSuelto } from './mensajes-error';

/** Techo del contrato `AsignarPlantillaSchema.alumnoIds` (máximo 50 por solicitud). */
export const MAX_ALUMNOS_ASIGNACION = 50;

export interface ResultadoSeleccion {
  seleccion: string[];
  /** `true` si se intentó agregar un alumno con la selección ya llena. */
  limiteAlcanzado: boolean;
}

export function alternarSeleccionAlumno(
  seleccion: string[],
  alumnoId: string,
  maximo: number = MAX_ALUMNOS_ASIGNACION
): ResultadoSeleccion {
  if (seleccion.includes(alumnoId)) {
    return { seleccion: seleccion.filter((id) => id !== alumnoId), limiteAlcanzado: false };
  }
  if (seleccion.length >= maximo) return { seleccion, limiteAlcanzado: true };
  return { seleccion: [...seleccion, alumnoId], limiteAlcanzado: false };
}

/** Texto del diálogo que confirma el modo "reemplazar". */
export function textoConfirmacionReemplazo(cantidad: number, nombreUnico?: string): string {
  const destinatario =
    cantidad === 1 && nombreUnico ? nombreUnico : `${cantidad} alumno${cantidad === 1 ? '' : 's'}`;
  return `Vas a reemplazar la rutina actual de ${destinatario}. ¿Continuar?`;
}

export interface FilaResultadoAsignacion {
  alumnoId: string;
  nombre: string;
  exito: boolean;
  mensaje: string;
}

/**
 * Resultado legible por alumno. Los errores de `resultados[].error` pasan por la traducción de
 * mensajes-error: un texto técnico de la API se reemplaza por un mensaje genérico amigable.
 */
export function describirResultadosAsignacion(
  resultados: ResultadoAsignacionAlumnoDTO[],
  nombresPorId: Record<string, string>
): FilaResultadoAsignacion[] {
  return resultados.map((resultado) => {
    const nombre =
      nombresPorId[resultado.alumnoId] ??
      (resultado.usuarioId ? nombresPorId[resultado.usuarioId] : undefined) ??
      'Alumno';
    if (resultado.exito) {
      return {
        alumnoId: resultado.alumnoId,
        nombre,
        exito: true,
        mensaje: resultado.rutinaNombre
          ? `Rutina asignada: «${resultado.rutinaNombre}»`
          : 'Rutina asignada',
      };
    }
    return {
      alumnoId: resultado.alumnoId,
      nombre,
      exito: false,
      mensaje: traducirMensajeSuelto(resultado.error),
    };
  });
}

/** Tamaño de página de `GET /alumnos` (techo de `FiltroDirectorioAlumnosSchema.limit`). */
export const LIMITE_PAGINA_ALUMNOS_ASIGNACION = 100;

/**
 * URL de una página del directorio. La búsqueda se hace en el servidor con `q` (ILIKE sobre
 * nombre/apellido/correo/documento); sin término no se envía `q`.
 */
export function construirUrlAlumnosAsignacion(
  busqueda: string,
  offset: number,
  limit: number = LIMITE_PAGINA_ALUMNOS_ASIGNACION
): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const termino = busqueda.trim();
  if (termino) params.set('q', termino);
  return `/alumnos?${params.toString()}`;
}

/** Agrega una página nueva a la lista sin repetir alumnos (por `id`). */
export function combinarPaginasAlumnos<T extends { id: string }>(previos: T[], nuevos: T[]): T[] {
  const vistos = new Set(previos.map((alumno) => alumno.id));
  const combinados = [...previos];
  for (const alumno of nuevos) {
    if (vistos.has(alumno.id)) continue;
    vistos.add(alumno.id);
    combinados.push(alumno);
  }
  return combinados;
}

/** Hay más alumnos si faltan para el `total`; sin `total`, si la última página vino llena. */
export function hayMasAlumnos({
  cargados,
  total,
  tamanoUltimaPagina,
  limit = LIMITE_PAGINA_ALUMNOS_ASIGNACION,
}: {
  cargados: number;
  total: number | undefined;
  tamanoUltimaPagina: number;
  limit?: number;
}): boolean {
  if (typeof total === 'number') return cargados < total;
  return tamanoUltimaPagina === limit;
}

/** Estado vacío: distingue "no hay alumnos" de "la búsqueda no encontró nada". */
export function mensajeListaVaciaAlumnos(busqueda: string): string {
  return busqueda.trim()
    ? 'Ningún alumno coincide con la búsqueda.'
    : 'Todavía no tienes alumnos.';
}

export const MENSAJE_ASIGNACION_INCIERTA =
  'No sabemos si la asignación se completó. Revisa la rutina de tus alumnos antes de volver a intentarlo.';

/**
 * `POST /plantillas/:id/asignar` NO acepta `X-Idempotency-Key`: si la respuesta no llegó (red,
 * timeout/cancelación) o el servidor falló (5xx/408), la asignación pudo aplicarse igual.
 * Un 4xx es un rechazo claro: no se aplicó nada.
 */
export function esFalloAmbiguoAsignacion(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 408;
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException) {
    return error.name === 'AbortError' || error.name === 'TimeoutError';
  }
  // Error desconocido: no sabemos si llegó al servidor, así que lo tratamos como ambiguo.
  return true;
}

/**
 * Tras un fallo ambiguo, reintentar en modo Añadir podría duplicar los días: se pide confirmación.
 * Reemplazar ya tiene su propia confirmación y repetirlo deja el mismo resultado.
 */
export function requiereConfirmacionReintento(
  huboFalloAmbiguo: boolean,
  modo: ModoAsignacionPlantilla
): boolean {
  return huboFalloAmbiguo && modo === ModoAsignacionPlantilla.FUSIONAR;
}
