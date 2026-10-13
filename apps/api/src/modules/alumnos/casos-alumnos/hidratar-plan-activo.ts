import {
  TenantTransaction,
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  overridesClientePlan,
  perfilesAlumno,
  planesMembresia,
  cuotasMembresia,
} from '@guachafit/database';

export interface PlanActivoInfo {
  planActivoId: string | null;
  planActivoNombre: string | null;
  precioAcordadoOverride: string | null;
}

/**
 * RF-005: hydrates the active plan and agreed price for a batch of students.
 * Moved verbatim from `AlumnosService.hidratarPlanActivo` (P3).
 */
export async function hidratarPlanActivo(
  tx: TenantTransaction,
  entrenadorId: string,
  alumnoUsuarioIds: string[]
): Promise<Map<string, PlanActivoInfo>> {
  const planesActivos = new Map<string, PlanActivoInfo>();
  const ids = [...new Set(alumnoUsuarioIds)].filter(Boolean);
  if (ids.length === 0) return planesActivos;

  const planes = await tx
    .select({
      id: planesMembresia.id,
      nombre: planesMembresia.nombre,
      precioBaseUsd: planesMembresia.precioBaseUsd,
    })
    .from(planesMembresia)
    .where(eq(planesMembresia.entrenadorId, entrenadorId));

  if (planes.length === 0) return planesActivos;
  const planesPorId = new Map(planes.map((plan) => [plan.id, plan]));
  const idsPlanes = planes.map((plan) => plan.id);

  const overrides = await tx
    .select()
    .from(overridesClientePlan)
    .where(
      and(
        inArray(overridesClientePlan.clienteId, ids),
        inArray(overridesClientePlan.planId, idsPlanes)
      )
    )
    .orderBy(desc(overridesClientePlan.updatedAtUtc), desc(overridesClientePlan.id));

  const suscripciones = await tx
    .select({
      usuarioId: perfilesAlumno.usuarioId,
      planSuscritoId: perfilesAlumno.planSuscritoId,
    })
    .from(perfilesAlumno)
    .where(
      and(
        inArray(perfilesAlumno.usuarioId, ids),
        eq(perfilesAlumno.entrenadorId, entrenadorId),
        isNotNull(perfilesAlumno.planSuscritoId)
      )
    );

  for (const suscripcion of suscripciones) {
    const plan = suscripcion.planSuscritoId ? planesPorId.get(suscripcion.planSuscritoId) : null;
    if (!plan) continue;
    const overrideDelPlan = overrides.find(
      (override) => override.clienteId === suscripcion.usuarioId && override.planId === plan.id
    );
    planesActivos.set(suscripcion.usuarioId, {
      planActivoId: plan.id,
      planActivoNombre: plan.nombre,
      precioAcordadoOverride: overrideDelPlan?.precioAcordadoUsd ?? null,
    });
  }

  for (const override of overrides) {
    if (planesActivos.has(override.clienteId)) continue;
    const plan = planesPorId.get(override.planId);
    if (!plan) continue;
    planesActivos.set(override.clienteId, {
      planActivoId: plan.id,
      planActivoNombre: plan.nombre,
      precioAcordadoOverride: override.precioAcordadoUsd ?? null,
    });
  }

  const sinOverride = ids.filter((usuarioId) => !planesActivos.has(usuarioId));
  if (sinOverride.length > 0) {
    const cuotas = await tx
      .select({
        clienteId: cuotasMembresia.clienteId,
        planId: cuotasMembresia.planId,
        createdAtUtc: cuotasMembresia.createdAtUtc,
      })
      .from(cuotasMembresia)
      .where(
        and(
          inArray(cuotasMembresia.clienteId, sinOverride),
          eq(cuotasMembresia.entrenadorId, entrenadorId)
        )
      )
      .orderBy(desc(cuotasMembresia.createdAtUtc), desc(cuotasMembresia.id));

    for (const cuota of cuotas) {
      if (planesActivos.has(cuota.clienteId)) continue;
      const plan = planesPorId.get(cuota.planId);
      if (!plan) continue;
      planesActivos.set(cuota.clienteId, {
        planActivoId: plan.id,
        planActivoNombre: plan.nombre,
        precioAcordadoOverride: null,
      });
    }
  }

  return planesActivos;
}
