import { NotFoundException } from '@nestjs/common';
import { eq, perfilesEntrenador } from '@guachafit/database';
import type {
  ActualizarCaptacionDTO,
  CaptacionEntrenadorDTO,
  CaptacionEntrenadorResultadoDTO,
} from '@guachafit/shared';
import { coachCodeEnUso } from '../../auth/casos-auth/coach-code-en-uso';
import { generarCoachCodeUnico } from '../../auth/casos-auth/generar-coach-code';
import type { ContextoEntrenador } from './contexto-entrenador';
import { registrosPorEnlace } from './registros-por-enlace';

type PerfilCoach = typeof perfilesEntrenador.$inferSelect;

async function leerCoach(ctx: ContextoEntrenador, entrenadorId: string): Promise<PerfilCoach> {
  const [coach] = await ctx.db
    .select()
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.usuarioId, entrenadorId));

  if (!coach) {
    throw new NotFoundException('Perfil de entrenador no encontrado.');
  }
  return coach;
}

function aDto(coach: PerfilCoach, registros: number): CaptacionEntrenadorDTO {
  return {
    coachCode: coach.coachCode,
    captacionActiva: coach.captacionActiva,
    enlaceRotadoEnUtc: coach.enlaceRotadoEnUtc?.toISOString() ?? null,
    registrosPorEnlace: registros,
  };
}

/** D17: estado del enlace de captación del entrenador (código, interruptor y contador). */
export async function obtenerCaptacion(
  ctx: ContextoEntrenador,
  entrenadorId: string
): Promise<CaptacionEntrenadorDTO> {
  const coach = await leerCoach(ctx, entrenadorId);
  const registros = await registrosPorEnlace(ctx, entrenadorId, coach.enlaceRotadoEnUtc ?? null);
  return aDto(coach, registros);
}

/**
 * D17: rotación con corte inmediato. El código nuevo reemplaza al anterior en `coach_code`, así que
 * el viejo deja de resolver en el acto (sin gracia ni caché). No toca `captacion_activa`.
 */
export async function rotarEnlaceCaptacion(
  ctx: ContextoEntrenador,
  entrenadorId: string
): Promise<CaptacionEntrenadorResultadoDTO> {
  await leerCoach(ctx, entrenadorId);

  const coachCode = await generarCoachCodeUnico((codigo) => coachCodeEnUso(ctx.db, codigo));
  const ahora = new Date();

  const [actualizado] = await ctx.db
    .update(perfilesEntrenador)
    .set({ coachCode, enlaceRotadoEnUtc: ahora, updatedAtUtc: ahora })
    .where(eq(perfilesEntrenador.usuarioId, entrenadorId))
    .returning();

  ctx.logger.log(`Captación: el entrenador ${entrenadorId} rotó su enlace.`);

  // Por definición, ningún alumno nace del enlace nuevo antes de rotarlo: el contador arranca en 0.
  return {
    ...aDto(actualizado, 0),
    cambioAplicado: true,
    mensaje: 'Tu enlace anterior dejó de funcionar. Comparte el nuevo.',
  };
}

/**
 * D17: pausar o reanudar la captación. Idempotente por estado: si ya estaba así no escribe y
 * responde `cambioAplicado = false`.
 */
export async function actualizarCaptacion(
  ctx: ContextoEntrenador,
  entrenadorId: string,
  dto: ActualizarCaptacionDTO
): Promise<CaptacionEntrenadorResultadoDTO> {
  let coach = await leerCoach(ctx, entrenadorId);
  const cambioAplicado = coach.captacionActiva !== dto.activa;

  if (cambioAplicado) {
    [coach] = await ctx.db
      .update(perfilesEntrenador)
      .set({ captacionActiva: dto.activa, updatedAtUtc: new Date() })
      .where(eq(perfilesEntrenador.usuarioId, entrenadorId))
      .returning();

    ctx.logger.log(
      `Captación: el entrenador ${entrenadorId} ${dto.activa ? 'reanudó' : 'pausó'} su captación.`
    );
  }

  const registros = await registrosPorEnlace(ctx, entrenadorId, coach.enlaceRotadoEnUtc ?? null);
  const mensaje = cambioAplicado
    ? dto.activa
      ? 'Captación reanudada.'
      : 'Captación pausada. Tu enlace no admite nuevos registros.'
    : dto.activa
      ? 'La captación ya estaba activa.'
      : 'La captación ya estaba pausada.';

  return { ...aDto(coach, registros), cambioAplicado, mensaje };
}
