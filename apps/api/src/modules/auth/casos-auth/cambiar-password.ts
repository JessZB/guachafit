import { BadRequestException } from '@nestjs/common';
import { eq, usuarios } from '@guachafit/database';
import {
  CambiarPasswordDTO,
  MENSAJE_PASSWORD_CAMBIADA,
  MENSAJE_PASSWORD_NUEVA_IGUAL,
  Rol,
} from '@guachafit/shared';
import {
  datosSesionDe,
  exigirPasswordActual,
  generateTokens,
  publicarCorreoCuentaCaso,
  usuarioConSesion,
} from './acceso-comun';
import { AvisoPasswordCambiadaEvent } from '../../notificaciones/events/eventos-correo-cuenta';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * `POST /usuarios/me/password` (RF-018 RN-08). Requires the current password
 * and a different new one. Stamps `passwordCambiadaEn` (refresh rejects
 * sessions opened before, except the current one, which gets new tokens
 * issued in the same second) and notifies by email.
 *
 * Whoever rotates the password may be kicking out an intruder: ALL links
 * granting account access that the intruder could have requested with the
 * stolen session are voided (recovery and, above all, a pending email change
 * towards their own inbox, whose confirmation is public).
 * Moved verbatim (P3).
 */
export async function cambiarPassword(
  ctx: ContextoCasosAuth,
  usuarioId: string,
  dto: CambiarPasswordDTO
): Promise<{ mensaje: string; accessToken: string; refreshToken: string }> {
  const usuario = await usuarioConSesion(ctx, usuarioId);
  await exigirPasswordActual(ctx, usuario.passwordHash, dto.passwordActual);
  if (await ctx.cryptoService.comparePassword(dto.passwordNueva, usuario.passwordHash ?? '')) {
    throw new BadRequestException(MENSAJE_PASSWORD_NUEVA_IGUAL);
  }

  const { entrenadorId, nombre } = await datosSesionDe(ctx, usuario);
  const ahora = new Date();
  const passwordHash = await ctx.cryptoService.hashPassword(dto.passwordNueva);
  await ctx.db
    .update(usuarios)
    .set({
      passwordHash,
      passwordCambiadaEn: ahora,
      tokenRecuperacionHash: null,
      tokenRecuperacionExpira: null,
      correoPendiente: null,
      tokenCambioCorreoHash: null,
      tokenCambioCorreoExpira: null,
      updatedAtUtc: ahora,
    })
    .where(eq(usuarios.id, usuario.id));

  const tokens = generateTokens(ctx, {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  });

  await publicarCorreoCuentaCaso(
    ctx,
    AvisoPasswordCambiadaEvent.NOMBRE,
    new AvisoPasswordCambiadaEvent({
      tipo: 'AVISO_PASSWORD_CAMBIADA',
      usuarioId: usuario.id,
      email: usuario.email,
      nombre,
      token: '',
    })
  );

  return { mensaje: MENSAJE_PASSWORD_CAMBIADA, ...tokens };
}
