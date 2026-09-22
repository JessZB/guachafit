/**
 * Ola 4 · U3b: diálogo accesible compartido (Escape + trampa de foco + foco inicial + restore).
 *
 * El repo tiene ~18 overlays con `role="dialog"` repartidos por pantalla; antes de este hook cada
 * uno repetía (o directamente omitía) el cierre con Escape, la trampa de Tab y la devolución del
 * foco al disparador. Este contrato es la única fuente de verdad de ese comportamiento.
 *
 * Contrato:
 * - El consumidor llama al hook SIEMPRE (nivel superior del componente) y adjunta el `ref`
 *   devuelto al contenedor del diálogo. El contenedor debe llevar `tabIndex={-1}` para poder
 *   recibir el foco cuando no haya ningún elemento focusable dentro.
 * - `abierto` (por defecto `true`) gobierna el ciclo: al activarse guarda el foco previo, enfoca
 *   el primer elemento focusable (o el contenedor); al desactivarse o desmontarse devuelve el foco
 *   al elemento que lo tenía antes de abrir.
 * - `onCerrar` se invoca al presionar Escape (salvo `cerrarConEscape: false`).
 * - Tab y Shift+Tab quedan atrapados en el contenedor: el ciclo es puro y se resuelve con
 *   `resolverTeclaDialogo`, exportada para poder testearlo sin DOM.
 * - Si hay varios diálogos montados a la vez, solo el último abierto (tope de pila) responde a
 *   Escape y a la trampa; los de abajo quedan inertes.
 *
 * La decisión de teclado (`resolverTeclaDialogo`) y el catálogo de focusables
 * (`obtenerElementosFocusables`) están separados del hook para poder testearse en Node sin jsdom,
 * igual que el resto de la suite de `apps/web`.
 */
import { useEffect, useRef, type RefObject } from 'react';

/** Selector de elementos capaces de recibir foco por teclado (excluye `tabindex="-1"`). */
export const SELECTOR_FOCUSABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Acción que la lógica pura decide para una tecla dentro de un diálogo. */
export type AccionTeclaDialogo =
  | { tipo: 'cerrar' }
  | { tipo: 'enfocar'; indice: number }
  | { tipo: 'enfocar-contenedor' }
  | { tipo: 'ignorar' };

/**
 * Decide qué hacer con una tecla presionada dentro de un diálogo, sin tocar el DOM.
 *
 * - Escape → cerrar (si `permitirEscape`).
 * - Tab/Shift+Tab → recicla el foco al extremo opuesto cuando toca salir del contenedor; en los
 *   movimientos intermedios devuelve `ignorar` para que el navegador mueva el foco normalmente.
 * - Sin focusables → `enfocar-contenedor` (el contenedor debe tener `tabIndex={-1}`).
 * - Cualquier otra tecla → `ignorar`.
 *
 * @param posicionActiva Índice del elemento enfocado dentro de los focusables, o -1 si el foco
 *   está fuera del contenedor (incluido el propio contenedor sin elementos internos).
 */
export function resolverTeclaDialogo(
  tecla: string,
  shiftKey: boolean,
  posicionActiva: number,
  totalFocusables: number,
  permitirEscape = true
): AccionTeclaDialogo {
  if (tecla === 'Escape') {
    return permitirEscape ? { tipo: 'cerrar' } : { tipo: 'ignorar' };
  }
  if (tecla !== 'Tab') return { tipo: 'ignorar' };
  if (totalFocusables <= 0) return { tipo: 'enfocar-contenedor' };

  const dentro = posicionActiva >= 0 && posicionActiva < totalFocusables;
  if (shiftKey) {
    // Shift+Tab desde el primero (o desde fuera) recicla al último.
    if (!dentro || posicionActiva === 0) {
      return { tipo: 'enfocar', indice: totalFocusables - 1 };
    }
    return { tipo: 'ignorar' };
  }
  // Tab desde el último (o desde fuera) recicla al primero.
  if (!dentro || posicionActiva === totalFocusables - 1) {
    return { tipo: 'enfocar', indice: 0 };
  }
  return { tipo: 'ignorar' };
}

