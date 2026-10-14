import { plantillasRutina, eq } from '@guachafit/database';
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import type { ContextoPlantillas } from './contexto-plantillas';
import { cargarPlantillaDelCoach } from './cargar-plantilla';
import { mapearPlantillaResumen } from './mapeo-plantillas';

/**
 * Desactiva (soft delete coherente con `rutinas.activa`) una plantilla.
 * Idempotente: desactivar una plantilla ya inactiva no falla.
 */
export async function desactivarPlantilla(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantillaId: string
): Promise<PlantillaRutinaResumenDTO> {
  const existente = await cargarPlantillaDelCoach(ctx, entrenadorId, plantillaId);
  const desactivada = { ...existente, activa: false, updatedAtUtc: new Date() };

  // RNF-003/ADR-011: soft delete tenant-scoped sobre `plantillas_rutina` con RLS.
  await ctx.withTenant({ entrenadorId }, async (tx) => {
    await tx
      .update(plantillasRutina)
      .set({ activa: false, updatedAtUtc: desactivada.updatedAtUtc })
      .where(eq(plantillasRutina.id, existente.id));
  });

  return mapearPlantillaResumen(desactivada);
}
