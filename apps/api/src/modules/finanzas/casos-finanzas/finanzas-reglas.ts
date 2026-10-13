import { BadRequestException } from '@nestjs/common';
import { EstadoCuota, MetodoPago, ZONA_HORARIA_ALUMNO_POR_DEFECTO } from '@guachafit/shared';
import {
  cuotasMembresia,
  perfilesAlumno,
  planesMembresia,
} from '@guachafit/database';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';

/** Cuota o pago inexistente (o de otro coach), en lenguaje claro y con tuteo. */
export const MENSAJE_CUOTA_NO_ENCONTRADA = 'No encontramos esa cuota. Actualiza la pantalla.';
export const MENSAJE_PAGO_NO_ENCONTRADO = 'No encontramos ese pago. Actualiza la pantalla.';
export const MENSAJE_REFERENCIA_DUPLICADA =
  'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.';
export const MENSAJE_SIN_PLAN_ASIGNADO = 'Este alumno no tiene un plan asignado.';

/** M5-L1 (RF-005): ventana válida de la fecha de inicio del primer plan, en días locales. */
export const DIAS_MAXIMOS_INICIO_PASADO = 30;
export const DIAS_MAXIMOS_INICIO_FUTURO = 60;

/** Índice único de referencias por entrenador (migración 0018). */
export const INDICE_REFERENCIA_POR_ENTRENADOR = 'uq_transaccion_referencia_entrenador';
export const INDICE_CUOTA_POR_PERIODO = 'uq_cuota_cliente_plan_periodo';
export const MENSAJE_CUOTA_EN_PREPARACION =
  'No pudimos preparar la próxima cuota de este alumno. Actualiza la pantalla e inténtalo de nuevo.';

// =============================================================================
// ARITMÉTICA DECIMAL Y REDONDEO BANCARIO (RNF-002)
// =============================================================================

export function toCents(decimalStr: string): number {
  const parts = decimalStr.trim().split('.');
  const intPart = parseInt(parts[0], 10);
  const fracPart = parts[1] ? parts[1].padEnd(2, '0').slice(0, 2) : '00';
  const sign = decimalStr.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(intPart) * 100 + parseInt(fracPart, 10));
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = (abs % 100).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}

export function roundHalfToEven(val: number, decimals = 2): string {
  const factor = Math.pow(10, decimals);
  const shifted = Number((val * factor).toFixed(8));
  const floor = Math.floor(shifted);
  const diff = Number((shifted - floor).toFixed(8));

  let roundedInt: number;
  const epsilon = 1e-7;

  if (Math.abs(diff - 0.5) < epsilon) {
    roundedInt = floor % 2 === 0 ? floor : floor + 1;
  } else if (diff > 0.5) {
    roundedInt = floor + 1;
  } else {
    roundedInt = floor;
  }

  const result = roundedInt / factor;
  return result.toFixed(decimals);
}

