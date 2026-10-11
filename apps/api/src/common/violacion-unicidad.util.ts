/**
 * Detector único de violaciones de unicidad de Postgres (código 23505).
 *
 * - `postgres` expone el índice en `constraint_name`; `pg`, en `constraint`.
 * - Se revisa también la cadena de `cause` (hasta 3 saltos) por si una capa intermedia envuelve
 *   el error original.
 * - Con `indice`, solo cuenta la violación de ese índice concreto; sin él, cualquier 23505.
 */
const CODIGO_PG_UNICIDAD = '23505';
const SALTOS_MAXIMOS_CAUSA = 3;

export function esViolacionUnicidad(error: unknown, indice?: string): boolean {
  let actual = error;
  for (let saltos = 0; saltos <= SALTOS_MAXIMOS_CAUSA; saltos++) {
    if (!actual || typeof actual !== 'object') return false;
    const candidato = actual as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      candidato.code === CODIGO_PG_UNICIDAD &&
      (indice === undefined || (candidato.constraint_name ?? candidato.constraint) === indice)
    ) {
      return true;
    }
    actual = candidato.cause;
  }
  return false;
}
