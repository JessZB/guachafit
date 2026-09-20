/**
 * WU19: resumen de la cartera del directorio de alumnos.
 *
 * El servidor entrega `resumen` con COUNT reales (cartera completa, sin importar la página
 * cargada). Este helper replica la MISMA semántica para:
 * - el modo demo (roster local, cero llamadas API), y
 * - el respaldo cuando una respuesta no trae `resumen` (defensa ante cachés previas).
 */
import {
  EstadoAlumno,
  Modalidad,
  type PerfilAlumnoDetalleDTO,
  type ResumenDirectorioAlumnosDTO,
} from '@guachafit/shared';

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
