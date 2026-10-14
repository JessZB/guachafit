import type { PlantillaRutinaDTO } from '@guachafit/shared';
import type { ContextoPlantillas } from './contexto-plantillas';
import { cargarPlantillaDelCoach } from './cargar-plantilla';
import { mapearPlantillaDTO } from './mapeo-plantillas';

/**
 * Obtiene una plantilla del entrenador autenticado (404 si es de otro tenant).
 */
export async function obtenerPlantilla(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantillaId: string
): Promise<PlantillaRutinaDTO> {
  const plantilla = await cargarPlantillaDelCoach(ctx, entrenadorId, plantillaId);
  return mapearPlantillaDTO(plantilla);
}
