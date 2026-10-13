import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ActualizarPlanMembresiaDTO,
  CrearPlanMembresiaDTO,
  PlanMembresiaDetalleDTO,
} from '@guachafit/shared';
import { desc, eq, planesMembresia } from '@guachafit/database';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 3a. CATÁLOGO DE PLANES (RF-005)
// ===========================================================================

export async function crearPlanCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  dto: CrearPlanMembresiaDTO
): Promise<PlanMembresiaDetalleDTO> {
  // RNF-003/ADR-011 (etapa 2): `planes_membresia` tiene RLS; alta tenant-scoped.
  const [plan] = await ctx.withTenant({ entrenadorId }, async (tx) =>
    tx
      .insert(planesMembresia)
      .values({
        entrenadorId,
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() || null,
        beneficios: dto.beneficios,
        precioBaseUsd: dto.precioBaseUsd,
        duracionMeses: dto.duracionMeses ?? 1,
        activo: dto.activo ?? true,
      })
      .returning()
  );

  return {
    id: plan.id,
    entrenadorId: plan.entrenadorId,
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    beneficios: (plan.beneficios as string[]) || [],
    precioBaseUsd: plan.precioBaseUsd,
    duracionMeses: plan.duracionMeses,
    activo: plan.activo,
    createdAtUtc: plan.createdAtUtc.toISOString(),
    updatedAtUtc: plan.updatedAtUtc.toISOString(),
  };
}

export async function listarPlanesPorEntrenadorCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string
): Promise<PlanMembresiaDetalleDTO[]> {
  const planes = await ctx.withTenant({ entrenadorId }, async (tx) =>
    tx
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.entrenadorId, entrenadorId))
      .orderBy(desc(planesMembresia.createdAtUtc))
  );

  return planes.map((plan) => ({
    id: plan.id,
    entrenadorId: plan.entrenadorId,
    nombre: plan.nombre,
    descripcion: plan.descripcion,
    beneficios: (plan.beneficios as string[]) || [],
    precioBaseUsd: plan.precioBaseUsd,
    duracionMeses: plan.duracionMeses,
    activo: plan.activo,
    createdAtUtc: plan.createdAtUtc.toISOString(),
    updatedAtUtc: plan.updatedAtUtc.toISOString(),
  }));
}

export async function actualizarPlanCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  planId: string,
  dto: ActualizarPlanMembresiaDTO
): Promise<PlanMembresiaDetalleDTO> {
  const updates: Partial<typeof planesMembresia.$inferInsert> = {
    updatedAtUtc: new Date(),
  };

  if (dto.nombre !== undefined) updates.nombre = dto.nombre.trim();
  if (dto.descripcion !== undefined) updates.descripcion = dto.descripcion.trim();
  if (dto.beneficios !== undefined) updates.beneficios = dto.beneficios;
  if (dto.precioBaseUsd !== undefined) updates.precioBaseUsd = dto.precioBaseUsd;
  if (dto.duracionMeses !== undefined) updates.duracionMeses = dto.duracionMeses;
  if (dto.activo !== undefined) updates.activo = dto.activo;

  // RNF-003/ADR-011 (etapa 2): lectura + escritura de `planes_membresia` en UNA transacción
  // con el GUC del coach (además del chequeo de tenancy explícito de negocio).
  const actualizado = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.id, planId))
      .limit(1);

    if (!plan) {
      throw new NotFoundException('No encontramos ese plan. Puede que se haya eliminado.');
    }

    if (plan.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(
        'No tienes acceso a este plan.'
      );
    }

    const [fila] = await tx
      .update(planesMembresia)
      .set(updates)
      .where(eq(planesMembresia.id, planId))
      .returning();

    return fila;
  });

  return {
    id: actualizado.id,
    entrenadorId: actualizado.entrenadorId,
    nombre: actualizado.nombre,
    descripcion: actualizado.descripcion,
    beneficios: (actualizado.beneficios as string[]) || [],
    precioBaseUsd: actualizado.precioBaseUsd,
    duracionMeses: actualizado.duracionMeses,
    activo: actualizado.activo,
    createdAtUtc: actualizado.createdAtUtc.toISOString(),
    updatedAtUtc: actualizado.updatedAtUtc.toISOString(),
  };
}
