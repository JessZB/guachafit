/**
 * WU22: helper de pluralización para copy visible.
 *
 * Regla (español): el singular se usa SOLO con exactamente 1; el 0 va en plural
 * ("0 ejercicios"), que es la forma correcta. Devuelve el número incluido para
 * poder usarlo directo en JSX: `pluralizar(1, 'pago', 'pagos')` → "1 pago".
 */
export function pluralizar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
