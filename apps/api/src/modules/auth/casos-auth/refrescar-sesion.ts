import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstadoUsuario,
  Rol,
  type JwtPayload,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_SESION_VENCIDA,
} from '../../../common/mensajes-acceso';
import {
  generateTokens,
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/** Access-token renewal via refresh token. Moved verbatim (P3). */
export async function refrescarSesion(ctx: ContextoCasosAuth, refreshToken: string) {
  let decoded: any;
  try {
    decoded = jwt.verify(refreshToken, ctx.refreshSecret);
  } catch {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, decoded.sub));

  // "Bloqueado total" (RF-012): inactive or blocked accounts do not renew tokens.
  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  // Whoever resets the password may be kicking out an intruder: sessions opened
  // before the change no longer renew (`iat` in seconds; a refresh issued in
  // the same second as the change stays valid).
  if (
    usuario.passwordCambiadaEn &&
    typeof decoded.iat === 'number' &&
    decoded.iat < Math.floor(new Date(usuario.passwordCambiadaEn).getTime() / 1000)
  ) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  let entrenadorId: string | undefined;
  if (usuario.rol === Rol.ENTRENADOR) {
    entrenadorId = usuario.id;
    // RF-010 section 6: the license is re-verified on every refresh; a
    // suspended account does not renew.
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (stage 3): refresh — self profile read with RLS.
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: soft delete also revokes token renewal.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;

    // RF-010 section 6 (CASCADA-COACH): the alumno refresh re-verifies the
    // coach; a disabled account or suspended license cuts renewal at once.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  };

  const tokens = generateTokens(ctx, payload);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
