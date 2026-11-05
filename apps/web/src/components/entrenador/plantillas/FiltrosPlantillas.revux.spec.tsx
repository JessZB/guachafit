// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FiltrosPlantillas } from './FiltrosPlantillas';
import type { FiltroEstadoPlantilla } from '../../../lib/plantillas-filtros';

const CONTEOS_PRUEBA: Record<FiltroEstadoPlantilla, number> = {
  activas: 8,
  desactivadas: 3,
  todas: 11,
};

function renderFiltros(mostrarContador: boolean) {
  return render(
    <FiltrosPlantillas
      filtro="activas"
      conteos={CONTEOS_PRUEBA}
      onCambiarFiltro={vi.fn()}
      busqueda=""
      onCambiarBusqueda={vi.fn()}
      filtroNivel="todos"
      onCambiarNivel={vi.fn()}
      visiblesCount={8}
      mostrarContador={mostrarContador}
    />
  );
}

describe('FiltrosPlantillas · REVUX (G4)', () => {
  afterEach(() => {
    cleanup();
  });

  it('R13: mostrarContador=false oculta los dígitos de los chips; mostrarContador=true muestra el conteo de cada chip', () => {
    const { unmount } = renderFiltros(false);

    // Con mostrarContador=false, los chips no deben contener dígitos
    const botonActivasSin = screen.getByRole('button', { name: /^activas/i });
    const botonDesactivadasSin = screen.getByRole('button', { name: /^desactivadas/i });
    const botonTodasSin = screen.getByRole('button', { name: /^todas/i });

    expect(/\d/.test(botonActivasSin.textContent ?? '')).toBe(false);
    expect(/\d/.test(botonDesactivadasSin.textContent ?? '')).toBe(false);
    expect(/\d/.test(botonTodasSin.textContent ?? '')).toBe(false);

    unmount();

    // Con mostrarContador=true, cada chip muestra su conteo
    renderFiltros(true);

    const botonActivasCon = screen.getByRole('button', { name: /activas.*8/i });
    const botonDesactivadasCon = screen.getByRole('button', { name: /desactivadas.*3/i });
    const botonTodasCon = screen.getByRole('button', { name: /todas.*11/i });

    expect(botonActivasCon.textContent).toContain('8');
    expect(botonDesactivadasCon.textContent).toContain('3');
    expect(botonTodasCon.textContent).toContain('11');
  });
});
