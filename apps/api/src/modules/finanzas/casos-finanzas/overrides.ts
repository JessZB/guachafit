import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CrearOverridePlanDTO,
  EliminarOverridePlanResultadoDTO,
  OverridePlanDetalleDTO,
} from '@guachafit/shared';
import {
  and,
  eq,
  overridesClientePlan,
  perfilesAlumno,
  planesMembresia,
} from '@guachafit/database';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import { resolveClienteUsuarioId } from './acceso-rls-finanzas';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 3b. OVERRIDES POR ALUMNO (RF-005 RN-02 / RN-03)
// ===========================================================================

export async function crearOverrideCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  dto: CrearOverridePlanDTO
): Promise<OverridePlanDetalleDTO> {
  // RNF-003/ADR-011 (etapa 2): plan (RLS) + alumno + override + tasa del alumno en UNA
  // transacción con el GUC del coach. `overrides_cliente_plan` y `perfiles_alumno` aún no
  // tienen RLS (etapa 3), pero comparten el contexto para no fragmentar el flujo.
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    // 1. Validar que el plan pertenezca al entrenador
    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(
        and(eq(planesMembresia.id, dto.planId), eq(planesMembresia.entrenadorId, entrenadorId))
      );

    if (!plan) {
      throw new NotFoundException('Ese plan no está en tu catálogo. Actualiza la pantalla.');
    }

    // 2. Validar que el alumno pertenezca al entrenador
    const clienteUsuarioId = await resolveClienteUsuarioId(dto.clienteId, tx);
    const [alumno] = await tx
      .select()
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

    // 3. Upsert en tabla overridesClientePlan
    const [existente] = await tx
      .select()
      .from(overridesClientePlan)
      .where(
        and(
          eq(overridesClientePlan.planId, dto.planId),
          eq(overridesClientePlan.clienteId, clienteUsuarioId)
        )
      );

    let override;
    const nowUtc = new Date();

    if (existente) {
      // Semántica de upsert (RF-005 RN-02): `undefined` conserva el valor vigente; `null`
      // explícito lo limpia (p. ej. quitar el precio acordado para volver al precio del plan).
      [override] = await tx
        .update(overridesClientePlan)
        .set({
          precioAcordadoUsd:
            dto.precioAcordadoUsd !== undefined
              ? dto.precioAcordadoUsd
              : existente.precioAcordadoUsd,
          tasaFijadaOverride:
            dto.tasaFijadaOverride !== undefined
              ? dto.tasaFijadaOverride
              : existente.tasaFijadaOverride,
          beneficiosPersonalizados:
            dto.beneficiosPersonalizados !== undefined
              ? dto.beneficiosPersonalizados
              : existente.beneficiosPersonalizados,
          motivoOverride:
            dto.motivoOverride !== undefined ? dto.motivoOverride : existente.motivoOverride,
          updatedAtUtc: nowUtc,
        })
        .where(eq(overridesClientePlan.id, existente.id))
        .returning();
    } else {
      [override] = await tx
        .insert(overridesClientePlan)
        .values({
          planId: dto.planId,
          clienteId: clienteUsuarioId,
          precioAcordadoUsd: dto.precioAcordadoUsd ?? null,
          tasaFijadaOverride: dto.tasaFijadaOverride ?? null,
          beneficiosPersonalizados: dto.beneficiosPersonalizados ?? null,
          motivoOverride: dto.motivoOverride ?? null,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning();
    }

    // ADR-003 §3.2 / RF-005 RN-02: la tasa especial del alumno vive en `perfiles_alumno`
    // (`tasa_fijada_override`) para que TODAS las operaciones bimonetarias la usen. El override
    // del plan la sincroniza; un `null` explícito la limpia y el alumno vuelve a la tasa global.
    if (dto.tasaFijadaOverride !== undefined) {
      await tx
        .update(perfilesAlumno)
        .set({
          tasaFijadaOverride: dto.tasaFijadaOverride,
          updatedAtUtc: nowUtc,
        })
        .where(
          and(
            eq(perfilesAlumno.usuarioId, clienteUsuarioId),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        );
    }

    return {
      id: override.id,
      planId: override.planId,
      clienteId: override.clienteId,
      precioAcordadoUsd: override.precioAcordadoUsd,
      tasaFijadaOverride: override.tasaFijadaOverride,
      beneficiosPersonalizados: (override.beneficiosPersonalizados as string[]) || null,
      motivoOverride: override.motivoOverride,
      planNombre: plan.nombre,
      planPrecioBaseUsd: plan.precioBaseUsd,
      clienteNombre: `${alumno.nombres} ${alumno.apellidos}`.trim(),
      createdAtUtc: override.createdAtUtc.toISOString(),
      updatedAtUtc: override.updatedAtUtc.toISOString(),
    };
  });
}

// ===========================================================================
// 3b-ii. ELIMINACIÓN DE OVERRIDE (RF-005 RN-02)
// ===========================================================================

/**
 * Elimina un override individual (RF-005 RN-02): el alumno vuelve a heredar los valores del
 * plan del catálogo. La verificación de tenancy se hace contra el plan dueño del override.
 *
 * Si la tasa global del alumno (`perfiles_alumno.tasa_fijada_override`) coincidía con la tasa
 * de este override, se limpia junto con él para no dejar una tasa huérfana aplicándose en
 * operaciones bimonetarias (ADR-003 §3.2). Una tasa fijada manualmente distinta se conserva.
 */
export async function eliminarOverrideCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  overrideId: string
): Promise<EliminarOverridePlanResultadoDTO> {
  // RNF-003/ADR-011 (etapa 2): plan (RLS) + override + limpieza de tasa en UNA transacción
  // con el GUC del coach (la verificación de tenancy de negocio se conserva).
  return ctx.withTenant({ entrenadorId }, async (tx) => {
    const [override] = await tx
      .select()
      .from(overridesClientePlan)
      .where(eq(overridesClientePlan.id, overrideId))
      .limit(1);

    if (!override) {
      throw new NotFoundException('No encontramos ese precio especial. Puede que se haya eliminado.');
    }

    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.id, override.planId))
      .limit(1);

    if (!plan || plan.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(
        'No tienes acceso a este precio especial.'
      );
    }

    await tx.delete(overridesClientePlan).where(eq(overridesClientePlan.id, overrideId));

    if (override.tasaFijadaOverride) {
      await tx
        .update(perfilesAlumno)
        .set({ tasaFijadaOverride: null, updatedAtUtc: new Date() })
        .where(
          and(
            eq(perfilesAlumno.usuarioId, override.clienteId),
            eq(perfilesAlumno.entrenadorId, entrenadorId),
            eq(perfilesAlumno.tasaFijadaOverride, override.tasaFijadaOverride)
          )
        );
    }

    return {
      id: overrideId,
      eliminado: true,
      mensaje: `Precio especial de ${plan.nombre} eliminado: el alumno vuelve a los valores del catálogo.`,
    };
  });
}
