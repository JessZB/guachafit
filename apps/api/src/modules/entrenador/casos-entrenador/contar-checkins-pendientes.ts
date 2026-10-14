import {
  and,
  eq,
  inArray,
  controlesAntropometricos,
} from '@guachafit/database';
import { EstadoMedicion } from '@guachafit/shared';
import type { ContextoEntrenador } from './contexto-entrenador';

/**
 * Cuenta los checkins antropométricos pendientes de aprobación del lote de alumnos (5.2).
 */
export async function contarCheckinsPendientes(
  ctx: ContextoEntrenador,
  alumnosUserIds: string[]
): Promise<number> {
  if (alumnosUserIds.length === 0) return 0;

  const checkins = await ctx.db
    .select({ id: controlesAntropometricos.id })
    .from(controlesAntropometricos)
    .where(
      and(
        inArray(controlesAntropometricos.alumnoId, alumnosUserIds),
        eq(
          controlesAntropometricos.estado,
          EstadoMedicion.PENDIENTE_APROBACION
        )
      )
    );
  return checkins.length;
}
