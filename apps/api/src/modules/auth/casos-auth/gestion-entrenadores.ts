import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import {
  CambiarEstadoEntrenadorDTO,
  CambioEstadoEntrenadorResultadoDTO,
  CambiarLicenciaEntrenadorDTO,
  CambioLicenciaEntrenadorResultadoDTO,
  EstadoLicencia,
  Rol,
} from '@guachafit/shared';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * RF-010 RN-01 / section 6 (WU Admin): enables or disables a coach ACCOUNT.
 *
 * Rules:
 * - The collection is coaches: an alumno id (or a missing one) answers 404.
 * - The Superadmin cannot disable itself (400).
 * - Idempotent: repeating the same state does not write and returns
 *   `cambioAplicado: false`.
 *
 * Disabling revokes the session at the next verification cycle: login and
 * refresh reject it at once and `/auth/me` closes the web session; the
 * already-issued access token expires in 15 minutes at most.
 * Moved verbatim (P3).
 */
export async function cambiarEstadoEntrenador(
  ctx: Pick<ContextoCasosAuth, 'db'>,
  usuarioId: string,
  dto: CambiarEstadoEntrenadorDTO,
  solicitanteId: string
): Promise<CambioEstadoEntrenadorResultadoDTO> {
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario || usuario.rol !== Rol.ENTRENADOR) {
    throw new NotFoundException('Entrenador no encontrado.');
  }

  if (!dto.activo && usuarioId === solicitanteId) {
    throw new BadRequestException('No puedes deshabilitar tu propia cuenta.');
  }

  if (usuario.activo === dto.activo) {
    return {
      usuarioId,
      activo: usuario.activo,
      cambioAplicado: false,
      mensaje: dto.activo
        ? 'La cuenta del entrenador ya estaba activa.'
        : 'La cuenta del entrenador ya estaba deshabilitada.',
    };
  }

  await ctx.db
    .update(usuarios)
    .set({ activo: dto.activo, updatedAtUtc: new Date() })
    .where(eq(usuarios.id, usuarioId));

  return {
    usuarioId,
    activo: dto.activo,
    cambioAplicado: true,
    mensaje: dto.activo
      ? 'Entrenador reactivado. Ya puede volver a iniciar sesión.'
      : 'Entrenador deshabilitado. Ya no podrá iniciar sesión; si tiene una sesión abierta, se cerrará en unos minutos.',
  };
}

/**
 * RF-010 RN-01 (WU Admin): activates or suspends a coach LICENSE.
 *
 * Real effects of the `SUSPENDIDA_SUPERADMIN` state (same as a disabled
 * account): the public `coach_code` resolution stops resolving (RF-011
 * RN-07.1), coach login and refresh are rejected and `/auth/me` closes the
 * session. Idempotent. Moved verbatim (P3).
 */
export async function cambiarLicenciaEntrenador(
  ctx: Pick<ContextoCasosAuth, 'db'>,
  usuarioId: string,
  dto: CambiarLicenciaEntrenadorDTO
): Promise<CambioLicenciaEntrenadorResultadoDTO> {
  const [coach] = await ctx.db
    .select()
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.usuarioId, usuarioId))
    .limit(1);

  if (!coach) {
    throw new NotFoundException('Entrenador no encontrado.');
  }

  if (coach.estadoLicencia === dto.estadoLicencia) {
    return {
      usuarioId,
      estadoLicencia: coach.estadoLicencia,
      cambioAplicado: false,
      mensaje:
        dto.estadoLicencia === EstadoLicencia.ACTIVA
          ? 'La licencia del entrenador ya estaba activa.'
          : 'La licencia del entrenador ya estaba suspendida.',
    };
  }

  await ctx.db
    .update(perfilesEntrenador)
    .set({ estadoLicencia: dto.estadoLicencia, updatedAtUtc: new Date() })
    .where(eq(perfilesEntrenador.usuarioId, usuarioId));

  return {
    usuarioId,
    estadoLicencia: dto.estadoLicencia,
    cambioAplicado: true,
    mensaje:
      dto.estadoLicencia === EstadoLicencia.ACTIVA
        ? 'Licencia activada. El entrenador recupera su acceso y su enlace de captación vuelve a funcionar.'
        : 'Licencia suspendida. El entrenador ya no podrá iniciar sesión y su enlace de captación deja de funcionar.',
  };
}
