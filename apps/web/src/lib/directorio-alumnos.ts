/**
 * WU19: resumen de la cartera del directorio de alumnos.
 *
 * El servidor entrega `resumen` con COUNT reales (cartera completa, sin importar la página
 * cargada). Este helper replica la MISMA semántica para:
 * - el modo demo (roster local, cero llamadas API), y
 * - el respaldo cuando una respuesta no trae `resumen` (defensa ante cachés previas).
 *
 * WU25a: `filtrarDirectorioDemo` replica además los filtros server-side (q, estado, modalidad,
 * archivados y mora) sobre el roster demo, para que la paginación demo use el mismo flujo.
 *
 * WU26: el roster demo vive en `directorio-alumnos-demo.ts` y se reexporta aquí para que los
 * importadores existentes no cambien.
 */
import {
  EstadoAlumno,
  Modalidad,
  type PerfilAlumnoDetalleDTO,
  type ResumenDirectorioAlumnosDTO,
} from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

export { ROSTER_DEMO_DIRECTORIO } from './directorio-alumnos-demo';

export function calcularResumenDirectorio(
  alumnos: readonly PerfilAlumnoDetalleDTO[]
): ResumenDirectorioAlumnosDTO {
  const resumen: ResumenDirectorioAlumnosDTO = {
    total: alumnos.length,
    activos: 0,
    pausados: 0,
    morosos: 0,
    presenciales: 0,
    remotos: 0,
    archivados: 0,
  };

  for (const alumno of alumnos) {
    // Los archivados solo cuentan en `total` y `archivados` (igual que la API).
    if (alumno.deletedAtUtc) {
      resumen.archivados += 1;
      continue;
    }
    if (alumno.estadoActivacion === EstadoAlumno.ACTIVO) resumen.activos += 1;
    if (alumno.estadoActivacion === EstadoAlumno.INACTIVO_PAUSADO) resumen.pausados += 1;
    if (alumno.modalidad === Modalidad.PRESENCIAL) resumen.presenciales += 1;
    if (alumno.modalidad === Modalidad.REMOTO) resumen.remotos += 1;
    if (alumno.semaforoPago === 'moroso') resumen.morosos += 1;
  }

  return resumen;
}

/**
 * Mis alumnos (2026-10-19): chips de estado. `vigentes` es el neutro de la vista (sin archivados);
 * `todos` desaparece de la UI.
 */
export type FiltroEstadoDirectorio = 'vigentes' | 'activo' | 'pausado' | 'mora' | 'archivados';
export type FiltroModalidadDirectorio = 'todas' | 'presencial' | 'remoto';

export interface FiltrosDirectorioDemo {
  q?: string;
  /** Sin `estado` no hay restricción de estado: cartera completa (vigentes + archivados). */
  estado?: FiltroEstadoDirectorio;
  modalidad?: FiltroModalidadDirectorio;
}

/**
 * Filtros del directorio en modo demo, con la MISMA semántica que los parámetros del servidor:
 * - sin `estado`: cartera completa (vigentes + archivados), como el servidor sin filtro de archivo.
 * - `vigentes`: solo no archivados, sin filtrar por estado de activación.
 * - `activo`/`pausado`: solo vigentes con ese estado (`estado=`).
 * - `mora`: solo vigentes con `semaforoPago === 'moroso'` (`semaforoPago=moroso`).
 * - `archivados`: solo bajas lógicas (`soloArchivados=true`).
 * - `q`: nombre/apellido/correo/documento, sin distinguir mayúsculas ni acentos.
 */
export function filtrarDirectorioDemo<T extends PerfilAlumnoDetalleDTO>(
  alumnos: readonly T[],
  filtros: FiltrosDirectorioDemo = {}
): T[] {
  const termino = normalizarTextoBusqueda(filtros.q);
  const estado = filtros.estado;
  const modalidad = filtros.modalidad ?? 'todas';

  return alumnos.filter((alumno) => {
    if (estado === 'archivados') {
      if (!alumno.deletedAtUtc) return false;
    } else if (estado !== undefined) {
      if (alumno.deletedAtUtc) return false;
      if (estado === 'activo' && alumno.estadoActivacion !== EstadoAlumno.ACTIVO) return false;
      if (estado === 'pausado' && alumno.estadoActivacion !== EstadoAlumno.INACTIVO_PAUSADO) {
        return false;
      }
      if (estado === 'mora' && alumno.semaforoPago !== 'moroso') return false;
    }

    if (modalidad === 'presencial' && alumno.modalidad !== Modalidad.PRESENCIAL) return false;
    if (modalidad === 'remoto' && alumno.modalidad !== Modalidad.REMOTO) return false;

    if (termino.length === 0) return true;
    return [alumno.nombres, alumno.apellidos, alumno.email ?? '', alumno.numeroDocumento].some(
      (valor) => normalizarTextoBusqueda(valor).includes(termino)
    );
  });
}
