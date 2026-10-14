import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from '@guachafit/database';
import { perfilesAlumno, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion, Rol } from '@guachafit/shared';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  MENSAJE_ALUMNO_NO_ENCONTRADO,
  MENSAJE_SIN_ACCESO_ALUMNO,
} from '../../../common/mensajes-acceso';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { contextoPerfilDeActor } from './contexto-entrenamiento';
import { hidratarSesion } from './hidratar-sesion';

// ---------------------------------------------------------------------------
// ÚLTIMA SESIÓN DEL ALUMNO
// (Movido sin cambios desde `EntrenamientoService.obtenerUltimaSesionAlumno`.)
// ---------------------------------------------------------------------------

/**
 * Obtener la última sesión registrada (COMPLETADA o EN_PROGRESO) de un alumno específico.
 *
 * Solo cuentan las sesiones realmente entrenadas: las PLANIFICADA (aún no iniciadas) y las
 * OMITIDA (descanso/incompleto) se excluyen para que el coach no vea un plan futuro o un día
 * omitido como "último entrenamiento".
 *
 * Con validación de aislamiento de Tenancy (el alumno debe pertenecer al entrenador).
 * Acepta alumnoId como `perfiles_alumno.id` o como `usuarios.id` (perfiles_alumno.usuario_id).
 */
export async function obtenerUltimaSesionAlumno(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  alumnoId: string,
  rol: Rol,
  currentUserId?: string
): Promise<SesionEntrenamientoDetalleDTO | null> {
  const { db, withTenant } = ctx;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(alumnoId)) {
    return null;
  }

  let targetUsuarioId = alumnoId;

  // RNF-003/ADR-011 (etapa 3): contexto RLS del actor para el perfil del alumno.
  const contextoPerfil = contextoPerfilDeActor(
    rol,
    currentUserId ?? alumnoId,
    entrenadorId
  );

  if (rol !== Rol.SUPERADMIN) {
    // Acepta `perfiles_alumno.id` o `usuarios.id`: consultas secuenciales (id primero), el mismo
    // patrón que `obtenerHistorialSesionesAlumno`; un `or(...)` entre columnas distintas no es
    // representable por el mock de Drizzle de los tests BDD.
    const perfil = await withTenant(contextoPerfil, async (tx) => {
      let [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(and(eq(perfilesAlumno.id, alumnoId), isNull(perfilesAlumno.deletedAtUtc)))
        .limit(1);

      if (!perfil) {
        [perfil] = await tx
          .select()
          .from(perfilesAlumno)
          .where(and(eq(perfilesAlumno.usuarioId, alumnoId), isNull(perfilesAlumno.deletedAtUtc)))
          .limit(1);
      }

      return perfil;
    });

    if (!perfil) {
      throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }

    // Defensa en profundidad: si un ALUMNO llegara a este método, solo puede verse a sí mismo.
    if (rol === Rol.ALUMNO && (!currentUserId || perfil.usuarioId !== currentUserId)) {
      throw new ForbiddenException('No tienes permiso para consultar la sesión de otro alumno.');
    }

    if (perfil.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
    }

    targetUsuarioId = perfil.usuarioId;
  } else {
    const perfil = await withTenant({ isSuperadmin: true }, async (tx) => {
      let [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.id, alumnoId))
        .limit(1);

      if (!perfil) {
        [perfil] = await tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1);
      }

      return perfil;
    });

    if (perfil) {
      targetUsuarioId = perfil.usuarioId;
    }
  }

  const [sesion] = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(
      and(
        eq(sesionesEntrenamiento.alumnoId, targetUsuarioId),
        // Solo sesiones realmente entrenadas: excluye PLANIFICADA y OMITIDA (coherente con el docstring).
        inArray(sesionesEntrenamiento.estado, [
          EstadoSesion.COMPLETADA,
          EstadoSesion.EN_PROGRESO,
        ])
      )
    )
    .orderBy(
      desc(sesionesEntrenamiento.fechaProgramada),
      desc(sesionesEntrenamiento.createdAtUtc)
    )
    .limit(1);

  if (!sesion) {
    return null;
  }

  return hidratarSesion(ctx, sesion, contextoPerfil);
}
