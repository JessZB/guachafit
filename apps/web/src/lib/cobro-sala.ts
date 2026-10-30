/**
 * M5-L1B (RF-009 RN-01): payload del cobro en sala, compartido por la ficha y Control de cobros.
 *
 * El cobro en sala es siempre en efectivo (la API rechaza otros métodos): el método se deriva de
 * la moneda y nunca viaja una referencia bancaria. `hoyLocal` es el día LOCAL de la operación
 * (`toISOString()` lo desplazaría al día siguiente por la tarde en zonas como UTC-4).
 */
import {
  DECIMAL_STRING_REGEX,
  MENSAJE_FECHA_PAGO_FUTURA,
  MetodoPago,
  Moneda,
  TASA_STRING_REGEX,
} from '@guachafit/shared';
import type { FormatoNumeroVista } from './use-formato-numero';

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

/**
 * UX-08 (D1): la pantalla muestra el monto con formato venezolano (coma), así que el coach escribe
 * comas; el contrato de la API usa punto. Solo una coma decimal se cambia por punto; el resto del
 * texto se devuelve sin tocar (sin espacios de los extremos) para que la validación lo rechace.
 */
export function normalizarMontoCobro(texto: string): string {
  const limpio = texto.trim();
  return /^\d+,\d+$/.test(limpio) ? limpio.replace(',', '.') : limpio;
}

/**
 * UX-08 (D1): equivalente en USD de un cobro en efectivo, para el resumen previo al botón. Devuelve
 * el decimal con dos cifras, sin formato, o `null` si no se puede calcular: monto vacío, cero,
 * negativo, con coma o con más de 2 decimales, o, en bolívares, tasa ausente, cero o no numérica.
 * Sin tasa no se inventa una conversión. Es estricta: quien llama normaliza antes con
 * `normalizarMontoCobro`. La tasa se valida con su contrato de la API (hasta 4 decimales).
 */
export function equivalenteUsdCobro(
  monto: string,
  moneda: Moneda,
  tasa: string | null | undefined
): string | null {
  if (!DECIMAL_STRING_REGEX.test(monto) || !(Number(monto) > 0)) return null;
  if (moneda === Moneda.USD) return Number(monto).toFixed(2);
  if (!tasa || !TASA_STRING_REGEX.test(tasa) || !(Number(tasa) > 0)) return null;
  return (Number(monto) / Number(tasa)).toFixed(2);
}

/**
 * UX-08 (D1): resumen previo al botón de cobro, con lo que se registrará en su moneda y su
 * equivalente en USD con la tasa vigente. Sin conversión válida no afirma nada (`null`).
 */
export function resumenDeCobro(
  monto: string,
  moneda: Moneda,
  tasa: string | null | undefined,
  formatMonto: FormatoNumeroVista['formatMonto']
): string | null {
  const montoNormalizado = normalizarMontoCobro(monto);
  const usd = equivalenteUsdCobro(montoNormalizado, moneda, tasa);
  if (usd === null) return null;
  if (moneda === Moneda.USD) {
    return `Se registrarán ${formatMonto(montoNormalizado, 'USD', { conCodigo: true })}`;
  }
  return `Se registrarán ${formatMonto(montoNormalizado, 'VES')} (≈ ${formatMonto(usd, 'USD', { conCodigo: true })})`;
}