/** ¿El elemento puede recibir foco de teclado y además es visible? */
export function esElementoFocusable(elemento: HTMLElement): boolean {
  if (!elemento.isConnected || elemento.hidden) return false;
  if (elemento.closest('[hidden], [aria-hidden="true"]')) return false;
  const estilos = window.getComputedStyle(elemento);
  return estilos.display !== 'none' && estilos.visibility !== 'hidden';
}

/** Focusables visibles del contenedor, en el mismo orden en que Tab los recorrería. */
export function obtenerElementosFocusables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLES)).filter(
    esElementoFocusable
  );
}

/**
 * Pila de diálogos abiertos (el último es el tope). Permite que un diálogo anidado no compita por
 * Escape/Tab con el que lo contiene.
 */
const pilaDialogos: HTMLElement[] = [];

export interface OpcionesDialogoAccesible {
  /** `false` desactiva el ciclo completo (p. ej. un panel que se renderiza siempre). */
  abierto?: boolean;
  /** Se invoca al presionar Escape. */
  onCerrar?: () => void;
  /** `false` desactiva el cierre con Escape (por defecto `true`). */
  cerrarConEscape?: boolean;
  /** `false` deja el foco donde estaba al abrir (por defecto se enfoca el primer focusable). */
  enfocarAlAbrir?: boolean;
}

/**
 * Hook de diálogo accesible. Devuelve el `ref` que debe adjuntarse al contenedor con
 * `role="dialog"` y `tabIndex={-1}`.
 */
export function useDialogoAccesible<T extends HTMLElement = HTMLDivElement>(
  opciones: OpcionesDialogoAccesible = {}
): RefObject<T | null> {
  const { abierto = true, onCerrar, cerrarConEscape = true, enfocarAlAbrir = true } = opciones;
  const contenedorRef = useRef<T | null>(null);
  const cerrarRef = useRef(onCerrar);
  const enfocarAlAbrirRef = useRef(enfocarAlAbrir);

  useEffect(() => {
    cerrarRef.current = onCerrar;
    enfocarAlAbrirRef.current = enfocarAlAbrir;
  });

  useEffect(() => {
    if (!abierto) return;
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    // El foco previo es el disparador (botón de la tarjeta, fila de tabla...): al cerrar se
    // devuelve ahí para no perder el contexto de navegación.
    const focoPrevio =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    pilaDialogos.push(contenedor);
    if (enfocarAlAbrirRef.current) {
      const [primero] = obtenerElementosFocusables(contenedor);
      (primero ?? contenedor).focus({ preventScroll: true });
    }

    const alPresionarTecla = (evento: KeyboardEvent) => {
      // Solo el diálogo del tope responde: un modal anidado nunca cierra al de abajo.
      if (pilaDialogos[pilaDialogos.length - 1] !== contenedor) return;

      const focusables = obtenerElementosFocusables(contenedor);
      const activo =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const posicionActiva = activo ? focusables.indexOf(activo) : -1;
      const accion = resolverTeclaDialogo(
        evento.key,
        evento.shiftKey,
        posicionActiva,
        focusables.length,
        cerrarConEscape
      );

      if (accion.tipo === 'cerrar') {
        evento.preventDefault();
        evento.stopPropagation();
        cerrarRef.current?.();
        return;
      }
      if (accion.tipo === 'enfocar-contenedor') {
        evento.preventDefault();
        contenedor.focus({ preventScroll: true });
        return;
      }
      if (accion.tipo === 'enfocar') {
        evento.preventDefault();
        focusables[accion.indice]?.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', alPresionarTecla);
    return () => {
      document.removeEventListener('keydown', alPresionarTecla);
      const indice = pilaDialogos.lastIndexOf(contenedor);
      if (indice >= 0) pilaDialogos.splice(indice, 1);
      if (focoPrevio?.isConnected) focoPrevio.focus({ preventScroll: true });
    };
  }, [abierto, cerrarConEscape]);

  return contenedorRef;
}
