/**
 * Ola 4 · U3b: patrón APG de pestañas (tabs) con roving tabindex, flechas, Home/End y activación.
 *
 * Antes de este módulo los tablists del repo eran `role="tab"` sueltos: sin flechas, sin ids
 * enlazados y sin `role="tabpanel"`. El contrato replica el patrón "automatic activation" de la
 * APG: al mover el foco con flechas también se activa la pestaña destino (que es lo que ya hacía
 * el clic), y Enter/Space siguen funcionando porque cada tab es un `<button>`.
 *
 * Contrato de uso:
 * - El contenedor usa `{...propsTablist}` (ya incluye `role="tablist"`, `aria-orientation` y el
 *   manejo de flechas). El `aria-label` se mantiene en el consumidor.
 * - Cada botón usa `{...propsTab('clave')}` y conserva su className; el hook aporta el roving
 *   `tabIndex` (0 en la activa, -1 en el resto), `aria-selected`, `id`, `aria-controls` y `onClick`.
 * - El panel de la pestaña activa usa `{...propsPanel('clave')}`.
 * - `resolverFocoTabs` es pura y se testea sin DOM.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export type OrientacionTabs = 'horizontal' | 'vertical';

/** Ids deterministas de tab/panel a partir de la clave (contrato `aria-controls`/`aria-labelledby`). */
export function idsTabs(idBase: string, clave: string): { tab: string; panel: string } {
  return { tab: `${idBase}-tab-${clave}`, panel: `${idBase}-panel-${clave}` };
}

/**
 * Índice de la pestaña que debe recibir el foco para una tecla de navegación, o `null` si la
 * tecla no navega el tablist. Implementa APG: flechas según orientación, Home al primero y End
 * al último, con ciclo en los extremos.
 */
export function resolverFocoTabs(
  tecla: string,
  indiceActual: number,
  total: number,
  orientacion: OrientacionTabs = 'horizontal'
): number | null {
  if (total <= 0) return null;
  const base = indiceActual >= 0 && indiceActual < total ? indiceActual : 0;
  const anterior = orientacion === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const siguiente = orientacion === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

  if (tecla === anterior) return (base - 1 + total) % total;
  if (tecla === siguiente) return (base + 1) % total;
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return total - 1;
  return null;
}

export interface PropsTablist {
  role: 'tablist';
  'aria-orientation': OrientacionTabs;
  onKeyDown: (evento: ReactKeyboardEvent<HTMLElement>) => void;
}

export interface PropsTab {
  role: 'tab';
  id: string;
  'aria-controls': string;
  'aria-selected': boolean;
  tabIndex: number;
  onClick: () => void;
}

export interface PropsPanel {
  role: 'tabpanel';
  id: string;
  'aria-labelledby': string;
}

export interface OpcionesTabsAccesibles<T extends string> {
  /** Claves de las pestañas en orden visual. */
  claves: readonly T[];
  /** Clave activa. */
  activa: T;
  /** Cambia la pestaña activa (clic, flechas y Enter/Space nativo del botón). */
  onActivar: (clave: T) => void;
  /** Base única para los ids `id`/`aria-controls`/`aria-labelledby`. */
  idBase: string;
  /** Orientación del tablist (por defecto `horizontal`). */
  orientacion?: OrientacionTabs;
}

export interface ResultadoTabsAccesibles<T extends string> {
  propsTablist: PropsTablist;
  propsTab: (clave: T) => PropsTab;
  propsPanel: (clave: T) => PropsPanel;
  idTab: (clave: T) => string;
  idPanel: (clave: T) => string;
}

/**
 * Hook de tabs accesibles. No usa estado propio: todo deriva de `activa` y de los ids del DOM,
 * de modo que el consumidor sigue siendo la única fuente de verdad (URL o useState).
 */
export function useTabsAccesibles<T extends string>({
  claves,
  activa,
  onActivar,
  idBase,
  orientacion = 'horizontal',
}: OpcionesTabsAccesibles<T>): ResultadoTabsAccesibles<T> {
  const idTab = (clave: T) => idsTabs(idBase, clave).tab;
  const idPanel = (clave: T) => idsTabs(idBase, clave).panel;

  const manejarTecladoTablist = (evento: ReactKeyboardEvent<HTMLElement>) => {
    // En navegador el foco vive en el botón del tab (aunque el evento venga de un span interno).
    // Sin DOM (tests/SSR) se navega desde la pestaña activa.
    let indiceActual = claves.indexOf(activa);
    if (typeof document !== 'undefined') {
      const idActivo = document.activeElement?.id;
      const indiceEnfocado = claves.findIndex((clave) => idTab(clave) === idActivo);
      if (indiceEnfocado >= 0) indiceActual = indiceEnfocado;
    }

    const destino = resolverFocoTabs(evento.key, indiceActual, claves.length, orientacion);
    if (destino === null) return;
    const claveDestino = claves[destino];
    if (!claveDestino) return;

    evento.preventDefault();
    if (typeof document !== 'undefined') {
      document.getElementById(idTab(claveDestino))?.focus();
    }
    onActivar(claveDestino);
  };

  const indiceActiva = Math.max(0, claves.indexOf(activa));

  const propsTab = (clave: T): PropsTab => ({
    role: 'tab',
    id: idTab(clave),
    'aria-controls': idPanel(clave),
    'aria-selected': clave === activa,
    // Roving tabindex: solo la pestaña activa participa del orden natural de Tab.
    tabIndex: claves.indexOf(clave) === indiceActiva ? 0 : -1,
    onClick: () => onActivar(clave),
  });

  const propsPanel = (clave: T): PropsPanel => ({
    role: 'tabpanel',
    id: idPanel(clave),
    'aria-labelledby': idTab(clave),
  });

  return {
    propsTablist: { role: 'tablist', 'aria-orientation': orientacion, onKeyDown: manejarTecladoTablist },
    propsTab,
    propsPanel,
    idTab,
    idPanel,
  };
}
