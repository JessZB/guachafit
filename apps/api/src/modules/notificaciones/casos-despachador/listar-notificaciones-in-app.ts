import { and, count, desc, eq, notificacionesInApp } from '@guachafit/database';
import {
  type BandejaNotificacionesInAppDTO,
  type FiltroBandejaInAppDTO,
} from '@guachafit/shared';
import type { ContextoDespachador } from './contexto-despachador';
import { mapearNotificacionInApp, resolverPaginacionBandeja } from './despachador-reglas';

/**
 * RF-014 (Ola 3): bandeja In-App paginada para la campana de N2.
 *
 * - Orden: más recientes primero con desempate estable por `id` (mismo criterio de paginación
 *   server-side del ADR-013: `offset` avanza sin repetir ni saltar filas).
 * - `total` es el COUNT real del filtro aplicado; `totalNoLeidas` cuenta SIEMPRE todas las no
 *   leídas del usuario para que el badge no dependa de la página ni del filtro.
 * (Movido sin cambios desde `NotificationDispatcherService.listarNotificacionesInApp`.)
 */
export async function listarNotificacionesInApp(
  ctx: ContextoDespachador,
  usuarioId: string,
  filtro: Partial<FiltroBandejaInAppDTO> = {},
): Promise<BandejaNotificacionesInAppDTO> {
  const { limit, offset, soloNoLeidas } = resolverPaginacionBandeja(filtro);

  const condicionUsuario = eq(notificacionesInApp.usuarioId, usuarioId);
  const condicionLista = soloNoLeidas
    ? and(condicionUsuario, eq(notificacionesInApp.leida, false))
    : condicionUsuario;

  const [filaTotal] = await ctx.db
    .select({ total: count() })
    .from(notificacionesInApp)
    .where(condicionLista);

  const [filaNoLeidas] = await ctx.db
    .select({ total: count() })
    .from(notificacionesInApp)
    .where(and(condicionUsuario, eq(notificacionesInApp.leida, false)));

  const rows = await ctx.db
    .select()
    .from(notificacionesInApp)
    .where(condicionLista)
    .orderBy(desc(notificacionesInApp.createdAtUtc), desc(notificacionesInApp.id))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map((r) => mapearNotificacionInApp(r)),
    total: filaTotal?.total ?? 0,
    limit,
    offset,
    totalNoLeidas: filaNoLeidas?.total ?? 0,
  };
}
