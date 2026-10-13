import { UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull, lte, or, usuarios } from '@guachafit/database';
import {
  SolicitarRecuperacionPasswordDTO,
  VIGENCIA_ENLACE_RECUPERACION_MS,
} from '@guachafit/shared';
import { MENSAJE_RECUPERACION_SOLICITADA } from '../../../common/mensajes-acceso';
import {
  INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS,
  enlaceRecienEmitido,
  limiteEnlaceRecienEmitido,
} from './recuperacion-reglas';
import { RecuperacionPasswordSolicitadaEvent } from '../../notificaciones/events/eventos-correo-cuenta';
import { enmascararCorreo } from '../../../common/enmascarar-correo.util';
import {
  publicarCorreoCuentaCaso,
  verificarCuentaConAcceso,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * `POST /auth/recuperar-password`. ALWAYS answers the same message in the same
 * time, whether or not the account exists: it never reveals if the email is
 * registered or the account state. Against timing enumeration, ALL
 * account-dependent work (lookup, access rules, code generation and saving,
 * email queueing) runs in the background (`procesarSolicitudRecuperacion`)
 * and the response does not wait for it. Background-work errors are only
 * logged (masked email); the person may ask for the link again.
 * Moved verbatim (P3).
 */
export async function solicitarRecuperacionPassword(
  ctx: ContextoCasosAuth,
  dto: SolicitarRecuperacionPasswordDTO
): Promise<{ mensaje: string }> {
  const email = dto.email.toLowerCase().trim();

  void Promise.resolve()
    .then(() => procesarSolicitudRecuperacion(ctx, email))
    .catch((error) => {
      ctx.logger.error(
        `Falló la recuperación de contraseña pedida para ${enmascararCorreo(email)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });

  return { mensaje: MENSAJE_RECUPERACION_SOLICITADA };
}

/**
 * Background recovery work (see `solicitarRecuperacionPassword`). Only when
 * the account has access is a single-use random code generated (only its
 * SHA-256 hash is stored, with the `VIGENCIA_ENLACE_RECUPERACION_MS` life)
 * and the event ending in the email published.
 *
 * Against foreign-link voiding: when a live link issued less than
 * `INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS` ago exists, it is neither
 * rotated nor resent (the person's link keeps working). Past that interval a
 * new one is issued and the old one stops working. Issuance is derived from
 * the expiry (`expira - vigencia`): no extra column needed. The UPDATE repeats
 * the condition so two simultaneous requests do not rotate twice.
 */
export async function procesarSolicitudRecuperacion(
  ctx: ContextoCasosAuth,
  email: string
): Promise<void> {
  const [usuario] = await ctx.db.select().from(usuarios).where(eq(usuarios.email, email));
  if (!usuario) return;

  let nombre: string | null;
  try {
    ({ nombre } = await verificarCuentaConAcceso(ctx, usuario));
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      ctx.logger.log(
        `Recuperación pedida para una cuenta sin acceso (${usuario.id}); no se envía enlace.`
      );
      return;
    }
    throw error;
  }

  // A link expiring after this instant was issued less than the minimum interval ago.
  const limiteRecienEmitido = limiteEnlaceRecienEmitido(
    Date.now(),
    VIGENCIA_ENLACE_RECUPERACION_MS,
    INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS
  );
  const expiraActual = usuario.tokenRecuperacionExpira
    ? new Date(usuario.tokenRecuperacionExpira)
    : null;
  if (enlaceRecienEmitido(expiraActual, limiteRecienEmitido)) {
    ctx.logger.log(
      `Recuperación repetida para el usuario ${usuario.id}: su enlace reciente sigue vigente; no se envía otro.`
    );
    return;
  }

  const { rawToken, tokenHash, expiresAt } = ctx.cryptoService.generarTokenRecuperacion();
  const rotados = await ctx.db
    .update(usuarios)
    .set({ tokenRecuperacionHash: tokenHash, tokenRecuperacionExpira: expiresAt })
    .where(
      and(
        eq(usuarios.id, usuario.id),
        or(
          isNull(usuarios.tokenRecuperacionExpira),
          lte(usuarios.tokenRecuperacionExpira, limiteRecienEmitido)
        )
      )
    )
    .returning({ id: usuarios.id });

  if (rotados.length === 0) return; // A simultaneous request already issued the link.

  await publicarCorreoCuentaCaso(
    ctx,
    RecuperacionPasswordSolicitadaEvent.NOMBRE,
    new RecuperacionPasswordSolicitadaEvent({
      tipo: 'RECUPERACION_PASSWORD',
      usuarioId: usuario.id,
      email: usuario.email,
      nombre,
      token: rawToken,
    })
  );
}
