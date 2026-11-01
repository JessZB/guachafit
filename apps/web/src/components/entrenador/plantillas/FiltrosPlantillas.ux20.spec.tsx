// @vitest-environment jsdom
/**
 * UX-20 · Contrato C3 (CFG-22): FiltrosPlantillas (contador con aria-live).
 *
 * Contrato:
 * - En FiltrosPlantillas, el contador deja de ser «Mostrando N de M…».
 * - Debe vivir en un elemento con aria-live="polite" cuyo texto es:
 *   {visiblesCount} plantilla / {visiblesCount} plantillas
 *   (singular si es 1, plural en otro caso; 0 → «0 plantillas»).
 * - Prop mostrarContador sigue igual (si es false no se renderiza).
 * - Test: render con visiblesCount 1 y 3, localiza el elemento por
 *   container.querySelector('[aria-live="polite"]') y comprueba el texto;
 *   con mostrarContador=false no existe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FiltrosPlantillas } from './FiltrosPlantillas';
import type { FiltroEstadoPlantilla } from '../../../lib/plantillas-filtros';

const CONTEOS_BASE: Record<FiltroEstadoPlantilla, number> = {
  activas: 5,
  desactivadas: 2,
  todas: 7,
};

function renderFiltros(visiblesCount: number, mostrarContador = true) {
  return render(
    <FiltrosPlantillas
      filtro="activas"
      conteos={CONTEOS_BASE}
      onCambiarFiltro={vi.fn()}
      busqueda=""
      onCambiarBusqueda={vi.fn()}
      filtroNivel="todos"
      onCambiarNivel={vi.fn()}
      visiblesCount={visiblesCount}
      mostrarContador={mostrarContador}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('FiltrosPlantillas · contrato C3 (CFG-22)', () => {
  it('C3.1 · con visiblesCount=1 el elemento aria-live="polite" muestra "1 plantilla" (singular)', () => {
    const { container } = renderFiltros(1, true);
    const elemento = container.querySelector('[aria-live="polite"]');
    expect(elemento).not.toBeNull();
    expect(elemento?.textContent?.trim()).toBe('1 plantilla');
  });

  it('C3.2 · con visiblesCount=3 el elemento aria-live="polite" muestra "3 plantillas" (plural)', () => {
    const { container } = renderFiltros(3, true);
    const elemento = container.querySelector('[aria-live="polite"]');
    expect(elemento).not.toBeNull();
    expect(elemento?.textContent?.trim()).toBe('3 plantillas');
  });

  it('C3.3 · con visiblesCount=0 el elemento aria-live="polite" muestra "0 plantillas"', () => {
    const { container } = renderFiltros(0, true);
    const elemento = container.querySelector('[aria-live="polite"]');
    expect(elemento).not.toBeNull();
    expect(elemento?.textContent?.trim()).toBe('0 plantillas');
  });

  it('C3.4 · con mostrarContador=false el elemento aria-live="polite" no existe', () => {
    const { container } = renderFiltros(3, false);
    const elemento = container.querySelector('[aria-live="polite"]');
    expect(elemento).toBeNull();
  });
});
