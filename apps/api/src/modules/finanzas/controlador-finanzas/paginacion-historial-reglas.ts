import { LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO } from '@guachafit/shared';

/**
 * Paginación del historial del alumno.
 * `txLimit` es opcional: ausente o no numérico pide todas las transacciones (`undefined`).
 * Con valor, el piso es 1 y el techo es 100. `txOffset` parte de 0 y nunca es negativo.
 */
export function parsearPaginacionHistorial(
  txLimit?: string,
  txOffset?: string,
): { limiteTx?: number; desplazamientoTx: number } {
  const limiteParseado = txLimit !== undefined ? parseInt(txLimit, 10) : NaN;
  const limiteTx = Number.isFinite(limiteParseado)
    ? Math.min(Math.max(limiteParseado, 1), LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO)
    : undefined;
  const desplazamientoTx = txOffset ? Math.max(parseInt(txOffset, 10) || 0, 0) : 0;

  return { limiteTx, desplazamientoTx };
}
