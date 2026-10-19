/**
 * Módulo `alumnos` (fase B, prompt 53) · lógica pura del directorio.
 *
 * Extraída verbatim de `pages/entrenador/AlumnosPage.tsx:75-80, 215-227, 389-390`
 * (ver inventario 42 §3, `lib/alumnos-directorio-filtros.ts` ~70 líneas).
 *
 * - Los tipos de filtro se importan de `lib/directorio-alumnos` (corrige el WARNING
 *   del inventario 42 §5: `FilterEstado`/`FilterModalidad` locales duplicaban
 *   `FiltroEstadoDirectorio`/`FiltroModalidadDirectorio` con los mismos valores).
 * - Sin React, sin red, sin JSX: testeable en Node (R1, capa "lógica pura").
 */

import { EstadoAlumno, Modalidad, type OrdenDirectorioAlumnos } from '@guachafit/shared';
import type {
  FiltroEstadoDirectorio,
  FiltroModalidadDirectorio,
} from './directorio-alumnos';

/** WU25a: página por defecto del directorio (el endpoint acepta hasta 100). */
export const TAMANO_PAGINA_POR_DEFECTO = 25;

export type ModoVistaDirectorio = 'cards' | 'table';

export interface ParametrosDirectorioAlumnos {
  tamano: number;
  pagina: number;
  q: string;
  estado: FiltroEstadoDirectorio;
  modalidad: FiltroModalidadDirectorio;
  /**
   * Mis alumnos (2026-10-19): el orden viaja siempre al servidor. Se tipa con los literales del
   * enum (`OrdenDirectorioAlumnos`) para aceptar tanto el enum como sus valores en texto.
   */
  orden: `${OrdenDirectorioAlumnos}`;
}

/**
 * Construye los `URLSearchParams` del `GET /alumnos` con la MISMA semántica que la
 * vista vigente:
 * - `vigentes` = cartera sin bajas lógicas: no envía `incluirArchivados` ni `soloArchivados`.
 * - `mora` filtra por `semaforoPago=moroso` (no por `estado`).
 * - `Todas` no envía `modalidad`.
 * - La búsqueda viaja recortada como `q` (vacía = ausente).
 * - `orden` viaja siempre (por defecto `alta_reciente` en la vista).
 */
export function construirParametrosDirectorioAlumnos(
  filtros: ParametrosDirectorioAlumnos
): URLSearchParams {
  const offset = (filtros.pagina - 1) * filtros.tamano;
  const parametros = new URLSearchParams({
    limit: String(filtros.tamano),
    offset: String(offset),
    orden: filtros.orden,
  });
  if (filtros.q.trim().length > 0) parametros.set('q', filtros.q.trim());
  if (filtros.estado === 'activo') parametros.set('estado', EstadoAlumno.ACTIVO);
  if (filtros.estado === 'pausado') parametros.set('estado', EstadoAlumno.INACTIVO_PAUSADO);
  if (filtros.estado === 'mora') parametros.set('semaforoPago', 'moroso');
  if (filtros.estado === 'archivados') parametros.set('soloArchivados', 'true');
  if (filtros.modalidad === 'presencial') parametros.set('modalidad', Modalidad.PRESENCIAL);
  if (filtros.modalidad === 'remoto') parametros.set('modalidad', Modalidad.REMOTO);
  return parametros;
}

/**
 * WU25a: con paginación server-side la lista ya llega filtrada; el estado vacío
 * distingue "cartera vacía" de "sin resultados por búsqueda/filtros".
 * Mis alumnos (2026-10-19): el estado neutro es `vigentes`; el orden no cuenta como filtro.
 */
export function hayFiltrosDirectorioActivos(
  search: string,
  estado: FiltroEstadoDirectorio,
  modalidad: FiltroModalidadDirectorio
): boolean {
  return search.trim().length > 0 || estado !== 'vigentes' || modalidad !== 'todas';
}
