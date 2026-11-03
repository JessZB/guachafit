/**
 * Cálculos puros del módulo `pagos` (fase B, prompt 54; UX-21 ALU-01 D8).
 *
 * Movidos tal cual desde `pages/atleta/PagosPage.tsx` (L379–399): derivados de
 * tasa y montos que la vista mostraba inline. Sin JSX, sin red, sin estado (R1).
 *
 * §6: D2/D6 — sin tasa real no se inventa conversión (`'—'` y etiquetas honestas
 * que distinguen "sin tasa configurada" de "no disponible").
 */
import { MetodoPago, Moneda } from '@guachafit/shared';

export const MENSAJE_MONTO_PAGO_INVALIDO = 'Ingresa un monto válido mayor a 0.';

export const MENSAJE_REFERENCIA_PAGO_REQUERIDA =
  'Indica la referencia bancaria de tu pago (mínimo 4 caracteres).';
export const MENSAJE_REFERENCIA_PAGO_INVALIDA = 'La referencia debe tener entre 4 y 64 caracteres.';
/** Motivo de respaldo honesto: el entrenador rechazó el pago pero no dejó texto (no se inventa uno). */
export const TEXTO_RECHAZO_SIN_MOTIVO = 'Tu entrenador rechazó este pago.';

/** Comprobante del pago: imagen JPG, PNG o WebP de hasta 5 MB. `null` si es válida, o el mensaje. */
export function validarArchivoComprobante(archivo: { type: string; size: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return 'Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.';
  }
  return archivo.size > 5 * 1024 * 1024 ? 'El archivo excede el límite máximo de 5 MB.' : null;
}

/** D11: moneda en la que se paga habitualmente con cada método (el alumno puede cambiarla a mano). */
export function monedaSugeridaPorMetodo(metodo: MetodoPago): Moneda {
  switch (metodo) {
    case MetodoPago.ZELLE:
    case MetodoPago.BINANCE_USDT:
    case MetodoPago.EFECTIVO_USD:
      return Moneda.USD;
    default:
      return Moneda.VES;
  }
}

/** D11: aviso discreto (no bloquea) cuando la moneda elegida no es la habitual del método. */
export function avisoMonedaMetodo(metodo: MetodoPago, moneda: Moneda): string | null {
  const sugerida = monedaSugeridaPorMetodo(metodo);
  if (moneda === sugerida) return null;
  const habitual = sugerida === Moneda.USD ? 'dólares' : 'bolívares';
  return `Este método suele pagarse en ${habitual}. Revisa que la moneda y el monto sean los de tu comprobante.`;
}

/**
 * Referencia bancaria del reporte (misma regla que la API: 4 a 64 caracteres). En efectivo es
 * opcional, pero si se escribe debe cumplir el largo. Devuelve el mensaje de error o `null`.
 */
export function validarReferenciaPago(metodo: MetodoPago, referencia: string): string | null {
  const limpia = (referencia ?? '').trim();
  if (limpia === '') {
    const esEfectivo = metodo === MetodoPago.EFECTIVO_USD || metodo === MetodoPago.EFECTIVO_VES;
    return esEfectivo ? null : MENSAJE_REFERENCIA_PAGO_REQUERIDA;
  }
  return limpia.length < 4 || limpia.length > 64 ? MENSAJE_REFERENCIA_PAGO_INVALIDA : null;
}

/**
 * C1 (ALU-01, D8): valida montos mayores a 0 con hasta dos decimales (punto o coma).
 * Devuelve `null` si el monto es válido o `MENSAJE_MONTO_PAGO_INVALIDO` si no lo es.
 */
export function validarMontoPago(valor: string): string | null {
  const limpio = (valor ?? '').trim();
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(limpio)) {
    return MENSAJE_MONTO_PAGO_INVALIDO;
  }
  const conPunto = limpio.replace(',', '.');
  const num = Number(conPunto);
  if (!Number.isFinite(num) || num <= 0) {
    return MENSAJE_MONTO_PAGO_INVALIDO;
  }
  return null;
}

