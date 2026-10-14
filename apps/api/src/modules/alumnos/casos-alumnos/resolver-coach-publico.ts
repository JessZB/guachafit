import { NotFoundException } from '@nestjs/common';
import { eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import { CoachPublicoDTO, EstadoLicencia } from '@guachafit/shared';
import type { ContextoAlumnos } from './contexto-alumnos';

/**
 * Resolución Pública del `coach_code` para el Deep Link de captación (RF-011, RN-06/RN-07.1).
 *
 * Solo devuelve identidad comercial del coach cuando el código existe Y el coach está operable
 * (cuenta habilitada y licencia vigente). Un código inexistente, uno deshabilitado y uno con
 * licencia suspendida responden igual (404): nunca se filtra qué códigos existen ni cuál de los
 * dos interruptores falló. No expone datos sensibles (teléfono, capacidad, cartera, etc.).
 * Movido sin cambios desde `AlumnosService.resolverCoachPublico` (P3).
 */
export async function resolverCoachPublico(
  ctx: Pick<ContextoAlumnos, 'db'>,
  code: string
): Promise<CoachPublicoDTO> {
  const codigoNormalizado = code.trim().toUpperCase();

  const [coach] = await ctx.db
    .select({
      coachCode: perfilesEntrenador.coachCode,
      nombres: perfilesEntrenador.nombres,
      apellidos: perfilesEntrenador.apellidos,
      nombreComercial: perfilesEntrenador.nombreComercial,
      estadoLicencia: perfilesEntrenador.estadoLicencia,
      activo: usuarios.activo,
    })
    .from(perfilesEntrenador)
    .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
    .where(eq(perfilesEntrenador.coachCode, codigoNormalizado));

  if (!coach || coach.estadoLicencia !== EstadoLicencia.ACTIVA || !coach.activo) {
    throw new NotFoundException(
      'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
    );
  }

  return {
    coachCode: coach.coachCode,
    nombre: `${coach.nombres} ${coach.apellidos}`.trim(),
    nombreComercial: coach.nombreComercial,
  };
}
