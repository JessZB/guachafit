/**
 * Formulario del expediente del alumno: valores editables, detección de cambios sin guardar y
 * mensaje de ficha desactualizada. Funciones puras, sin React; las usa `use-expediente-alumno.ts`
 * para no rehidratar lo que el entrenador escribe sin guardar.
 */
import type {
  Modalidad,
  PerfilAlumnoDetalleDTO,
  PeriodicidadAntropometria,
  TipoDocumento,
} from '@guachafit/shared';

export const MENSAJE_FICHA_DESACTUALIZADA =
  'No se pudo actualizar la ficha. Los datos mostrados pueden estar desactualizados.';

/** Valores editables del formulario de datos y del calendario antropométrico. */
export interface ValoresFormularioExpediente {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  telefonoWhatsapp: string;
  modalidad: Modalidad;
  fichaSaludPrivada: string;
  periodicidadAntropometria: PeriodicidadAntropometria | '';
  antropometriaInicio: string;
}

/**
 * ¿Hay cambios sin guardar respecto al perfil `alumnoAnterior`? Compara los 8 campos del formulario
 * y los 2 del calendario. Sin perfil previo no hay nada que proteger.
 */
export function formularioModificado(
  alumnoAnterior: PerfilAlumnoDetalleDTO | null,
  valores: ValoresFormularioExpediente
): boolean {
  if (!alumnoAnterior) return false;
  return (
    valores.nombres !== alumnoAnterior.nombres ||
    valores.apellidos !== alumnoAnterior.apellidos ||
    valores.tipoDocumento !== alumnoAnterior.tipoDocumento ||
    valores.numeroDocumento !== alumnoAnterior.numeroDocumento ||
    valores.fechaNacimiento !== alumnoAnterior.fechaNacimiento ||
    valores.telefonoWhatsapp !== alumnoAnterior.telefonoWhatsapp ||
    valores.modalidad !== alumnoAnterior.modalidad ||
    valores.fichaSaludPrivada !== (alumnoAnterior.fichaSaludPrivada || '') ||
    valores.periodicidadAntropometria !== (alumnoAnterior.periodicidadAntropometria ?? '') ||
    valores.antropometriaInicio !== (alumnoAnterior.antropometriaInicio ?? '')
  );
}
