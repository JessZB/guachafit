import { NotFoundException } from '@nestjs/common';
import { checkinsNutricionales, eq } from '@guachafit/database';
import type { CheckinNutricionalDetalleDTO } from '@guachafit/shared';
import type { ContextoNutricion } from './contexto-nutricion';
import { hidratarCheckin } from './hidratacion-nutricion';

/**
 * Obtener detalle de check-in nutricional por su ID.
 */
export async function obtenerCheckinPorId(
  ctx: ContextoNutricion,
  checkinId: string
): Promise<CheckinNutricionalDetalleDTO> {
  const [checkin] = await ctx.db
    .select()
    .from(checkinsNutricionales)
    .where(eq(checkinsNutricionales.id, checkinId))
    .limit(1);

  if (!checkin) {
    throw new NotFoundException('No encontramos ese reporte. Actualiza la pantalla.');
  }

  // RNF-003/ADR-011 (etapa 3): único llamador = el propio alumno (registrarCheckinDiario);
  // el contexto self sale del dueño real de la fila.
  return hidratarCheckin(ctx, checkin, { usuarioId: checkin.alumnoId });
}
