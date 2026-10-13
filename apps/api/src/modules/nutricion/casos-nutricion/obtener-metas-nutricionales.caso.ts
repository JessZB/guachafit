import { eq, metasNutricionales } from '@guachafit/database';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';
import type { ContextoNutricion } from './contexto-nutricion';
import { validarAlumnoDelCoach } from './acceso-nutricion';
import { mapearMetas } from './hidratacion-nutricion';

/**
 * Consultar las metas nutricionales de un alumno (o `null` si el coach no las configuró).
 * Usada por el alumno (las suyas) y por el coach (las de su alumno, tras validar tenancy).
 */
export async function obtenerMetasNutricionales(
  ctx: ContextoNutricion,
  alumnoId: string
): Promise<MetasNutricionalesDetalleDTO | null> {
  const [fila] = await ctx.db
    .select()
    .from(metasNutricionales)
    .where(eq(metasNutricionales.alumnoId, alumnoId))
    .limit(1);

  return fila ? await mapearMetas(ctx, fila) : null;
}

/**
 * Consultar las metas de un alumno de la cartera del coach (RN-01).
 * Valida tenancy ANTES de responder, incluso si el alumno no tiene metas.
 */
export async function obtenerMetasDeAlumno(
  ctx: ContextoNutricion,
  coachId: string,
  alumnoId: string
): Promise<MetasNutricionalesDetalleDTO | null> {
  await validarAlumnoDelCoach(ctx, coachId, alumnoId);
  return obtenerMetasNutricionales(ctx, alumnoId);
}
