/**
 * M5-L1B (RF-009 RN-01): payload del cobro en sala, compartido por la ficha y Control de Cobros.
 *
 * El cobro en sala es siempre en efectivo (la API rechaza otros métodos): el método se deriva de
 * la moneda y nunca viaja una referencia bancaria. `hoyLocal` es el día LOCAL de la operación
 * (`toISOString()` lo desplazaría al día siguiente por la tarde en zonas como UTC-4).
 */
import { MENSAJE_FECHA_PAGO_FUTURA, MetodoPago, Moneda } from '@guachafit/shared';

export interface EntradaCobroSala {
  monto: string;
  moneda: Moneda;
  notas?: string;
  hoyLocal: string;
}

export interface PayloadCobroSala {
  montoOriginal: string;
  monedaOriginal: Moneda;
  metodoPago: MetodoPago;
  fechaOperacion: string;
  notas?: string;
}

export function construirPayloadCobroSala(entrada: EntradaCobroSala): PayloadCobroSala {
  const payload: PayloadCobroSala = {
    montoOriginal: entrada.monto.trim(),
    monedaOriginal: entrada.moneda,
    metodoPago: entrada.moneda === Moneda.VES ? MetodoPago.EFECTIVO_VES : MetodoPago.EFECTIVO_USD,
    fechaOperacion: entrada.hoyLocal,
  };
  const notas = entrada.notas?.trim();
  if (notas) payload.notas = notas;
  return payload;
}

export const MENSAJE_FECHA_PAGO_VACIA = 'Elige la fecha del pago.';

/**
 * RF-007/RF-009: la fecha del pago es obligatoria y no puede ser posterior a hoy (día local). Un
 * pago de días anteriores sí se puede registrar. Devuelve el mensaje de error o `null`.
 */
export function validarFechaCobro(fecha: string, hoyLocal: string): string | null {
  const limpia = fecha.trim();
  if (!limpia) return MENSAJE_FECHA_PAGO_VACIA;
  if (limpia > hoyLocal) return MENSAJE_FECHA_PAGO_FUTURA;
  return null;
}

/**
 * Al cambiar la fecha, un error que hablaba de la fecha deja de ser cierto: se borra. Cualquier
 * otro error del formulario se conserva hasta el próximo envío.
 */
export function errorTrasCambiarFecha(errorActual: string | null): string | null {
  return errorActual === MENSAJE_FECHA_PAGO_VACIA || errorActual === MENSAJE_FECHA_PAGO_FUTURA
    ? null
    : errorActual;
}

/** Aviso de la tasa con la que se convertirá un cobro en bolívares (la vigente al registrar). */
export function textoTasaCobro(tasa?: string | null): string | null {
  if (!tasa || !(Number(tasa) > 0)) return null;
  return `Se convertirá con la tasa vigente al registrar: 1 USD = ${tasa} Bs.`;
}
