import { plantillasRutina } from '@guachafit/database';
import type { CrearPlantillaRutinaDTO, PlantillaRutinaDTO } from '@guachafit/shared';
import { CrearPlantillaRutinaSchema } from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { validarEjerciciosDeBloques } from '../catalogo-ejercicios';
import type { ContextoPlantillas, PlantillaRow } from './contexto-plantillas';
import { mapearPlantillaDTO } from './mapeo-plantillas';

/**
 * Crea una plantilla en estado Activa asociada al tenant del coach (Escenario 1).
 * Valida que TODOS los ejercicios existan en el catálogo global o del coach.
 */
export async function crearPlantilla(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  input: CrearPlantillaRutinaDTO
): Promise<PlantillaRutinaDTO> {
  const validado = parsearContrato(CrearPlantillaRutinaSchema, input);
  const bloques = await validarEjerciciosDeBloques(ctx.db, entrenadorId, validado.bloques);
  const ahora = new Date();

  // RNF-003/ADR-011: `plantillas_rutina` tiene RLS; la inserción corre con el
  // GUC del coach y la política WITH CHECK rechaza un `entrenador_id` ajeno.
  const [nueva] = await ctx.withTenant({ entrenadorId }, async (tx) =>
    tx
      .insert(plantillasRutina)
      .values({
        id: crypto.randomUUID(),
        entrenadorId,
        nombre: validado.nombre.trim(),
        nivelObjetivo: validado.nivelObjetivo,
        bloques,
        activa: validado.activa ?? true,
        createdAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .returning()
  );

  return mapearPlantillaDTO(nueva as PlantillaRow);
}
