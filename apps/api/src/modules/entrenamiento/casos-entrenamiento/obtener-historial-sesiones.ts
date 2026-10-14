import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { count, desc, eq } from '@guachafit/database';
import { perfilesAlumno, sesionesEntrenamiento } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type {
  HistorialSesionesAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import {
  MENSAJE_ALUMNO_NO_ENCONTRADO,
  MENSAJE_SIN_ACCESO_ALUMNO,
} from '../../../common/mensajes-acceso';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { contextoPerfilDeActor } from './contexto-entrenamiento';
import { hidratarSesion } from './hidratar-sesion';

// ---------------------------------------------------------------------------
// HISTORIAL DE SESIONES DEL ALUMNO
// (Movido sin cambios desde `EntrenamientoService.obtenerHistorialSesionesAlumno`.)
// ---------------------------------------------------------------------------

/**
 * Obtener historial cronológico de sesiones completadas o registradas de un alumno.
 *
 * WU24: envelope `{ items, total, limit, offset }` con COUNT real en SQL y orden cronológico
 * descendente (fechaProgramada, createdAtUtc, id) para que `offset` avance sin repetir filas.
 *
 * IMPORTANTE (fuga de historial entre alumnos corregida): para ALUMNO el primer argumento
 * (`entrenadorId`) transporta el claim `entrenadorId` del JWT, que es el UUID del COACH,
 * no el del alumno. Por eso la titularidad se valida contra `currentUserId` (el `sub`).
 */
export async function obtenerHistorialSesionesAlumno(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  alumnoId: string,
  rol: Rol,
  limit: number,
  offset: number,
  currentUserId?: string
): Promise<HistorialSesionesAlumnoDTO> {
  const { db, withTenant } = ctx;
  // 1. Validar si alumnoId es perfilesAlumno.id o perfilesAlumno.usuarioId.
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; contexto según el actor.
  const contextoPerfil = contextoPerfilDeActor(
    rol,
    currentUserId ?? alumnoId,
    entrenadorId
  );
  const perfil = await withTenant(contextoPerfil, async (tx) => {
    let [perfil] = await tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId));
    }

    return perfil;
  });

  if (!perfil) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  if (rol === Rol.ENTRENADOR && perfil.entrenadorId !== entrenadorId) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }

  // Aislamiento por titularidad: un alumno SOLO puede leer su propio historial.
  if (rol === Rol.ALUMNO) {
    if (!currentUserId || perfil.usuarioId !== currentUserId) {
      throw new ForbiddenException('No tienes permiso para consultar el historial de otro alumno.');
    }
  }

  const usuarioAlumnoId = perfil.usuarioId;
  const whereHistorial = eq(sesionesEntrenamiento.alumnoId, usuarioAlumnoId);

  // WU24: COUNT real en SQL para el `total` del envelope (sin traer el historial completo a
  // memoria solo para contarlo).
  const [filaTotal] = await db
    .select({ total: count() })
    .from(sesionesEntrenamiento)
    .where(whereHistorial);

  const sesiones = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(whereHistorial)
    .orderBy(
      desc(sesionesEntrenamiento.fechaProgramada),
      desc(sesionesEntrenamiento.createdAtUtc),
      // WU24: desempate estable para que `offset` no repita ni salte filas cuando dos sesiones
      // comparten fechaProgramada y createdAtUtc.
      desc(sesionesEntrenamiento.id)
    )
    .limit(limit)
    .offset(offset);

  const items: SesionEntrenamientoDetalleDTO[] = [];
  for (const s of sesiones) {
    items.push(await hidratarSesion(ctx, s, contextoPerfil));
  }

  return {
    items,
    total: Number(filaTotal?.total ?? 0),
    limit,
    offset,
  };
}
