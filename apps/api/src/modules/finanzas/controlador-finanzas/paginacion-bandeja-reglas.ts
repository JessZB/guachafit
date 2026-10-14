import {
  LIMITE_BANDEJA_CONCILIACION_MAXIMO,
  LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
} from '@guachafit/shared';

/**
 * Paginación de la bandeja de conciliación.
 * Sin `limit` se piden 25; el techo es 100 y el piso es 1.
 * Sin `offset` se parte de 0; nunca es negativo.
 * Un valor ausente o no numérico conserva el valor por defecto.
 */
export function parsearPaginacionBandeja(
  limit?: string,
  offset?: string,
): { limite: number; desplazamiento: number } {
  const limite = limit
    ? Math.min(
        Math.max(parseInt(limit, 10) || LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO, 1),
        LIMITE_BANDEJA_CONCILIACION_MAXIMO,
      )
    : LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO;
  const desplazamiento = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;

  return { limite, desplazamiento };
}