/**
 * C1 (ALU-01, D8): normaliza coma a punto y formatea a 2 decimales si es un número válido > 0.
 */
export function normalizarMontoPago(valor: string): string {
  const limpio = (valor ?? '').trim();
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(limpio)) {
    return limpio;
  }
  const conPunto = limpio.replace(',', '.');
  const num = Number(conPunto);
  if (!Number.isFinite(num) || num <= 0) {
    return limpio;
  }
  return num.toFixed(2);
}

/** Tasa efectiva como número (`0` cuando falta o no es numérica; nunca `NaN`). */
export function tasaEfectivaNumerica(tasaEfectiva?: string | null): number {
  return Number(tasaEfectiva || '0') || 0;
}

/**
 * D6: etiqueta honesta cuando no hay tasa real. Distingue el dato real de la API
 * ("sin tasa configurada") de un fallo de consulta ("no disponible").
 * Devuelve `null` cuando sí hay tasa (nada que declarar).
 */
export function etiquetaFaltaTasa(
  tasaEfectiva?: string | null,
  huboErrorDeTasa = false
): string | null {
  if (tasaEfectiva) return null;
  return huboErrorDeTasa ? 'Tasa no disponible' : 'Sin tasa configurada';
}

/**
 * Operación que SÍ requiere tasa (pago en VES con dato confirmado de ausencia):
 * se bloquea con mensaje claro en vez de dejar que el usuario llene el formulario
 * para recibir un error tardío.
 */
export function pagoVesBloqueadoPorFaltaTasa(
  moneda: Moneda,
  tasaEfectiva?: string | null,
  huboErrorDeTasa = false
): boolean {
  return moneda === Moneda.VES && !tasaEfectiva && !huboErrorDeTasa;
}

/** Contravalor en USD del monto a reportar (`'—'` en VES sin tasa; nunca inventado). */
export function contravalorUsd(
  moneda: Moneda,
  montoOriginal: string,
  tasaEfectivaNum: number
): string {
  const montoNum = Number((montoOriginal ?? '').trim().replace(',', '.')) || 0;
  if (moneda === Moneda.VES) {
    return tasaEfectivaNum > 0 ? (montoNum / tasaEfectivaNum).toFixed(2) : '—';
  }
  return montoNum.toFixed(2);
}

/** Saldo pendiente proyectado en bolívares (`'—'` sin tasa vigente). */
export function saldoVesProyectado(
  saldoPendienteUsd: string | null | undefined,
  tasaEfectivaNum: number
): string {
  return tasaEfectivaNum > 0
    ? (Number(saldoPendienteUsd || 0) * tasaEfectivaNum).toFixed(2)
    : '—';
}

export const MENSAJE_ERROR_RED_AMBIGUO_PAGO =
  'No se pudo confirmar el envío; revisa tu historial antes de repetirlo.';

/**
 * Genera una clave de idempotencia única (UUID v4 o fallback pseudo-aleatorio con longitud >= 8)
 * para identificar un intento de reporte de pago del alumno (D8 / ALU-07).
 */
export function generarClaveIdempotenciaPago(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pago-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Distingue si el fallo al enviar el POST de reporte de pago dejó el estado en duda
 * (corte de red, fallo de fetch o tiempo de espera agotado) frente a un rechazo HTTP
 * determinista del servidor (ALU-07c).
 */
export function esErrorEnvioPagoAmbiguo(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if (err instanceof TypeError) return true;
  const status = (err as { status?: unknown }).status;
  if (status === 502 || status === 503 || status === 504) return true;
  const nombre = (err as { name?: unknown }).name;
  return (
    nombre === 'TypeError' ||
    nombre === 'ErrorDeConexion' ||
    nombre === 'ErrorTiempoAgotado' ||
    nombre === 'AbortError' ||
    nombre === 'TimeoutError'
  );
}

