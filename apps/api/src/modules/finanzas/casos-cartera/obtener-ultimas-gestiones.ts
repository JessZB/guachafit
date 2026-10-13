import {
  and,
  eq,
  inArray,
  max,
  notificacionesInApp,
} from '@guachafit/database';
import { toIsoSafe } from '../finanzas.service';
import type { ContextoCartera } from './contexto-cartera';
import { TIPO_EVENTO_RECORDATORIO_MANUAL } from './mensaje-recordatorio-reglas';

/** Último recordatorio manual por alumno (para la columna "última gestión" de la lista). */
export async function obtenerUltimasGestiones(
  ctx: ContextoCartera,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const filas = await ctx.db
    .select({
      usuarioId: notificacionesInApp.usuarioId,
      ultimaGestionUtc: max(notificacionesInApp.createdAtUtc),
    })
    .from(notificacionesInApp)
    .where(
      and(
        inArray(notificacionesInApp.usuarioId, ids),
        eq(notificacionesInApp.tipoEvento, TIPO_EVENTO_RECORDATORIO_MANUAL)
      )
    )
    .groupBy(notificacionesInApp.usuarioId);

  const gestiones = new Map<string, string>();
  for (const fila of filas) {
    if (fila.ultimaGestionUtc) {
      gestiones.set(fila.usuarioId, toIsoSafe(fila.ultimaGestionUtc));
    }
  }
  return gestiones;
}
