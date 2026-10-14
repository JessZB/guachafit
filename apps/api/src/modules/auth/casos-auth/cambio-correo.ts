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
 * `POST /usuarios/me/correo` (RF-018 RN-04/RN-05).
 *
 * Con la contraseña actual correcta y un correo libre, guarda el correo pendiente con el hash de
 * un enlace de un solo uso (24 h) y lo envía al correo NUEVO. Una solicitud nueva reemplaza a la
 * anterior. El enlace copiable solo se devuelve fuera de producción y si el correo no salió: en
 * producción devolverlo dejaría confirmar un correo ajeno.
 * Movido sin cambios (P3).
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

/** `DELETE /usuarios/me/correo-pendiente` (RF-018 RN-05): idempotente. */
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
 * `POST /auth/confirmar-cambio-correo` (RF-018 RN-05/RN-06), público.
 *
 * Busca el enlace por su hash y vigencia, comprueba que el correo pendiente siga libre y lo
 * aplica con un UPDATE condicionado al hash (dos canjes simultáneos no lo usan dos veces). Avisa
 * al correo ANTERIOR.
 *
 * - Misma regla de acceso que el resto de los enlaces (`verificarCuentaConAcceso`): una cuenta
 *   deshabilitada, un alumno archivado o un coach sin licencia no confirman (enlace inválido).
 * - Si otra cuenta toma el correo entre la comprobación y el UPDATE, el índice único responde
 *   (23505) y se traduce al mismo 409 claro.
 * - El enlace de recuperación pendiente se anula: viajó al buzón ANTERIOR, que ya no es el de
 *   acceso.
 * Movido sin cambios (P3).
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
