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
