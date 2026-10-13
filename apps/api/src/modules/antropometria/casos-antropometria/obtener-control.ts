import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import { controlesAntropometricos, perfilesAlumno } from '@guachafit/database';
import { eq } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import type { CallerAntropometria, ContextoAntropometria } from './contexto-antropometria';
import { MENSAJE_CONTROL_NO_ENCONTRADO } from './antropometria-reglas';
import { hidratarControl } from './hidratar-control';

/**
 * Fetches one antropometric control by ID.
 */
export async function obtenerControlPorId(
  ctx: ContextoAntropometria,
  controlId: string,
  caller?: CallerAntropometria
): Promise<ControlAntropometricoDetalleDTO> {
  const [control] = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(eq(controlesAntropometricos.id, controlId))
    .limit(1);

  if (!control) {
    throw new NotFoundException(MENSAJE_CONTROL_NO_ENCONTRADO);
  }

  if (caller) {
    if (caller.rol === Rol.ALUMNO && caller.id !== control.alumnoId) {
      throw new ForbiddenException('No tienes acceso a esta medición.');
    }
    if (caller.rol === Rol.ENTRENADOR) {
      const coachId = caller.entrenadorId || caller.id;
      // RNF-003/ADR-011 (etapa 3): lectura del perfil con el GUC del coach (RLS).
      const [alumno] = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
        tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, control.alumnoId))
          .limit(1)
      );

      if (!alumno || alumno.entrenadorId !== coachId) {
        throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
      }
    }
  }

  return hidratarControl(ctx, control);
}
