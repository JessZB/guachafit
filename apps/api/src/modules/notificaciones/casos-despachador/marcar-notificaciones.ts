import { NotFoundException } from '@nestjs/common';
import { and, eq, notificacionesInApp } from '@guachafit/database';
import type { ContextoDespachador } from './contexto-despachador';

/**
 * Marca una notificación propia como leída (movido sin cambios desde
 * `NotificationDispatcherService.marcarLeida`).
 */
export async function marcarLeida(
  ctx: ContextoDespachador,
  usuarioId: string,
  notificacionId: string,
): Promise<boolean> {
  const [actualizado] = await ctx.db
    .update(notificacionesInApp)
    .set({ leida: true })
    .where(
      and(
        eq(notificacionesInApp.id, notificacionId),
        eq(notificacionesInApp.usuarioId, usuarioId),
      ),
    )
    .returning();

  if (!actualizado) {
    throw new NotFoundException('No encontramos ese aviso. Actualiza la pantalla.');
  }

  return true;
}

/**
 * Marca todas las no leídas del usuario como leídas y devuelve cuántas filas
 * cambió (movido sin cambios desde `NotificationDispatcherService.marcarTodasLeidas`).
 */
export async function marcarTodasLeidas(
  ctx: ContextoDespachador,
  usuarioId: string,
): Promise<number> {
  const res = await ctx.db
    .update(notificacionesInApp)
    .set({ leida: true })
    .where(
      and(
        eq(notificacionesInApp.usuarioId, usuarioId),
        eq(notificacionesInApp.leida, false),
      ),
    )
    .returning();

  return res.length;
}
