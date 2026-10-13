import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq } from '@guachafit/database';
import { perfilesAlumno, sesionesEntrenamiento } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import type { ContextoEntrenamiento } from './contexto';
import { MENSAJE_SESION_NO_ENCONTRADA, contextoPerfilDeActor } from './contexto';
import { hidratarSesion } from './hidratar-sesion';

// ---------------------------------------------------------------------------
// DETALLE DE SESIÓN POR ID
// (Movido sin cambios desde `EntrenamientoService.obtenerSesionPorId`.)
// ---------------------------------------------------------------------------

/**
 * Obtener detalle completo de una sesión por ID con verificación de permisos.
 */
export async function obtenerSesionPorId(
  ctx: ContextoEntrenamiento,
  sesionId: string,
  usuarioId: string,
  rol: Rol,
  entrenadorId?: string
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db, withTenant } = ctx;
  const [sesion] = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(eq(sesionesEntrenamiento.id, sesionId))
    .limit(1);

  if (!sesion) {
    throw new NotFoundException(MENSAJE_SESION_NO_ENCONTRADA);
  }

  // Validación de acceso por rol
  if (rol === Rol.ALUMNO && sesion.alumnoId !== usuarioId) {
    throw new ForbiddenException('No tienes permiso para acceder a esta sesión de entrenamiento.');
  }

  // RNF-003/ADR-011 (etapa 3): contexto RLS del actor para el perfil del alumno.
  const contextoPerfil = contextoPerfilDeActor(rol, usuarioId, entrenadorId);

  if (rol === Rol.ENTRENADOR) {
    const coachId = entrenadorId || usuarioId;
    const [perfil] = await withTenant({ entrenadorId: coachId }, (tx) =>
      tx
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, sesion.alumnoId),
            eq(perfilesAlumno.entrenadorId, coachId)
          )
        )
        .limit(1)
    );

    if (!perfil) {
      throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
    }
  }

  return hidratarSesion(ctx, sesion, contextoPerfil);
}
