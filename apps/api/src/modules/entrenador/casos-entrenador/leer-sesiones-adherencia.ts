import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sesionesEntrenamiento,
} from '@guachafit/database';
import { EstadoSesion } from '@guachafit/shared';
import { calcularVentanaSemana } from '../../../common/adherencia.util';
import type { ContextoEntrenador } from './contexto-entrenador';
import type {
  SesionHistorialDashboard,
  SesionVentanaDashboard,
} from './riesgo-deportivo-reglas';

/**
 * Lee las sesiones de adherencia del lote de alumnos (4.2 + 4.3).
 *
 * El orden de las dos lecturas es significativo: los specs distinguen la consulta
 * de la ventana semanal de la del historial por su posición.
 */
export async function leerSesionesAdherencia(
  ctx: ContextoEntrenador,
  alumnosUserIds: string[],
  ventana: ReturnType<typeof calcularVentanaSemana>
): Promise<{
  sesionesCompletadasVentana: SesionVentanaDashboard[];
  ultimasSesiones: SesionHistorialDashboard[];
}> {
  // 4.2 Sesiones completadas dentro de la ventana semanal
  const sesionesCompletadasVentana = await ctx.db
    .select({ alumnoId: sesionesEntrenamiento.alumnoId })
    .from(sesionesEntrenamiento)
    .where(
      and(
        inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
        eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
        gte(sesionesEntrenamiento.fechaFinUtc, ventana.inicioSemanaUtc),
        lte(sesionesEntrenamiento.fechaFinUtc, ventana.ahoraUtc)
      )
    );

  // 4.3 Historial completado (para inactividad y última sesión)
  const ultimasSesiones = await ctx.db
    .select({
      alumnoId: sesionesEntrenamiento.alumnoId,
      fechaProgramada: sesionesEntrenamiento.fechaProgramada,
      fechaFinUtc: sesionesEntrenamiento.fechaFinUtc,
    })
    .from(sesionesEntrenamiento)
    .where(
      and(
        inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
        eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA)
      )
    )
    .orderBy(desc(sesionesEntrenamiento.fechaFinUtc));

  return { sesionesCompletadasVentana, ultimasSesiones };
}
