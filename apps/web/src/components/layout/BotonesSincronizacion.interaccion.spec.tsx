// @vitest-environment happy-dom
/**
 * 01 · UX-04 · Specs de interacción para BotonesSincronizacion (Contrato C).
 *
 * Requisitos:
 * - BotonSincronizacion y BotonIncidenciasSync componentes presentacionales con 44px (min-h-11, min-w-11, justify-center).
 * - Sin py-1.
 * - Icono h-4 con aria-hidden="true".
 * - Contador visible en móvil sin clase hidden.
 * - BotonIncidenciasSync no renderiza nada cuando fallidos=0 y rechazados=0.
 * - Textos de accesibilidad precisos con "Toca" en lugar de "Clic".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  BotonSincronizacion,
  BotonIncidenciasSync,
} from './BotonesSincronizacion';

afterEach(() => {
  cleanup();
});

function clases(elemento: Element): string[] {
  return (elemento.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('BotonSincronizacion · Contrato C', () => {
  it('1. Es un button con min-h-11, min-w-11 y justify-center; no incluye py-1', () => {
    render(
      <BotonSincronizacion
        enLinea={true}
        pendientes={0}
        sincronizando={false}
        onSincronizar={() => {}}
      />
    );

    const boton = screen.getByRole('button');
    const tokens = clases(boton);
    expect(tokens).toContain('min-h-11');
    expect(tokens).toContain('min-w-11');
    expect(tokens).toContain('justify-center');
    expect(tokens).not.toContain('py-1');
  });

  describe('2. Nombre accesible según estado de conexión y pendientes', () => {
    it.each([
      [true, 1, 'Sincronizar 1 cambio pendiente'],
      [true, 3, 'Sincronizar 3 cambios pendientes'],
      [true, 0, 'Sincronizar cambios pendientes'],
      [false, 0, 'Sin conexión. La sincronización se reanudará al recuperar señal'],
      [false, 2, 'Sin conexión. La sincronización se reanudará al recuperar señal'],
    ])('enLinea=%s, pendientes=%d -> %s', (enLinea, pendientes, nombreEsperado) => {
      render(
        <BotonSincronizacion
          enLinea={enLinea}
          pendientes={pendientes}
          sincronizando={false}
          onSincronizar={() => {}}
        />
      );

      const boton = screen.getByRole('button', { name: nombreEsperado });
      expect(boton).toBeTruthy();
    });
  });

  it('3. Número visible en el móvil: con pendientes=3 el texto "3" está en un elemento sin clase hidden', () => {
    render(
      <BotonSincronizacion
        enLinea={true}
        pendientes={3}
        sincronizando={false}
        onSincronizar={() => {}}
      />
    );

    const elementoNumero = screen.getByText('3');
    expect(elementoNumero).toBeTruthy();
    expect(clases(elementoNumero)).not.toContain('hidden');
  });

  it('4. Pulsar el botón llama a onSincronizar una vez', () => {
    const onSincronizar = vi.fn();
    render(
      <BotonSincronizacion
        enLinea={true}
        pendientes={2}
        sincronizando={false}
        onSincronizar={onSincronizar}
      />
    );

    const boton = screen.getByRole('button');
    fireEvent.click(boton);
    expect(onSincronizar).toHaveBeenCalledTimes(1);
  });

  it('5. El icono es un svg con aria-hidden="true" y la clase h-4 (16px, no 12px)', () => {
    const { container } = render(
      <BotonSincronizacion
        enLinea={true}
        pendientes={0}
        sincronizando={false}
        onSincronizar={() => {}}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    const tokens = clases(svg!);
    expect(tokens).toContain('h-4');
    expect(tokens).not.toContain('h-3');
  });
});

describe('BotonIncidenciasSync · Contrato C', () => {
  it('1. Con fallidos=0 y rechazados=0 no renderiza nada', () => {
    const { container } = render(
      <BotonIncidenciasSync fallidos={0} rechazados={0} onAbrir={() => {}} />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('2. Con incidencias, es un button con min-h-11, min-w-11 y justify-center, y su número visible sin hidden', () => {
    render(
      <BotonIncidenciasSync fallidos={1} rechazados={2} onAbrir={() => {}} />
    );

    const boton = screen.getByRole('button');
    const tokensBoton = clases(boton);
    expect(tokensBoton).toContain('min-h-11');
    expect(tokensBoton).toContain('min-w-11');
    expect(tokensBoton).toContain('justify-center');

    const elementoNumero = screen.getByText('3');
    expect(elementoNumero).toBeTruthy();
    expect(clases(elementoNumero)).not.toContain('hidden');
  });

  describe('3. Nombre accesible usa "Toca" (no "Clic") y redacta correctamente plurales/singulares', () => {
    it.each([
      [1, 2, '2 cambios rechazados y 1 fallido. Toca para revisar.'],
      [0, 1, '1 cambio rechazado. Toca para revisar.'],
      [3, 0, '3 cambios fallidos. Toca para revisar.'],
    ])('fallidos=%d, rechazados=%d -> %s', (fallidos, rechazados, nombreEsperado) => {
      render(
        <BotonIncidenciasSync
          fallidos={fallidos}
          rechazados={rechazados}
          onAbrir={() => {}}
        />
      );

      const boton = screen.getByRole('button', { name: nombreEsperado });
      expect(boton).toBeTruthy();
      expect(boton.getAttribute('aria-label') ?? boton.getAttribute('title')).not.toContain('Clic');
    });
  });

  it('4. Pulsar el botón de incidencias llama a onAbrir una vez', () => {
    const onAbrir = vi.fn();
    render(
      <BotonIncidenciasSync fallidos={1} rechazados={0} onAbrir={onAbrir} />
    );

    const boton = screen.getByRole('button');
    fireEvent.click(boton);
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });
});
