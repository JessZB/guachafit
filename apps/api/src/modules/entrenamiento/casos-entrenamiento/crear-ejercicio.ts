import { CrearEjercicioCatalogoDTO, CrearEjercicioCatalogoSchema } from '@guachafit/shared';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { ejerciciosCatalogo } from '@guachafit/database';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 1. CATÁLOGO DE EJERCICIOS — alta
// (Movido sin cambios desde `EntrenamientoService.crearEjercicio`.)
// ---------------------------------------------------------------------------

/**
 * Crear nuevo ejercicio en el catálogo.
 * Si viene entrenadorId, es propiedad del coach; si es null, es global.
 */
export async function crearEjercicio(
  ctx: ContextoEntrenamiento,
  entrenadorId: string | null | undefined,
  input: CrearEjercicioCatalogoDTO
): Promise<EjercicioCatalogoDetalleDTO> {
  const validado = parsearContrato(CrearEjercicioCatalogoSchema, input);
  const targetEntrenadorId = validado.entrenadorId || entrenadorId || null;

  const [nuevoEjercicio] = await ctx.db
    .insert(ejerciciosCatalogo)
    .values({
      entrenadorId: targetEntrenadorId,
      nombre: validado.nombre,
      grupoMuscular: validado.grupoMuscular,
      patronMovimiento: validado.patronMovimiento ?? null,
      videoUrl: validado.videoUrl ?? null,
      activo: true,
      createdAtUtc: new Date(),
    })
    .returning();

  return {
    id: nuevoEjercicio.id,
    entrenadorId: nuevoEjercicio.entrenadorId,
    nombre: nuevoEjercicio.nombre,
    grupoMuscular: nuevoEjercicio.grupoMuscular,
    patronMovimiento: nuevoEjercicio.patronMovimiento,
    videoUrl: nuevoEjercicio.videoUrl,
    activo: nuevoEjercicio.activo,
    createdAtUtc: toIsoUtcString(nuevoEjercicio.createdAtUtc)!,
  };
}
