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
 * `POST /auth/recuperar-password`.
 *
 * Responde SIEMPRE el mismo mensaje y en el mismo tiempo, exista o no la cuenta: no revela si
 * el correo está registrado ni el estado de la cuenta.
 *
 * Contra la enumeración por tiempo, TODO el trabajo que depende de la cuenta (búsqueda, reglas
 * de acceso, generación y guardado del código, encolado del correo) corre en segundo plano
 * (`procesarSolicitudRecuperacion`) y la respuesta no lo espera: el camino visible es idéntico
 * para un correo registrado y uno que no lo está. Los errores de ese trabajo solo se registran
 * (con el correo enmascarado); la persona puede volver a pedir el enlace.
 * Movido sin cambios (P3).
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
 * Trabajo en segundo plano de la recuperación (ver `solicitarRecuperacionPassword`).
 *
 * Solo si la cuenta tiene acceso se genera un código aleatorio de un solo uso (se guarda SOLO su
 * hash SHA-256, con la vigencia `VIGENCIA_ENLACE_RECUPERACION_MS`) y se publica el evento que
 * termina en el correo.
 *
 * Contra la anulación del enlace ajeno: si ya hay un enlace vigente emitido hace menos de
 * `INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS`, no se rota ni se envía otro correo (el enlace
 * de la persona sigue sirviendo). Pasado ese intervalo sí se emite uno nuevo y el anterior deja
 * de servir. La emisión se deduce del vencimiento (`expira - vigencia`): no hace falta otra
 * columna. El UPDATE repite la condición para que dos pedidos simultáneos no roten dos veces.
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

  // Un enlace que vence después de este instante fue emitido hace menos del intervalo mínimo.
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
