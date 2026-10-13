import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, usuarios } from '@guachafit/database';
import { RestablecerPasswordDTO } from '@guachafit/shared';
import {
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
} from '../../../common/mensajes-acceso';
import { verificarCuentaConAcceso } from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * `POST /auth/restablecer-password`. Validates the token (hash, live) and the
 * account (same access rule as login), applies the activation password policy
 * (shared contract) and consumes the token in the SAME hash-conditioned
 * UPDATE: two simultaneous redeems cannot use it twice. Also voids a pending
 * invitation and stamps `passwordCambiadaEn` (refresh rejects prior sessions).
 * Issues no session: the web goes to sign-in. Moved verbatim (P3).
 */
export async function restablecerPassword(
  ctx: Pick<ContextoCasosAuth, 'cryptoService' | 'db' | 'withTenant'>,
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
