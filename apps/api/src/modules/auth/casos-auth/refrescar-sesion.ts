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
import type { ContextoAuth } from './contexto-auth';

/**
 * Renovación de token de acceso mediante Refresh Token.
 * Movido sin cambios (P3).
 */
export async function refrescarSesion(ctx: ContextoAuth, refreshToken: string) {
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

  // "Bloqueado total" (RF-012): inactivo o bloqueado no renueva tokens.
  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  // Quien restablece la contraseña puede estar echando a un intruso: las sesiones abiertas
  // antes del cambio ya no se
  // renuevan (`iat` en segundos; un refresh emitido en el mismo segundo del cambio sigue válido).
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
    // RF-010 §6: la licencia se re-verifica en cada refresh; una cuenta suspendida no renueva.
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (etapa 3): refresh — lectura self del perfil con RLS.
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: la baja lógica también revoca la renovación de tokens.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;

    // RF-010 §6 (CASCADA-COACH): el refresh del alumno re-verifica a su entrenador; una cuenta
    // deshabilitada o una licencia suspendida cortan la renovación de inmediato.
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
