import { movimientoReducido } from './movimiento-reducido';

/**
 * Indica si la navegación puede usar View Transitions (mejora progresiva): el navegador expone
 * `document.startViewTransition` y la persona no pidió movimiento reducido.
 *
 * Sin estado ni efectos: se evalúa en cada render para reflejar la preferencia vigente. El
 * resultado se pasa a `viewTransition` de `Link`/`NavLink`/`navigate`; si es `false` la navegación
 * es la normal y la entrada de la vista usa el fundido de respaldo.
 */
export function useTransicionVista(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !movimientoReducido()
  );
}
