import { NotFoundException } from '@nestjs/common';
import { plantillasRutina, eq } from '@guachafit/database';
import type { ContextoPlantillas, PlantillaRow } from './contexto-plantillas';

export async function cargarPlantillaDelCoach(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantillaId: string
): Promise<PlantillaRow> {
  // RNF-003/ADR-011: lectura de `plantillas_rutina` con RLS. Si la plantilla es
  // de otro tenant, la política la oculta (misma respuesta 404 que el filtro
  // explícito: no se filtra la existencia del recurso).
  const [plantilla] = await ctx.withTenant({ entrenadorId }, async (tx) =>
    tx
      .select()
      .from(plantillasRutina)
      .where(eq(plantillasRutina.id, plantillaId))
      .limit(1)
  );

  if (!plantilla || plantilla.entrenadorId !== entrenadorId) {
    throw new NotFoundException('No encontramos esa plantilla. Puede que se haya eliminado.');
  }
  return plantilla as PlantillaRow;
}
