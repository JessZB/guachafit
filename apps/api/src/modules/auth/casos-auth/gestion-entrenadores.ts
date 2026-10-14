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
import type { ContextoAuth } from './contexto-auth';

/**
 * RF-010 RN-01 / §6 (WU Admin): habilita o deshabilita la CUENTA de un entrenador.
 *
 * Reglas:
 * - La colección es de entrenadores: un id de alumno (o inexistente) responde 404.
 * - El Superadmin no puede deshabilitarse a sí mismo (400).
 * - Idempotente: repetir el mismo estado no escribe y devuelve `cambioAplicado: false`.
 *
 * La deshabilitación revoca la sesión en el siguiente ciclo de verificación: login y refresh
 * la rechazan de inmediato y `/auth/me` cierra la sesión de la web; el access token ya emitido
 * expira como máximo en 15 minutos (ver `verificarLicenciaEntrenadorActiva`).
 * Movido sin cambios (P3).
 */
export async function cambiarEstadoEntrenador(
  ctx: Pick<ContextoAuth, 'db'>,
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
 * RF-010 RN-01 (WU Admin): activa o suspende la LICENCIA de un entrenador.
 *
 * Efectos reales del estado `SUSPENDIDA_SUPERADMIN` (los mismos que la cuenta deshabilitada):
 * la resolución pública del `coach_code` deja de resolver (RF-011 RN-07.1), el login y el
 * refresh del coach se rechazan y `/auth/me` cierra su sesión. Idempotente.
 * Movido sin cambios (P3).
 */
export async function cambiarLicenciaEntrenador(
  ctx: Pick<ContextoAuth, 'db'>,
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
