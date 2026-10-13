/**
 * RF-010 (WU Admin): texto de confirmación accesible de las acciones de cuenta y licencia.
 *
 * Lógica pura extraída de `AdminPage` (sin React ni red): dado un `AccionEntrenador` pendiente
 * de confirmación, devuelve el título, el detalle de alcance y el texto del botón del
 * `DialogoConfirmacion`. Los tipos de dominio vienen de `@guachafit/shared`.
 */
import { EstadoLicencia, type EntrenadorAdminDTO } from '@guachafit/shared';

/** Acción pendiente de confirmación sobre un entrenador (nunca se ejecuta sin confirmar). */
export type AccionEntrenador =
  | { tipo: 'estado'; entrenador: EntrenadorAdminDTO; activo: boolean }
  | { tipo: 'licencia'; entrenador: EntrenadorAdminDTO; estadoLicencia: EstadoLicencia };

/** Textos del diálogo de confirmación para una acción pendiente. */
export interface TextoConfirmacionAccion {
  titulo: string;
  detalle: string;
  boton: string;
}

/** Construye los textos del diálogo para la acción pendiente (`null` = sin acción). */
export function construirTextoConfirmacion(
  confirmacion: AccionEntrenador | null
): TextoConfirmacionAccion | null {
  if (!confirmacion) return null;
  return {
    titulo:
      confirmacion.tipo === 'estado'
        ? confirmacion.activo
          ? `¿Reactivar a ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
          : `¿Deshabilitar a ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
        : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
          ? `¿Activar la licencia de ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
          : `¿Suspender la licencia de ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`,
    detalle:
      confirmacion.tipo === 'estado'
        ? confirmacion.activo
          ? 'Podrá volver a iniciar sesión. Sus alumnos también recuperan el acceso.'
          : 'Ya no podrá entrar: su sesión se cerrará en unos minutos (máximo 15). Sus alumnos tampoco podrán entrar mientras la cuenta esté deshabilitada.'
        : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
          ? 'Podrá volver a iniciar sesión y su enlace de registro para alumnos vuelve a funcionar. Sus alumnos también recuperan el acceso.'
          : 'Ya no podrá entrar y su enlace de registro para alumnos dejará de funcionar. Sus alumnos tampoco podrán entrar mientras la licencia esté suspendida.',
    boton:
      confirmacion.tipo === 'estado'
        ? confirmacion.activo
          ? 'Reactivar cuenta'
          : 'Deshabilitar cuenta'
        : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
          ? 'Activar licencia'
          : 'Suspender licencia',
  };
}
