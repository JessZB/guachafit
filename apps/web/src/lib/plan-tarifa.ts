/**
 * RF-005: plan comercial y tarifa acordada por alumno (override).
 *
 * Reglas que materializa este módulo (lógica pura, testeable sin UI):
 * - RN-02: el override del alumno puede fijar `precioAcordadoUsd` y/o `tasaFijadaOverride`.
 *   Un precio de 0.00 es legítimo y significa becado/intercambio (§6).
 * - RN-03: lo que el coach guarda aquí es exactamente lo que el servidor aplicará al emitir la
 *   cuota (override > precio del catálogo); por eso el payload viaja SIEMPRE con el valor
 *   explícito (o `null` para volver a heredar el catálogo).
 * - El formulario nunca inventa valores: campo vacío = `null` (hereda), nunca 0 por defecto.
 */
import type { OverridePlanDetalleDTO, PlanMembresiaDetalleDTO } from '@guachafit/shared';

/** Monto USD con hasta 2 decimales (acepta enteros: "35" se normaliza a "35.00"). */
const REGEX_MONTO_USD = /^\d+(\.\d{1,2})?$/;

/** Tasa VES por USD con hasta 4 decimales (debe ser mayor a 0). */
const REGEX_TASA = /^\d+(\.\d{1,4})?$/;

export interface PayloadOverridePlanTarifa {
  planId: string;
  /** `null` explícito = el alumno hereda el precio base del catálogo. */
  precioAcordadoUsd: string | null;
  /** `null` explícito = el alumno vuelve a la tasa global del entrenador (ADR-003 §3.2). */
  tasaFijadaOverride: string | null;
}

export type DecisionPlanTarifa =
  | { accion: 'ninguna' }
  | { accion: 'guardar_override'; overridesAEliminar: string[]; payload: PayloadOverridePlanTarifa }
  | { accion: 'eliminar_override'; overridesAEliminar: string[] }
  | { accion: 'error'; mensaje: string };

export interface EntradaPlanTarifa {
  planSeleccionadoId: string;
  precioAcordado: string;
  tasaEspecial: string;
  /** Overrides vigentes del alumno (el más reciente primero, como los devuelve la API). */
  overridesVigentes: OverridePlanDetalleDTO[];
}

export function esPrecioAcordadoValido(valor: string): boolean {
  const limpio = valor.trim();
  return limpio.length > 0 && REGEX_MONTO_USD.test(limpio);
}

export function esTasaEspecialValida(valor: string): boolean {
  const limpio = valor.trim();
  if (limpio.length === 0 || !REGEX_TASA.test(limpio)) return false;
  return Number(limpio) > 0;
}

/** Normaliza a 2 decimales ("35" → "35.00"); el llamador debe validar antes. */
export function normalizarPrecioAcordado(valor: string): string {
  return Number(valor.trim()).toFixed(2);
}

/** Normaliza a 4 decimales ("65" → "65.0000"); el llamador debe validar antes. */
export function normalizarTasaEspecial(valor: string): string {
  return Number(valor.trim()).toFixed(4);
}

/**
 * Decide qué hacer con el plan y la tarifa al guardar la ficha.
 *
 * - Sin plan seleccionado: si había override asignado, se elimina (el alumno vuelve al catálogo);
 *   si no, no hay nada que hacer en esta tarjeta (la tasa suelta se guarda por el PATCH legado).
 * - Con plan seleccionado: se crea/actualiza el override del plan elegido y se eliminan los
 *   overrides de OTROS planes (el plan activo del alumno es único en la UI).
 * - Si ya existe un override para ese plan y nada cambió, no se escribe nada.
 */
export function decidirGuardadoPlanTarifa(entrada: EntradaPlanTarifa): DecisionPlanTarifa {
  const planId = entrada.planSeleccionadoId.trim();
  const precio = entrada.precioAcordado.trim();
  const tasa = entrada.tasaEspecial.trim();
  const overrides = Array.isArray(entrada.overridesVigentes) ? entrada.overridesVigentes : [];

  if (precio.length > 0 && !esPrecioAcordadoValido(precio)) {
    return {
      accion: 'error',
      mensaje:
        'El precio acordado debe ser un monto en USD con hasta 2 decimales (0.00 es válido para becados).',
    };
  }
  if (tasa.length > 0 && !esTasaEspecialValida(tasa)) {
    return {
      accion: 'error',
      mensaje: 'La tasa especial debe ser un número mayor a 0 con hasta 4 decimales.',
    };
  }

  if (planId.length === 0) {
    return overrides.length > 0
      ? { accion: 'eliminar_override', overridesAEliminar: overrides.map((o) => o.id) }
      : { accion: 'ninguna' };
  }

  const payload: PayloadOverridePlanTarifa = {
    planId,
    precioAcordadoUsd: precio.length === 0 ? null : normalizarPrecioAcordado(precio),
    tasaFijadaOverride: tasa.length === 0 ? null : normalizarTasaEspecial(tasa),
  };

  const overridesAEliminar = overrides
    .filter((override) => override.planId !== planId)
    .map((override) => override.id);

  const overrideDelPlan = overrides.find((override) => override.planId === planId) ?? null;
  if (overrideDelPlan) {
    const mismoPrecio =
      (overrideDelPlan.precioAcordadoUsd ?? null) === payload.precioAcordadoUsd;
    const mismaTasa =
      (overrideDelPlan.tasaFijadaOverride ?? null) === payload.tasaFijadaOverride;
    if (mismoPrecio && mismaTasa && overridesAEliminar.length === 0) {
      return { accion: 'ninguna' };
    }
  }

  return { accion: 'guardar_override', overridesAEliminar, payload };
}

/** ¿El override vigente corresponde a un alumno becado (precio acordado 0.00)? */
export function esOverrideBecado(override?: OverridePlanDetalleDTO | null): boolean {
  if (!override || override.precioAcordadoUsd === null || override.precioAcordadoUsd === undefined) {
    return false;
  }
  return Number(override.precioAcordadoUsd) === 0;
}

/**
 * Texto humano del precio vigente del alumno para la ficha:
 * becado, precio acordado, o herencia del precio base del catálogo.
 */
export function textoPrecioVigente(
  override: OverridePlanDetalleDTO | null | undefined,
  plan?: PlanMembresiaDetalleDTO | null
): string {
  if (esOverrideBecado(override)) return 'Becado ($0.00)';
  if (override?.precioAcordadoUsd) return `$${override.precioAcordadoUsd} acordado`;
  if (plan?.precioBaseUsd) return `Precio del catálogo ($${plan.precioBaseUsd})`;
  return 'Sin precio definido';
}

/**
 * Fixture demo del override vigente de la ficha (solo se usa con `isDemoMode` activo).
 * Plan base $40.00 con precio acordado $35.00 y tasa especial: demuestra la precedencia RN-03.
 */
export function overrideDemoAlumno(): OverridePlanDetalleDTO {
  const ahora = new Date().toISOString();
  return {
    id: 'override-demo-1',
    planId: 'plan-presencial',
    clienteId: 'user-demo',
    precioAcordadoUsd: '35.00',
    tasaFijadaOverride: '65.0000',
    beneficiosPersonalizados: null,
    motivoOverride: 'Descuento por fidelidad (demo)',
    planNombre: 'Presencial Completo Sala',
    planPrecioBaseUsd: '40.00',
    clienteNombre: 'Carlos Alberto Mendoza Silva',
    createdAtUtc: ahora,
    updatedAtUtc: ahora,
  };
}
