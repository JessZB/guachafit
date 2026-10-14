import { eq, usuarios } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type { ContextoDespachador } from './contexto-despachador';

/**
 * RF-015: rol del destinatario para elegir la mitad correcta de la matriz (§A alumno / §B coach).
 *
 * Se consulta solo cuando las preferencias no lo trajeron (fila legada o servicio caído). El
 * fallback es `ALUMNO`: ante un rol irresoluble se conserva el comportamiento más conservador
 * (categorías exclusivas del coach — `ALUMNOS`/`RESUMEN_SEMANAL` — siguen resolviéndose por
 * `buscarDefinicionUnica` en `matriz-preferencias`).
 * (Movido sin cambios desde `NotificationDispatcherService.resolverRolDestinatario`.)
 */
export async function resolverRolDestinatario(
  ctx: ContextoDespachador,
  usuarioId: string,
): Promise<Rol> {
  try {
    const [fila] = await ctx.db
      .select({ rol: usuarios.rol })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return fila?.rol ?? Rol.ALUMNO;
  } catch {
    return Rol.ALUMNO;
  }
}
