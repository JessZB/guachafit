/**
 * Ola 3 · módulo `asignacion-masiva-plantilla`: formato de nombres del directorio.
 *
 * Lógica pura extraída de `AsignacionMasivaPlantilla.tsx` (lote A): la comparten el hook
 * del directorio (mapa de nombres para la selección persistente) y la lista de alumnos.
 */
import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';

/** Nombre visible de un alumno del directorio (`"nombres apellidos"`, sin restos). */
export function nombreCompletoAsignacion(
  alumno: Pick<PerfilAlumnoDetalleDTO, 'nombres' | 'apellidos'>
): string {
  return `${alumno.nombres} ${alumno.apellidos}`.trim();
}
