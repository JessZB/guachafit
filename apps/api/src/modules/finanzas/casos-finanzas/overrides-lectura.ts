import { NotFoundException } from '@nestjs/common';
import { OverridePlanDetalleDTO } from '@guachafit/shared';
import {
  and,
  desc,
  eq,
  inArray,
  overridesClientePlan,
  perfilesAlumno,
  planesMembresia,
} from '@guachafit/database';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import { toIsoSafe } from './finanzas-reglas';
import { resolveClienteUsuarioId } from './soporte-finanzas';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 3b-iii. LECTURA DE OVERRIDES (RF-005 RN-02)
// ===========================================================================

/**
 * Listado de overrides del catálogo (RF-005 RN-02).
 *
 * - Sin `clienteId`: todos los overrides de la cartera del entrenador (soporta la UI de
 *   catálogo/planes).
 * - Con `clienteId` (usuarioId o perfilId): solo los del alumno, validando que pertenezca a
 *   su cartera (404 uniforme si no existe o es de otro coach — aislamiento multi-tenant).
 *
 * El aislamiento se garantiza filtrando por los planes del propio entrenador: un override
 * solo existe si su plan es del catálogo del coach autenticado.
 */
export async function listarOverridesCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId?: string
): Promise<OverridePlanDetalleDTO[]> {
  // RNF-003/ADR-011 (etapa 2): el catálogo (`planes_membresia`) tiene RLS; el flujo completo
  // (planes + alumno + overrides + nombres) corre en UNA transacción con el GUC del coach.
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    const planes = await tx
      .select({
        id: planesMembresia.id,
        nombre: planesMembresia.nombre,
        precioBaseUsd: planesMembresia.precioBaseUsd,
      })
      .from(planesMembresia)
      .where(eq(planesMembresia.entrenadorId, entrenadorId));

    if (planes.length === 0) return [];
    const planesPorId = new Map(planes.map((plan) => [plan.id, plan]));

    let clienteUsuarioId: string | undefined;
    if (clienteId) {
      clienteUsuarioId = await resolveClienteUsuarioId(clienteId, tx);
      const [alumno] = await tx
        .select({ id: perfilesAlumno.id })
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, clienteUsuarioId),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        );

      if (!alumno) {
        throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
      }
    }

    const whereOverrides = clienteUsuarioId
      ? and(
          inArray(
            overridesClientePlan.planId,
            planes.map((plan) => plan.id)
          ),
          eq(overridesClientePlan.clienteId, clienteUsuarioId)
        )
      : inArray(
          overridesClientePlan.planId,
          planes.map((plan) => plan.id)
        );

    const overrides = await tx
      .select()
      .from(overridesClientePlan)
      .where(whereOverrides)
      .orderBy(desc(overridesClientePlan.updatedAtUtc), desc(overridesClientePlan.id));

    if (overrides.length === 0) return [];

    const clienteIds = [...new Set(overrides.map((o) => o.clienteId))];
    const alumnos = await tx
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
      })
      .from(perfilesAlumno)
      .where(
        and(
          inArray(perfilesAlumno.usuarioId, clienteIds),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );
    const nombresPorUsuario = new Map(
      alumnos.map((alumno) => [
        alumno.usuarioId,
        `${alumno.nombres} ${alumno.apellidos}`.trim(),
      ])
    );

    return overrides.map((o) => {
      const plan = planesPorId.get(o.planId);
      return {
        id: o.id,
        planId: o.planId,
        clienteId: o.clienteId,
        precioAcordadoUsd: o.precioAcordadoUsd,
        tasaFijadaOverride: o.tasaFijadaOverride,
        beneficiosPersonalizados: (o.beneficiosPersonalizados as string[]) || null,
        motivoOverride: o.motivoOverride,
        planNombre: plan?.nombre ?? null,
        planPrecioBaseUsd: plan?.precioBaseUsd ?? null,
        clienteNombre: nombresPorUsuario.get(o.clienteId) ?? null,
        createdAtUtc: toIsoSafe(o.createdAtUtc),
        updatedAtUtc: toIsoSafe(o.updatedAtUtc),
      };
    });
  });
}
