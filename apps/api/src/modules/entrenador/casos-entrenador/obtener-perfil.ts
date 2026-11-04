import { NotFoundException } from '@nestjs/common';
import { eq, perfilesEntrenador } from '@guachafit/database';
import type { PerfilEntrenadorDTO } from '@guachafit/shared';
import type { ContextoEntrenador } from './contexto-entrenador';
import { registrosPorEnlace } from './registros-por-enlace';

/**
 * Perfil operativo del entrenador autenticado (WU-E / RF-011 RN-06).
 * Es la fuente REAL del `coachCode` para el enlace único de captación del coach; el cliente
 * nunca debe inventar ni hardcodear este valor. Solo devuelve datos propios del solicitante.
 */
export async function obtenerPerfil(
  ctx: ContextoEntrenador,
  usuarioId: string
): Promise<PerfilEntrenadorDTO> {
  const [coach] = await ctx.db
    .select()
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.usuarioId, usuarioId));

  if (!coach) {
    throw new NotFoundException('Perfil de entrenador no encontrado.');
  }

  const enlaceRotadoEnUtc = coach.enlaceRotadoEnUtc ?? null;
  const registros = await registrosPorEnlace(ctx, usuarioId, enlaceRotadoEnUtc);

  return {
    id: coach.id,
    usuarioId: coach.usuarioId,
    nombres: coach.nombres,
    apellidos: coach.apellidos,
    nombreComercial: coach.nombreComercial,
    coachCode: coach.coachCode,
    estadoLicencia: coach.estadoLicencia,
    capacidadMaxima: coach.capacidadMaxima,
    telefonoContacto: coach.telefonoContacto,
    captacionActiva: coach.captacionActiva,
    enlaceRotadoEnUtc: enlaceRotadoEnUtc?.toISOString() ?? null,
    registrosPorEnlace: registros,
  };
}
