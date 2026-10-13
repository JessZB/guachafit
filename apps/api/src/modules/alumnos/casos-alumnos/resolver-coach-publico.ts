import { NotFoundException } from '@nestjs/common';
import { eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import { CoachPublicoDTO, EstadoLicencia } from '@guachafit/shared';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * Public resolution of the `coach_code` deep link (RF-011, RN-06/RN-07.1).
 * Moved verbatim from `AlumnosService.resolverCoachPublico` (P3).
 */
export async function resolverCoachPublico(
  ctx: Pick<ContextoCasosAlumnos, 'db'>,
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
