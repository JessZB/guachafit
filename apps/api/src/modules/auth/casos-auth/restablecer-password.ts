import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, usuarios } from '@guachafit/database';
import { RestablecerPasswordDTO } from '@guachafit/shared';
import {
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
} from '../../../common/mensajes-acceso';
import { verificarCuentaConAcceso } from './acceso-comun';
import type { ContextoAuth } from './contexto-auth';

/**
 * `POST /auth/restablecer-password`.
 *
 * Valida el token (hash, vigente) y la cuenta (misma regla de acceso que el login), aplica la
 * política de contraseña de la activación (contrato compartido) y consume el token en el MISMO
 * UPDATE condicionado al hash: dos canjes simultáneos no pueden usarlo dos veces. También anula
 * una invitación pendiente y marca `passwordCambiadaEn` (el refresh rechaza sesiones previas).
 * No emite sesión: la web lleva al inicio de sesión.
 * Movido sin cambios (P3).
 */
export async function restablecerPassword(
  ctx: Pick<ContextoAuth, 'cryptoService' | 'db' | 'withTenant'>,
  dto: RestablecerPasswordDTO
): Promise<{ mensaje: string }> {
  const tokenHash = ctx.cryptoService.hashSha256(dto.token);
  const ahora = new Date();

  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(
      and(
        eq(usuarios.tokenRecuperacionHash, tokenHash),
        gt(usuarios.tokenRecuperacionExpira, ahora)
      )
    );

  if (!usuario) {
    throw new NotFoundException(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
  }

  await verificarCuentaConAcceso(ctx, usuario);

  const passwordHash = await ctx.cryptoService.hashPassword(dto.password);
  const actualizados = await ctx.db
    .update(usuarios)
    .set({
      passwordHash,
      tokenRecuperacionHash: null,
      tokenRecuperacionExpira: null,
      tokenInvitacionHash: null,
      tokenInvitacionExpira: null,
      passwordCambiadaEn: ahora,
      updatedAtUtc: ahora,
    })
    .where(and(eq(usuarios.id, usuario.id), eq(usuarios.tokenRecuperacionHash, tokenHash)))
    .returning({ id: usuarios.id });

  if (actualizados.length === 0) {
    throw new NotFoundException(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
  }

  return { mensaje: MENSAJE_PASSWORD_ACTUALIZADA };
}
