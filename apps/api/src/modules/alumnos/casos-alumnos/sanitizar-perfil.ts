import { PerfilAlumnoDetalleDTO, Rol, ZONA_HORARIA_ALUMNO_POR_DEFECTO } from '@guachafit/shared';
import type { ContextoCasosAlumnos } from './contexto-casos';
import { calcularEdadDesdeFecha } from './edad-reglas';

/**
 * Sanitizes the DTO according to the querying actor's role (RF-011, scenario 3).
 * Moved verbatim from `AlumnosService.sanitizarPerfilParaRol` (P3).
 */
export function sanitizarPerfilParaRol(
  ctx: Pick<ContextoCasosAlumnos, 'cryptoService'>,
  perfil: any,
  actorRole: Rol
): PerfilAlumnoDetalleDTO {
  let fichaSalud: string | null = null;

  if (actorRole === Rol.ENTRENADOR || actorRole === Rol.SUPERADMIN) {
    if (perfil.fichaSaludPrivada) {
      try {
        fichaSalud = ctx.cryptoService.decryptHealthRecord(perfil.fichaSaludPrivada);
      } catch {
        fichaSalud = perfil.fichaSaludPrivada;
      }
    }
  }

  return {
    id: perfil.id,
    usuarioId: perfil.usuarioId,
    entrenadorId: perfil.entrenadorId,
    tipoDocumento: perfil.tipoDocumento,
    numeroDocumento: perfil.numeroDocumento,
    nombres: perfil.nombres,
    apellidos: perfil.apellidos,
    email: perfil.email ?? null,
    fechaNacimiento: perfil.fechaNacimiento,
    edadCalculada: calcularEdadDesdeFecha(perfil.fechaNacimiento),
    telefonoWhatsapp: perfil.telefonoWhatsapp,
    modalidad: perfil.modalidad,
    estadoActivacion: perfil.estadoActivacion,
    periodicidadAntropometria: perfil.periodicidadAntropometria ?? null,
    antropometriaInicio: perfil.antropometriaInicio ?? null,
    tasaFijadaOverride: perfil.tasaFijadaOverride,
    planActivoId: perfil.planActivoId ?? null,
    planActivoNombre: perfil.planActivoNombre ?? null,
    precioAcordadoOverride: perfil.precioAcordadoOverride ?? null,
    fichaSaludPrivada: fichaSalud,
    zonaHoraria: perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO,
    deletedAtUtc: perfil.deletedAtUtc ? new Date(perfil.deletedAtUtc).toISOString() : null,
    createdAtUtc: perfil.createdAtUtc ? new Date(perfil.createdAtUtc).toISOString() : new Date().toISOString(),
  };
}
