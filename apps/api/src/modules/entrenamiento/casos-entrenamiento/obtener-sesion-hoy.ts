import { and, desc, eq } from '@guachafit/database';
import { sesionesEntrenamiento } from '@guachafit/database';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import type { ContextoEntrenamiento } from './contexto';
import { hidratarSesion } from './hidratar-sesion';

// ---------------------------------------------------------------------------
// 3. CONSULTA DE SESIÓN (RN-04: ACCIÓN PASIVA DE SOLO LECTURA)
// (Movido sin cambios desde `EntrenamientoService.obtenerSesionHoy`.)
// ---------------------------------------------------------------------------

/**
 * Consulta PASIVA y READ-ONLY de la sesión de hoy del alumno (RF-001 Escenario 1 / RN-04).
 *
 * - NUNCA crea, reemplaza ni elimina sesiones: navegar o consultar bloques jamás muta datos.
 *   La instanciación o el cambio de bloque ocurren solo vía `entrenarBloqueHoy` (acción explícita).
 * - Con `bloqueId`: retorna la sesión de hoy de ese bloque (la más reciente) o null.
 * - Sin `bloqueId`: retorna la sesión de hoy más reciente del alumno o null.
 */
export async function obtenerSesionHoy(
  ctx: ContextoEntrenamiento,
  alumnoId: string,
  timezoneCliente?: string,
  bloqueId?: string
): Promise<SesionEntrenamientoDetalleDTO | null> {
  const tz = timezoneCliente || 'America/Caracas';
  let hoyStr: string;
  try {
    hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    hoyStr = new Date().toISOString().split('T')[0];
  }

  // Buscar sesiones de hoy para este alumno (sin mutaciones de ningún tipo)
  const sesionesHoy = await ctx.db
    .select()
    .from(sesionesEntrenamiento)
    .where(
      and(
        eq(sesionesEntrenamiento.alumnoId, alumnoId),
        eq(sesionesEntrenamiento.fechaProgramada, hoyStr)
      )
    )
    .orderBy(desc(sesionesEntrenamiento.createdAtUtc));

  const sesionHoy = bloqueId
    ? sesionesHoy.find((s) => s.bloqueId === bloqueId)
    : sesionesHoy[0];

  // RNF-003/ADR-011 (etapa 3): hidratación del nombre con el contexto self del alumno.
  return sesionHoy
    ? hidratarSesion(ctx, sesionHoy, { usuarioId: sesionHoy.alumnoId })
    : null;
}
