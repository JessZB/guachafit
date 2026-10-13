import { BadRequestException } from '@nestjs/common';
import {
  and,
  eq,
  overridesClientePlan,
  type TenantTransaction,
} from '@guachafit/database';
import { toCents, type PlanFila } from './finanzas-reglas';

// ===========================================================================
// 3b-iv. PRECEDENCIA DE VALORES RN-03 (RF-005)
// ===========================================================================

/**
 * RF-005 RN-03 (Precedencia de Valores) — corazón de este requerimiento:
 * "Al generarse una nueva cuota para un cliente, el sistema evalúa: si existe un Override
 *  activo para ese cliente, toma sus valores; en caso contrario, toma los valores por
 *  defecto del plan estándar del catálogo."
 * Orden exacto aplicado:
 *   1. `precio_acordado_usd` del override del alumno para ESTE plan (si existe y no es null).
 *      Un override de 0.00 es legítimo: becado/intercambio (RF-005 §6) y la cuota nace
 *      saldada en estado `al_dia` (sin recordatorios de cobro).
 *   2. `precio_base_usd` del plan del catálogo (RN-01: mayor a 0.00).
 * Un plan sin precio base y sin override de precio no emite cuota: jamás se inventa un monto.
 */
export async function resolverMontoCuotaCaso(
  tx: TenantTransaction,
  plan: PlanFila,
  clienteUsuarioId: string
): Promise<{ montoTotal: string; esBecado: boolean }> {
  const [override] = await tx
    .select()
    .from(overridesClientePlan)
    .where(
      and(
        eq(overridesClientePlan.planId, plan.id),
        eq(overridesClientePlan.clienteId, clienteUsuarioId)
      )
    );

  const precioAcordado = override?.precioAcordadoUsd ?? null;
  if (precioAcordado !== null && toCents(precioAcordado) < 0) {
    throw new BadRequestException('El precio acordado del alumno no puede ser negativo.');
  }

  if (precioAcordado !== null) {
    // El override del alumno SIEMPRE gana sobre el precio del catálogo (RN-03), incluso en 0.00.
    return { montoTotal: precioAcordado, esBecado: toCents(precioAcordado) === 0 };
  }
  if (toCents(plan.precioBaseUsd) > 0) {
    return { montoTotal: plan.precioBaseUsd, esBecado: false };
  }
  throw new BadRequestException(
    'El plan no tiene un precio base mayor a 0.00. Para un alumno becado o un acuerdo de intercambio, asígnale un precio especial de 0.00.'
  );
}
