import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from '@guachafit/database';
import { perfilesAlumno, rutinas } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type { BloqueDiaRutinaDTO, RutinaSemanalDetalleDTO } from '@guachafit/shared';
import {
  MENSAJE_ALUMNO_NO_ENCONTRADO,
  MENSAJE_SIN_ACCESO_ALUMNO,
} from '../../../common/mensajes-acceso';
import type { ContextoEntrenamiento } from './contexto';
import { contextoPerfilDeActor } from './contexto';
import { toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 3. RUTINA SEMANAL — consulta de la activa
// (Movido sin cambios desde `EntrenamientoService.obtenerRutinaSemanalActiva`.)
// ---------------------------------------------------------------------------

/**
 * Consulta de la rutina semanal activa del alumno.
 */
export async function obtenerRutinaSemanalActiva(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  alumnoId: string,
  rol: Rol,
  currentUserId?: string
): Promise<RutinaSemanalDetalleDTO | null> {
  const { withTenant } = ctx;
  // RNF-003/ADR-011 (etapa 3): lectura del perfil con el contexto del actor (self del alumno,
  // tenant del coach o bypass del superadmin).
  const perfil = await withTenant(
    contextoPerfilDeActor(rol, currentUserId ?? alumnoId, entrenadorId),
    async (tx) => {
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
    }
  );

  if (!perfil) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  if (rol === Rol.ENTRENADOR && perfil.entrenadorId !== entrenadorId) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }

  if (rol === Rol.ALUMNO && currentUserId && perfil.usuarioId !== currentUserId) {
    throw new ForbiddenException('No tienes permiso para consultar esta rutina.');
  }

  const usuarioAlumnoId = perfil.usuarioId;

  // RNF-003/ADR-009: consulta tenant-scoped dentro de withTenant.
  // - ENTRENADOR: matchea por `entrenador_id`.
  // - ALUMNO: matchea por `alumno_id = current_usuario_id` (política self_select).
  // - SUPERADMIN: bypass explícito vía `app.is_superadmin`.
  const [rutina] = await withTenant(
    {
      entrenadorId,
      usuarioId: currentUserId,
      isSuperadmin: rol === Rol.SUPERADMIN,
    },
    async (tx) =>
      tx
        .select()
        .from(rutinas)
        .where(
          and(
            eq(rutinas.alumnoId, usuarioAlumnoId),
            eq(rutinas.activa, true)
          )
        )
        .orderBy(desc(rutinas.createdAtUtc))
        .limit(1)
  );

  if (!rutina) {
    return null;
  }

  return {
    id: rutina.id,
    alumnoId: rutina.alumnoId,
    entrenadorId: rutina.entrenadorId,
    nombre: rutina.nombre,
    activa: rutina.activa,
    bloques: rutina.bloques as BloqueDiaRutinaDTO[],
    createdAtUtc: toIsoUtcString(rutina.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(rutina.updatedAtUtc)!,
  };
}
