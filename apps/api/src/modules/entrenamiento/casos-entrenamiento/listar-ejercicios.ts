import { and, asc, eq, isNull, or } from '@guachafit/database';
import { ejerciciosCatalogo } from '@guachafit/database';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import type { ContextoEntrenamiento } from './contexto';
import { toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 1. CATÁLOGO DE EJERCICIOS — lectura
// (Movido sin cambios desde `EntrenamientoService.listarEjercicios`.)
// ---------------------------------------------------------------------------

/**
 * Listar ejercicios activos aplicando filtro multi-tenant:
 * (entrenadorId = coachId OR entrenadorId IS NULL).
 */
export async function listarEjercicios(
  ctx: ContextoEntrenamiento,
  entrenadorId?: string
): Promise<EjercicioCatalogoDetalleDTO[]> {
  const conditions = [eq(ejerciciosCatalogo.activo, true)];

  if (entrenadorId) {
    conditions.push(
      or(
        eq(ejerciciosCatalogo.entrenadorId, entrenadorId),
        isNull(ejerciciosCatalogo.entrenadorId)
      )!
    );
  }

  const rows = await ctx.db
    .select()
    .from(ejerciciosCatalogo)
    .where(and(...conditions))
    .orderBy(asc(ejerciciosCatalogo.nombre));

  return rows.map((r) => ({
    id: r.id,
    entrenadorId: r.entrenadorId,
    nombre: r.nombre,
    grupoMuscular: r.grupoMuscular,
    patronMovimiento: r.patronMovimiento,
    videoUrl: r.videoUrl,
    activo: r.activo,
    createdAtUtc: toIsoUtcString(r.createdAtUtc)!,
  }));
}
