import { count, desc, inArray, controlesAntropometricos, perfilesAlumno } from '@guachafit/database';
import { and, eq } from '@guachafit/database';
import { EstadoMedicion } from '@guachafit/shared';
import { LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO } from '@guachafit/shared';
import type { ColaPendientesAntropometricosDTO } from '@guachafit/shared';
import type { ContextoAntropometria } from './contexto-antropometria';
import { hidratarControl } from './hidratar-control';

/**
 * Lists controls pending validation for the coach inbox.
 *
 * WU24b: `{ items, total, limit, offset }` envelope with a real COUNT in SQL.
 * The current order (descending `fechaEvaluacion`) is kept with a stable
 * tiebreak by `createdAtUtc`/`id` so `offset` advances without repeating or
 * skipping rows.
 */
export async function listarPendientes(
  ctx: ContextoAntropometria,
  coachId: string,
  limit = LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO,
  offset = 0
): Promise<ColaPendientesAntropometricosDTO> {
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura de la cartera con el GUC
  // del coach.
  const alumnosCoach = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
    tx
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
      })
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.entrenadorId, coachId))
  );

  const alumnoIds = alumnosCoach.map((a) => a.usuarioId);
  if (alumnoIds.length === 0) {
    return { items: [], total: 0, limit, offset };
  }

  // WU20: nombre visible del alumno para la cola del coach (aditivo; el cliente tiene fallback).
  const nombrePorAlumno = new Map(
    alumnosCoach.map((a) => [a.usuarioId, `${a.nombres} ${a.apellidos}`])
  );

  const wherePendientes = and(
    inArray(controlesAntropometricos.alumnoId, alumnoIds),
    eq(controlesAntropometricos.estado, EstadoMedicion.PENDIENTE_APROBACION)
  );

  // WU24b: COUNT real en SQL para el `total` del envelope.
  const [filaTotal] = await ctx.db
    .select({ total: count() })
    .from(controlesAntropometricos)
    .where(wherePendientes);

  const rows = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(wherePendientes)
    .orderBy(
      desc(controlesAntropometricos.fechaEvaluacion),
      desc(controlesAntropometricos.createdAtUtc),
      desc(controlesAntropometricos.id)
    )
    .limit(limit)
    .offset(offset);

  const items = await Promise.all(
    rows.map((row) => hidratarControl(ctx, row, true, nombrePorAlumno.get(row.alumnoId) ?? null))
  );

  return {
    items,
    total: Number(filaTotal?.total ?? 0),
    limit,
    offset,
  };
}
