/**
 * Indica si hay que evitar el movimiento. Se evalúa en el momento de la llamada, no al cargar el
 * módulo, para respetar cambios de preferencia durante la sesión.
 *
 * Sin `window` o sin `matchMedia` (SSR, entornos de prueba) se asume movimiento reducido: la
 * opción segura es no animar.
 */
export function movimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
