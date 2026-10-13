import { UnauthorizedException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  AuthUserDTO,
  EstadoUsuario,
  Modalidad,
  PeriodicidadAntropometria,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_SESION_VENCIDA,
} from '../../../common/mensajes-acceso';
import {
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * RF-003 RN-03/RN-04 (WU RF-003a/b): fresh session of the authenticated user
 * for `GET /auth/me`. Unlike reading the JWT claim (15-minute life), the
 * profile modality and anthropometric calendar are resolved live: a coach
 * changing the alumno modality or periodicity is reflected immediately.
 * Moved verbatim (P3).
 */
export async function obtenerSesion(
  ctx: Pick<ContextoCasosAuth, 'db' | 'withTenant'>,
  usuarioId: string
): Promise<AuthUserDTO> {
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  let entrenadorId: string | undefined;
  let modalidad: Modalidad | null = null;
  let periodicidadAntropometria: PeriodicidadAntropometria | null = null;
  let antropometriaInicio: string | null = null;
  // LOTE API-N2: alumno profile zone (nutrition-report window and deadline).
  let zonaHoraria: string | null = null;

  if (usuario.rol === Rol.ENTRENADOR) {
    entrenadorId = usuario.id;
    // RF-010 section 6: `/auth/me` is the web verification cycle. A suspended
    // license (or a disabled account, already rejected above) closes the
    // session without waiting for the access-token TTL.
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (stage 3): self profile read with RLS (`current_usuario_id`).
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx
        .select({
          entrenadorId: perfilesAlumno.entrenadorId,
          modalidad: perfilesAlumno.modalidad,
          periodicidadAntropometria: perfilesAlumno.periodicidadAntropometria,
          antropometriaInicio: perfilesAlumno.antropometriaInicio,
          zonaHoraria: perfilesAlumno.zonaHoraria,
          deletedAtUtc: perfilesAlumno.deletedAtUtc,
        })
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, usuario.id))
        .limit(1)
    );

    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;
    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    // RF-003 RN-01 (WU RF-003b): the calendar travels with the session so the
    // alumno web can warn about the check-in window without the
    // `perfiles_alumno` UUID.
    periodicidadAntropometria = perfil?.periodicidadAntropometria ?? null;
    antropometriaInicio = perfil?.antropometriaInicio ?? null;

    // RF-010 section 6 (CASCADA-COACH): the alumno `/auth/me` also reflects
    // the cascade; when the coach becomes inoperable, the web closes the
    // session without waiting for the access-token TTL.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  return {
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
    modalidad,
    periodicidadAntropometria,
    antropometriaInicio,
    zonaHoraria,
  };
}
