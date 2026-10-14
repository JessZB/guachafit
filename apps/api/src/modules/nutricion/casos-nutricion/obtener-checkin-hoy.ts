import { and, checkinsNutricionales, eq } from '@guachafit/database';
import type { CheckinNutricionalDetalleDTO } from '@guachafit/shared';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import type { ContextoNutricion } from './contexto-nutricion';
import { obtenerZonaHorariaAlumno } from './acceso-nutricion';
import { hidratarCheckin } from './hidratacion-nutricion';

/**
 * Consultar el reporte nutricional del día en curso (o fecha indicada) para el alumno.
 * Sin `fecha`, el día se resuelve en la zona del PERFIL del alumno (LOTE API-N2), no en UTC.
 */
export async function obtenerCheckinHoy(
  ctx: ContextoNutricion,
  alumnoId: string,
  fecha?: string
): Promise<CheckinNutricionalDetalleDTO | null> {
  const targetFecha =
    fecha ||
    obtenerFechaLocalYyyyMmDd(
      new Date(),
      await obtenerZonaHorariaAlumno(ctx, alumnoId, { usuarioId: alumnoId })
    );

  const [checkin] = await ctx.db
    .select()
    .from(checkinsNutricionales)
    .where(
      and(
        eq(checkinsNutricionales.alumnoId, alumnoId),
        eq(checkinsNutricionales.fecha, targetFecha)
      )
    )
    .limit(1);

  if (!checkin) {
    return null;
  }

  // RNF-003/ADR-011 (etapa 3): hidratación del nombre con el contexto self del alumno (RLS).
  return hidratarCheckin(ctx, checkin, { usuarioId: alumnoId });
}
