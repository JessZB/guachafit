/**
 * M5-L1B (RF-005 / ADR-020): plan asignado al alumno (suscripción) en la ficha del coach.
 *
 * El plan del alumno es su suscripción (`/finanzas/suscripciones/:clienteId`): de ella salen
 * las cuotas automáticas. El override solo guarda precio acordado y tasa especial
 * (`lib/plan-tarifa.ts`). Lógica pura, testeable sin UI; el servidor revalida todo.
 */
import type { SuscripcionAlumnoDTO } from '@guachafit/shared';
import { sumarDiasCalendario } from './date-format';

export const MENSAJE_FECHA_INICIO_REQUERIDA = 'Elige la fecha de inicio del plan.';
const MENSAJE_FECHA_INICIO_INVALIDA = 'Elige una fecha de inicio válida.';
const MENSAJE_SIN_PLAN_ASIGNADO = 'Este alumno no tiene un plan asignado';

/** Mismo rango que valida la API (días de calendario respecto a hoy). */
const DIAS_MAXIMOS_INICIO_PASADO = 30;
const DIAS_MAXIMOS_INICIO_FUTURO = 60;

const REGEX_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DecisionSuscripcion =
  | { accion: 'ninguna' }
  | { accion: 'asignar'; payload: { planId: string; fechaInicio: string } }
  | { accion: 'cambiar_plan'; payload: { planId: string } }
  | { accion: 'error'; mensaje: string };

export interface EntradaSuscripcion {
  suscripcionActual: SuscripcionAlumnoDTO | null;
  planSeleccionadoId: string;
  fechaInicio: string;
  hoyLocal: string;
}

/** `YYYY-MM-DD` → `DD/MM/AAAA` (mismo formato que los mensajes de la API). */
export function formatearFechaCorta(yyyyMmDd: string): string {
  const [anio, mes, dia] = yyyyMmDd.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Bordes (inclusive) de la fecha de inicio del primer plan: hoy−30 y hoy+60. */
export function rangoFechaInicioSuscripcion(hoyLocal: string): { minimo: string; maximo: string } {
  return {
    minimo: sumarDiasCalendario(hoyLocal, -DIAS_MAXIMOS_INICIO_PASADO),
    maximo: sumarDiasCalendario(hoyLocal, DIAS_MAXIMOS_INICIO_FUTURO),
  };
}

function esFechaCalendarioReal(valor: string): boolean {
  const partes = REGEX_FECHA.exec(valor);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/**
 * Qué hacer con la suscripción al guardar la ficha.
 * - Sin suscripción: elegir un plan la asigna con su fecha de inicio (validada contra el rango).
 * - Con suscripción: otro plan la cambia (sin fecha: el día de vencimiento no se mueve). Dejar el
 *   selector vacío no hace nada: quitar el plan es una acción aparte, con confirmación.
 */
export function decidirGuardadoSuscripcion(entrada: EntradaSuscripcion): DecisionSuscripcion {
  const planId = entrada.planSeleccionadoId.trim();
  const fechaInicio = entrada.fechaInicio.trim();
  const actual = entrada.suscripcionActual;

  if (actual) {
    if (planId.length === 0 || planId === actual.planId) return { accion: 'ninguna' };
    return { accion: 'cambiar_plan', payload: { planId } };
  }

  if (planId.length === 0) return { accion: 'ninguna' };
  if (fechaInicio.length === 0) {
    return { accion: 'error', mensaje: MENSAJE_FECHA_INICIO_REQUERIDA };
  }
  if (!esFechaCalendarioReal(fechaInicio)) {
    return { accion: 'error', mensaje: MENSAJE_FECHA_INICIO_INVALIDA };
  }

  const { minimo, maximo } = rangoFechaInicioSuscripcion(entrada.hoyLocal);
  if (fechaInicio < minimo || fechaInicio > maximo) {
    return {
      accion: 'error',
      mensaje: `Elige una fecha de inicio entre el ${formatearFechaCorta(minimo)} y el ${formatearFechaCorta(maximo)}.`,
    };
  }

  return { accion: 'asignar', payload: { planId, fechaInicio } };
}

/** "Próxima cuota: vence el DD/MM/AAAA", o `null` si no hay suscripción o fecha. */
export function textoProximaCuota(suscripcion: SuscripcionAlumnoDTO | null): string | null {
  if (!suscripcion?.proximoCorte) return null;
  return `Próxima cuota: vence el ${formatearFechaCorta(suscripcion.proximoCorte)}`;
}

/** ¿El error es el 400 del cobro en sala para un alumno sin plan asignado? */
export function esErrorSinPlanAsignado(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const mensaje = (error as { message?: unknown }).message;
  return typeof mensaje === 'string' && mensaje.startsWith(MENSAJE_SIN_PLAN_ASIGNADO);
}

/** Fixture demo de la suscripción (solo con `isDemoMode` activo), relativo a hoy. */
export function suscripcionDemoAlumno(
  hoyLocal: string,
  plan: { id: string; nombre: string; duracionMeses: number }
): SuscripcionAlumnoDTO {
  return {
    clienteId: 'user-demo',
    planId: plan.id,
    planNombre: plan.nombre,
    duracionMeses: plan.duracionMeses,
    fechaInicio: sumarDiasCalendario(hoyLocal, -10),
    proximoCorte: sumarDiasCalendario(hoyLocal, 20),
    cuotaEmitidaId: null,
  };
}
