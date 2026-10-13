import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, gt, usuarios } from '@guachafit/database';
import {
  ConfirmarCambioCorreoDTO,
  MENSAJE_CAMBIO_CORREO_CANCELADO,
  MENSAJE_CORREO_EN_USO,
  MENSAJE_CORREO_IGUAL_AL_ACTUAL,
  MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO,
  SolicitarCambioCorreoDTO,
  SolicitudCambioCorreoDTO,
  mensajeCambioCorreoSolicitado,
  mensajeCorreoConfirmado,
} from '@guachafit/shared';
import { obtenerUrlWeb } from '../../../common/config/correo';
import { construirEnlaceConCodigo } from '../../notificaciones/correo/plantillas-correo';
import { esViolacionUnicidad } from '../../../common/violacion-unicidad.util';
import {
  AvisoCorreoCambiadoEvent,
  ConfirmacionCambioCorreoEvent,
} from '../../notificaciones/events/eventos-correo-cuenta';
import {
  datosSesionDe,
  exigirCorreoLibre,
  exigirPasswordActual,
  publicarCorreoCuentaCaso,
  usuarioConSesion,
  verificarCuentaConAcceso,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * `POST /usuarios/me/correo` (RF-018 RN-04/RN-05). With the correct current
 * password and a free email, stores the pending email with the hash of a
 * single-use link (24 h) and sends it to the NEW email. A new request replaces
 * the previous one. The copyable link is only returned outside production and
 * when the email did not go out: in production returning it would let someone
 * confirm someone else's email. Moved verbatim (P3).
 */
export async function solicitarCambioCorreo(
  ctx: ContextoCasosAuth,
  usuarioId: string,
  dto: SolicitarCambioCorreoDTO
): Promise<SolicitudCambioCorreoDTO> {
  const usuario = await usuarioConSesion(ctx, usuarioId);
  const { nombre } = await datosSesionDe(ctx, usuario);
  await exigirPasswordActual(ctx, usuario.passwordHash, dto.passwordActual);

  const correoNuevo = dto.correoNuevo.trim().toLowerCase();
  if (correoNuevo === usuario.email.trim().toLowerCase()) {
    throw new BadRequestException(MENSAJE_CORREO_IGUAL_AL_ACTUAL);
  }
  await exigirCorreoLibre(ctx, correoNuevo, usuario.id);

  const { rawToken, tokenHash, expiresAt } = ctx.cryptoService.generarTokenCambioCorreo();
  await ctx.db
    .update(usuarios)
    .set({
      correoPendiente: correoNuevo,
      tokenCambioCorreoHash: tokenHash,
      tokenCambioCorreoExpira: expiresAt,
      updatedAtUtc: new Date(),
    })
    .where(eq(usuarios.id, usuario.id));

  const correoEnviado = await publicarCorreoCuentaCaso(
    ctx,
    ConfirmacionCambioCorreoEvent.NOMBRE,
    new ConfirmacionCambioCorreoEvent({
      tipo: 'CONFIRMACION_CAMBIO_CORREO',
      usuarioId: usuario.id,
      email: correoNuevo,
      nombre,
      token: rawToken,
    })
  );

  const respuesta: SolicitudCambioCorreoDTO = {
    mensaje: mensajeCambioCorreoSolicitado(correoNuevo, correoEnviado),
    correoPendiente: correoNuevo,
    expiraUtc: expiresAt.toISOString(),
    correoEnviado,
  };
  if (!correoEnviado && process.env.NODE_ENV !== 'production') {
    respuesta.enlaceConfirmacion = construirEnlaceConCodigo(obtenerUrlWeb(), '/confirmar-correo', rawToken);
  }
  return respuesta;
}

/** `DELETE /usuarios/me/correo-pendiente` (RF-018 RN-05): idempotent. */
export async function cancelarCambioCorreoPendiente(
  ctx: Pick<ContextoCasosAuth, 'db'>,
  usuarioId: string
): Promise<{ mensaje: string }> {
  await ctx.db
    .update(usuarios)
    .set({
      correoPendiente: null,
      tokenCambioCorreoHash: null,
      tokenCambioCorreoExpira: null,
      updatedAtUtc: new Date(),
    })
    .where(eq(usuarios.id, usuarioId));
  return { mensaje: MENSAJE_CAMBIO_CORREO_CANCELADO };
}

/**
 * `POST /auth/confirmar-cambio-correo` (RF-018 RN-05/RN-06), public. Looks the
 * link up by hash and life, checks the pending email is still free and applies
 * it with a hash-conditioned UPDATE (two simultaneous redeems cannot use it
 * twice). Notifies the PREVIOUS email.
 *
 * - Same access rule as the other links (`verificarCuentaConAcceso`): a
 *   disabled account, an archived alumno or a license-less coach do not
 *   confirm (invalid link).
 * - When another account takes the email between the check and the UPDATE,
 *   the unique index answers (23505) and is mapped to the same clear 409.
 * - The pending recovery link is voided: it went to the PREVIOUS inbox, which
 *   is no longer the access one.
 * Moved verbatim (P3).
 */
export async function confirmarCambioCorreo(
  ctx: ContextoCasosAuth,
  dto: ConfirmarCambioCorreoDTO
): Promise<{ mensaje: string }> {
  const tokenHash = ctx.cryptoService.hashSha256(dto.token);
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(
      and(
        eq(usuarios.tokenCambioCorreoHash, tokenHash),
        gt(usuarios.tokenCambioCorreoExpira, new Date())
      )
    );

  if (!usuario || !usuario.correoPendiente) {
    throw new NotFoundException(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
  }

  const correoNuevo = usuario.correoPendiente;
  const correoAnterior = usuario.email;
  await exigirCorreoLibre(ctx, correoNuevo, usuario.id);
  let nombre: string | null;
  try {
    ({ nombre } = await verificarCuentaConAcceso(ctx, usuario));
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      throw new NotFoundException(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
    }
    throw error;
  }

  let actualizados: { id: string }[];
  try {
    actualizados = await ctx.db
      .update(usuarios)
      .set({
        email: correoNuevo,
        correoPendiente: null,
        tokenCambioCorreoHash: null,
        tokenCambioCorreoExpira: null,
        tokenRecuperacionHash: null,
        tokenRecuperacionExpira: null,
        updatedAtUtc: new Date(),
      })
      .where(and(eq(usuarios.id, usuario.id), eq(usuarios.tokenCambioCorreoHash, tokenHash)))
      .returning({ id: usuarios.id });
  } catch (error) {
    if (esViolacionUnicidad(error)) {
      throw new ConflictException(MENSAJE_CORREO_EN_USO);
    }
    throw error;
  }

  if (actualizados.length === 0) {
    throw new NotFoundException(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
  }

  await publicarCorreoCuentaCaso(
    ctx,
    AvisoCorreoCambiadoEvent.NOMBRE,
    new AvisoCorreoCambiadoEvent({
      tipo: 'AVISO_CORREO_CAMBIADO',
      usuarioId: usuario.id,
      email: correoAnterior,
      nombre,
      token: '',
      correoNuevo,
    })
  );

  return { mensaje: mensajeCorreoConfirmado(correoNuevo) };
}
