import { plantillasRutina, eq, and, desc } from '@guachafit/database';
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import type { ContextoPlantillas, PlantillaRow } from './contexto-plantillas';
import { mapearPlantillaResumen } from './mapeo-plantillas';

/**
 * Lista las plantillas del entrenador autenticado.
 * `activa` opcional: true → solo activas, false → solo desactivadas, omitido → todas.
 */
export async function listarPlantillas(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  activa?: boolean
): Promise<PlantillaRutinaResumenDTO[]> {
  const conditions = [eq(plantillasRutina.entrenadorId, entrenadorId)];
  if (typeof activa === 'boolean') {
    conditions.push(eq(plantillasRutina.activa, activa));
  }

  const filas = await ctx.withTenant({ entrenadorId }, async (tx) =>
    tx
      .select()
      .from(plantillasRutina)
      .where(and(...conditions))
      .orderBy(desc(plantillasRutina.createdAtUtc))
  );

  return filas.map((fila) => mapearPlantillaResumen(fila as PlantillaRow));
}
