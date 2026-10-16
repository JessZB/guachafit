/**
 * Lote E8 (RF-001) · helpers compartidos de los specs de página de entrenamiento.
 * Lo que `reps` y `rechazo` comparten de verdad: `clonar` (copia fresca de
 * fixtures) y `tarjetaDe` (tarjeta de un ejercicio en la lista completa).
 * Precedente: `components/entrenador/tamanos-texto.spec-helper.ts`.
 *
 * Este archivo NO es un spec: no termina en `.spec.ts(x)`, así que Vitest no lo
 * recoge (`vitest.config.ts` incluye solo `src slash ** slash *.spec.ts(x)`).
 */
import { expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { OutboxMutation } from '../../lib/offline-db';

/** Copia profunda de un fixture JSON plano (evita compartir referencias entre tests). */
export function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/**
 * Tarjeta de un ejercicio en la lista completa (nodo fresco por llamada).
 *
 * H-06: sin `closest('div[class*="rounded-…"]')`. La tarjeta de producción es un
 * `div` sin `article`/`section` ni `role` propio
 * (`EntrenamientoPage.tsx:2468-2471`), así que no hay ancla accesible de
 * contenedor: se sube desde el `heading` del ejercicio hasta el primer ancestro
 * que contenga un botón de marcar (`Marcar serie N como …`) o de corregir
 * (`Completada, toca para corregir`). Los ancestros intermedios (cabecera de la
 * tarjeta) no tienen esos botones, así que el primero que los tiene es la tarjeta.
 */
export function tarjetaDe(nombreEjercicio: string): HTMLElement {
  const encabezado = screen.getByRole('heading', { name: nombreEjercicio });
  let actual: HTMLElement | null = encabezado.parentElement;
  while (actual) {
    const hayMarcar =
      within(actual).queryAllByRole('button', { name: /Marcar serie \d+ como/ }).length > 0;
    const hayCorregir =
      within(actual).queryAllByRole('button', { name: /Completada, toca para corregir/ }).length >
      0;
    if (hayMarcar || hayCorregir) return actual;
    actual = actual.parentElement;
  }
  expect(actual).not.toBeNull();
  throw new Error(`tarjetaDe: no se encontró la tarjeta de "${nombreEjercicio}"`);
}

/**
 * Lote E9 (RF-001 §7.10): filas encoladas del PUT de series de una sesión, con
 * filtro opcional por serie y estado. Reúne las 6 copias del filtro que vivían
 * en `orden.interaccion` (×5) y `rechazo.interaccion` (×1): mismo comportamiento
 * que cada copia (endpoint exacto + `series[0]` del payload).
 */
export function filasSerieEncolada(
  filas: OutboxMutation[],
  sesionId: string,
  filtro: { serieId?: string; completada?: boolean } = {}
): OutboxMutation[] {
  return filas.filter((f) => {
    if (f.endpoint !== `/sesiones/${sesionId}/series`) return false;
    const primera = (
      f.payload as { series?: Array<{ serieId?: string; completada?: boolean }> }
    )?.series?.[0];
    if (filtro.serieId !== undefined && primera?.serieId !== filtro.serieId) return false;
    if (filtro.completada !== undefined && primera?.completada !== filtro.completada)
      return false;
    return true;
  });
}

/**
 * Lote E9: filas encoladas del POST `/finalizar` de una sesión (P3 del spec de
 * orden). Separa el caso de finalizar del de series para no mezclar endpoints.
 */
export function filasFinalizarEncoladas(
  filas: OutboxMutation[],
  sesionId: string
): OutboxMutation[] {
  return filas.filter((f) => f.endpoint === `/sesiones/${sesionId}/finalizar`);
}
