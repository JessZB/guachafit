import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstablecerPasswordConTokenDTO,
  EstadoUsuario,
  Modalidad,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  type JwtPayload,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CUENTA_DESACTIVADA,
} from '../../../common/mensajes-acceso';
import {
  generateTokens,
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * Sets the final password from an SHA-256 invitation token (RF-011, ARCH-003
 * section 2.1). WU-E: a valid token alone does not enable activation.
 * Inactive or blocked accounts (RF-012 "bloqueado total") and soft-deleted
 * alumnos are rejected without consuming the token. Moved verbatim (P3).
 */
export async function establecerPasswordConToken(
  ctx: ContextoCasosAuth,
  dto: EstablecerPasswordConTokenDTO
) {
  const tokenHash = ctx.cryptoService.hashSha256(dto.token);
  const now = new Date();

  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(
      and(
        eq(usuarios.tokenInvitacionHash, tokenHash),
        gt(usuarios.tokenInvitacionExpira, now)
      )
    );

  if (!usuario) {
    throw new NotFoundException(
      'El enlace de invitación no es válido o venció (dura 48 horas). Pide uno nuevo a tu entrenador.'
    );
  }

  if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
  }

  // Profile resolution happens BEFORE writing: an archived alumno does not
  // activate the account.
  let entrenadorId: string | undefined;
  let modalidad: Modalidad | null = null;
  // ADR-019: the profile zone travels with the session (as in `/auth/me`) so
  // the web counts the nutrition-report window with the server zone from first render.
  let zonaHoraria: string | null = null;
  if (usuario.rol === Rol.ENTRENADOR) {
    // RF-010 section 6: a suspended license cannot redeem the invitation
    // either (redeem issues tokens; it would be a third session path without
    // the verification cycle).
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (stage 3): invitation redeem — self profile read with RLS.
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: soft delete revokes access; same message as login.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;

    // RF-010 section 6 (CASCADA-COACH): redeem issues a session, so it also
    // requires an operable coach; the token is not consumed when the cascade blocks.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  const passwordHash = await ctx.cryptoService.hashPassword(dto.password);

  // Update user: store password and clear token (single use, RNF-003).
  await ctx.db
    .update(usuarios)
    .set({
      passwordHash,
      tokenInvitacionHash: null,
      tokenInvitacionExpira: null,
      ultimoAccesoUtc: now,
    })
    .where(eq(usuarios.id, usuario.id));

  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  };

  const tokens = generateTokens(ctx, payload);

  return {
    mensaje: 'Contraseña establecida con éxito. Bienvenido a GUACHAFIT.',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
      modalidad,
      zonaHoraria,
    },
  };
}
