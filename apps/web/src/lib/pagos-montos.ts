/**
 * Cálculos puros del módulo `pagos` (fase B, prompt 54).
 *
 * Movidos tal cual desde `pages/atleta/PagosPage.tsx` (L379–399): derivados de
 * tasa y montos que la vista mostraba inline. Sin JSX, sin red, sin estado (R1).
 *
 * §6: D2/D6 — sin tasa real no se inventa conversión (`'—'` y etiquetas honestas
 * que distinguen "sin tasa configurada" de "no disponible").
 */
import { Moneda } from '@guachafit/shared';

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
  const montoNum = Number(montoOriginal) || 0;
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
