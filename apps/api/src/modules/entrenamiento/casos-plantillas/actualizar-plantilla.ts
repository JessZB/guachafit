import { plantillasRutina, eq } from '@guachafit/database';
import type {
  ActualizarPlantillaRutinaDTO,
  BloqueDiaRutinaDTO,
  NivelObjetivoPlantilla,
  PlantillaRutinaDTO,
} from '@guachafit/shared';
import { ActualizarPlantillaRutinaSchema } from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { validarEjerciciosDeBloques } from '../catalogo-ejercicios';
import type { ContextoPlantillas } from './contexto-plantillas';
import { cargarPlantillaDelCoach } from './cargar-plantilla';
import { mapearPlantillaDTO } from './mapeo-plantillas';

/**
 * Edita una plantilla del entrenador autenticado (nombre, nivel, bloques y activa).
 * Al reemplazar bloques se revalidan los ejercicios contra el catálogo.
 */
export async function actualizarPlantilla(
  ctx: ContextoPlantillas,
  entrenadorId: string,
  plantillaId: string,
  input: ActualizarPlantillaRutinaDTO
): Promise<PlantillaRutinaDTO> {
  const validado = parsearContrato(ActualizarPlantillaRutinaSchema, input);
  const existente = await cargarPlantillaDelCoach(ctx, entrenadorId, plantillaId);

  const cambios: {
    updatedAtUtc: Date;
    nombre?: string;
    nivelObjetivo?: NivelObjetivoPlantilla;
    bloques?: BloqueDiaRutinaDTO[];
    activa?: boolean;
  } = { updatedAtUtc: new Date() };
  if (validado.nombre !== undefined) cambios.nombre = validado.nombre.trim();
  if (validado.nivelObjetivo !== undefined) cambios.nivelObjetivo = validado.nivelObjetivo;
  if (validado.bloques !== undefined) {
    cambios.bloques = await validarEjerciciosDeBloques(ctx.db, entrenadorId, validado.bloques);
  }
  if (validado.activa !== undefined) cambios.activa = validado.activa;

  // RNF-003/ADR-011: escritura tenant-scoped sobre `plantillas_rutina` con RLS.
  await ctx.withTenant({ entrenadorId }, async (tx) => {
    await tx.update(plantillasRutina).set(cambios).where(eq(plantillasRutina.id, existente.id));
  });

  return mapearPlantillaDTO({ ...existente, ...cambios });
}