export function addDecimals(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtractDecimals(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function multiplyDecimals(amount: string, rate: string): string {
  const a = parseFloat(amount);
  const r = parseFloat(rate);
  return roundHalfToEven(a * r, 2);
}

export function divideDecimalsBankers(amountBs: string, rate: string): string {
  const bs = parseFloat(amountBs);
  const r = parseFloat(rate);
  if (r <= 0) {
    throw new BadRequestException('La tasa de cambio debe ser estrictamente mayor a 0');
  }
  return roundHalfToEven(bs / r, 2);
}

export function toIsoSafe(d: any): string {
  if (!d) return new Date().toISOString();
  if (typeof d === 'string') {
    return d.endsWith('Z') ? d : new Date(d).toISOString();
  }
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function assertBalanceInvariant(
  montoTotalUsd: string,
  montoAbonadoUsd: string,
  saldoPendienteUsd: string
): void {
  const totalCents = toCents(montoTotalUsd);
  const abonadoCents = toCents(montoAbonadoUsd);
  const pendienteCents = toCents(saldoPendienteUsd);
  const expectedPendiente = Math.max(0, totalCents - abonadoCents);

  if (pendienteCents !== expectedPendiente) {
    throw new Error(
      `Violación de Invariante Contable (RNF-002): Saldo pendiente (${saldoPendienteUsd}) ` +
        `no coincide con Total (${montoTotalUsd}) - Abonado (${montoAbonadoUsd}).`
    );
  }
}

/**
 * RF-006 RN-05: reparte un abono (USD) entre la deuda de la cuota y el saldo a favor. Lo que cubre
 * el saldo pendiente se aplica a la cuota; el resto es excedente y pasa al saldo a favor.
 */
export function repartirAbono(
  saldoPendienteUsd: string,
  montoUsd: string
): { aplicadoUsd: string; excedenteUsd: string } {
  const pendiente = Math.max(0, toCents(saldoPendienteUsd));
  const monto = toCents(montoUsd);
  const aplicado = Math.min(pendiente, monto);
  return { aplicadoUsd: fromCents(aplicado), excedenteUsd: fromCents(monto - aplicado) };
}

/**
 * RF-006 RN-05: estado inicial de una cuota nueva de `montoTotalUsd` cuando el alumno tiene
 * `saldoAFavorUsd`. El saldo cubre la cuota hasta su total (se reutiliza `repartirAbono` con el
 * total como "deuda" y el saldo como "abono"); el becado no consume saldo.
 */
export function aplicarSaldoAFavorACuota(
  montoTotalUsd: string,
  saldoAFavorUsd: string,
  esBecado: boolean
): {
  aplicadoUsd: string;
  saldoPendienteUsd: string;
  saldoAFavorRestanteUsd: string;
  estado: EstadoCuota;
} {
  const reparto = esBecado
    ? { aplicadoUsd: '0.00', excedenteUsd: saldoAFavorUsd }
    : repartirAbono(montoTotalUsd, saldoAFavorUsd);
  const saldoPendienteUsd = subtractDecimals(montoTotalUsd, reparto.aplicadoUsd);
  const estado =
    esBecado || toCents(saldoPendienteUsd) === 0
      ? EstadoCuota.AL_DIA
      : toCents(reparto.aplicadoUsd) > 0
        ? EstadoCuota.ABONADA_PARCIAL
        : EstadoCuota.EMITIDA;
  return {
    aplicadoUsd: reparto.aplicadoUsd,
    saldoPendienteUsd,
    saldoAFavorRestanteUsd: reparto.excedenteUsd,
    estado,
  };
}

/**
 * RF-006 RN-05: cuerpo del aviso de un cobro en sala. Con excedente dice qué parte se aplicó a la
 * cuota y qué parte quedó como saldo a favor (nunca afirma que todo se aplicó a la cuota).
 */
export function mensajeCobroConExcedente(
  inicio: string,
  montoUsd: string,
  excedenteUsd: string
): string {
  if (toCents(excedenteUsd) <= 0) return `${inicio} aplicado a tu cuota.`;
  const aplicado = subtractDecimals(montoUsd, excedenteUsd);
  if (toCents(aplicado) <= 0) {
    return `${inicio}; como tu cuota ya estaba pagada, quedó completo como saldo a favor para tu próxima cuota.`;
  }
  return `${inicio}: ${aplicado} USD se aplicaron a tu cuota y ${excedenteUsd} USD quedaron como saldo a favor para tu próxima cuota.`;
}

/** RF-006 RN-05: cuerpo del aviso de pago aprobado; con excedente menciona el saldo a favor. */
export function mensajePagoAprobado(base: string, excedenteUsd: string): string {
  if (toCents(excedenteUsd) <= 0) return base;
  return `${base} ${excedenteUsd} USD quedaron como saldo a favor para tu próxima cuota.`;
}

/**
 * Estado de una cuota cuando se le retira un abono (rechazo de un pago en revisión o reversión de
 * uno aprobado, RF-007): otros pagos en revisión mandan; si ya quedó saldada, al día; si conserva
 * algún abono, parcial; si no, vencida o emitida según el corte.
 */
export function estadoCuotaTrasRetirarAbono(cuota: {
  montoAbonadoUsd: string;
  saldoPendienteUsd: string;
  fechaCorteUtc: Date | string;
  hayOtrasPendientes: boolean;
  ahora: Date;
}): EstadoCuota {
  if (cuota.hayOtrasPendientes) return EstadoCuota.PENDIENTE_REVISION;
  if (toCents(cuota.saldoPendienteUsd) === 0) return EstadoCuota.AL_DIA;
  if (toCents(cuota.montoAbonadoUsd) > 0) return EstadoCuota.ABONADA_PARCIAL;
  return new Date(cuota.fechaCorteUtc).getTime() < cuota.ahora.getTime()
    ? EstadoCuota.VENCIDA
    : EstadoCuota.EMITIDA;
}

/**
 * RF-007/RF-009: ¿la fecha de un pago (YYYY-MM-DD) es futura? Se compara con "hoy" en la zona más
 * adelantada del mundo (UTC+14): así una diferencia de zona entre entrenador y alumno nunca rechaza
 * un pago de hoy. La web limita además el campo a hoy en el dispositivo.
 */
export function esFechaPagoFutura(fechaOperacion: string, ahora: Date): boolean {
  return fechaOperacion > obtenerFechaLocalYyyyMmDd(ahora, 'Pacific/Kiritimati');
}

/** El efectivo no lleva referencia bancaria: nunca participa en la detección de duplicados. */
export function esMetodoEfectivo(metodo: MetodoPago): boolean {
  return metodo === MetodoPago.EFECTIVO_USD || metodo === MetodoPago.EFECTIVO_VES;
}

export type PlanFila = typeof planesMembresia.$inferSelect;
export type PerfilAlumnoFila = typeof perfilesAlumno.$inferSelect;
export type CuotaFila = typeof cuotasMembresia.$inferSelect;

/** Resultado de emitir (o encontrar ya emitida) la cuota de un ciclo de la suscripción. */
export interface EmisionCiclo {
  /** Cuota creada en esta llamada; `null` si la de ese periodo ya existía. */
  cuota: CuotaFila | null;
  esBecado: boolean;
  /** Vencimiento (día local) que queda como próximo tras avanzar el ciclo. */
  proximoCorte: string;
}

export function zonaDelAlumno(perfil: Pick<PerfilAlumnoFila, 'zonaHoraria'>): string {
  return perfil.zonaHoraria || ZONA_HORARIA_ALUMNO_POR_DEFECTO;
}

/** `YYYY-MM-DD` → `DD/MM/AAAA` para los mensajes al entrenador. */
export function formatearFechaCorta(fechaYyyyMmDd: string): string {
  const [anio, mes, dia] = fechaYyyyMmDd.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Resultado de `resolverTasa`: tasa efectiva y su fuente, sin inventar valores. */
export interface ResolucionTasa {
  tasaEfectiva: string | null;
  esTasaOverride: boolean;
  fuenteTasa:
    | 'oficial_bcv'
    | 'paralelo'
    | 'entrenador_activa'
    | 'override_cliente'
    | 'sin_configurar';
}

export function resolverTasa(
  tasaActivaCoach: string | null,
  tasaOverrideCliente?: string | null
): ResolucionTasa {
  if (tasaOverrideCliente && parseFloat(tasaOverrideCliente) > 0) {
    return {
      tasaEfectiva: tasaOverrideCliente,
      esTasaOverride: true,
      fuenteTasa: 'override_cliente',
    };
  }

  // Sin tasa configurada (ni activa del coach ni override del alumno) NO se inventa una
  // tasa: se devuelve null y cada consumidor decide (estado honesto u error de negocio).
  if (!tasaActivaCoach || parseFloat(tasaActivaCoach) <= 0) {
    return {
      tasaEfectiva: null,
      esTasaOverride: false,
      fuenteTasa: 'sin_configurar',
    };
  }

  return {
    tasaEfectiva: tasaActivaCoach,
    esTasaOverride: false,
    fuenteTasa: 'entrenador_activa',
  };
}
