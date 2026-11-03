// @vitest-environment jsdom
/**
 * Specs de comportamiento UX-21: subida accesible de comprobante (`SubidaComprobantePago.tsx`).
 * Contratos C3 y C4: botón accesible para adjuntar, aria-describedby, aria-label en botón quitar y contenedor role="alert" para errores de archivo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SubidaComprobantePago, type SubidaComprobantePagoProps } from './SubidaComprobantePago';

function propsBase(overrides: Partial<SubidaComprobantePagoProps> = {}): SubidaComprobantePagoProps {
  const dummyInput = document.createElement('input');
  dummyInput.type = 'file';
  return {
    inputRef: { current: dummyInput },
    selectedFile: null,
    previewUrl: null,
    onArchivo: vi.fn(),
    onQuitar: vi.fn(),
    ...overrides,
  };
}

describe('SubidaComprobantePago · UX-21 (C3, C4)', () => {
  afterEach(() => {
    cleanup();
  });

  it('C4 · sin archivo seleccionado, la zona de adjuntar es un <button type="button"> localizable con getByRole', () => {
    render(<SubidaComprobantePago {...propsBase()} />);
    const botonAdjuntar = screen.getByRole('button', { name: /Toca para adjuntar foto o captura/i });

    expect(botonAdjuntar.tagName.toLowerCase()).toBe('button');
    expect(botonAdjuntar.getAttribute('type')).toBe('button');
  });

  it('C4 · al hacer clic en el botón de adjuntar se invoca inputRef.current?.click()', () => {
    const ref = { current: null as HTMLInputElement | null };

    render(<SubidaComprobantePago {...propsBase({ inputRef: ref })} />);
    const clickSpy = vi.spyOn(ref.current!, 'click');
    const botonAdjuntar = screen.getByRole('button', { name: /Toca para adjuntar foto o captura/i });
    fireEvent.click(botonAdjuntar);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('C4 · el botón de adjuntar tiene aria-describedby enlazado a un elemento existente en el DOM con el texto de ayuda/límite', () => {
    render(<SubidaComprobantePago {...propsBase()} />);
    const botonAdjuntar = screen.getByRole('button', { name: /Toca para adjuntar foto o captura/i });

    const describedById = botonAdjuntar.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();

    const ayudaEl = document.getElementById(describedById!);
    expect(ayudaEl).not.toBeNull();
    expect(ayudaEl?.textContent).toMatch(/máx\. 5 MB|JPG, PNG, WebP/i);
  });

  it('C4 · con archivo seleccionado, el botón de eliminar tiene aria-label="Quitar comprobante" y al hacer clic ejecuta onQuitar', () => {
    const onQuitar = vi.fn();
    const file = new File(['dummy'], 'recibo.jpg', { type: 'image/jpeg' });

    render(
      <SubidaComprobantePago
        {...propsBase({
          selectedFile: file,
          previewUrl: 'blob:preview-url',
          onQuitar,
        })}
      />
    );

    const botonQuitar = screen.getByRole('button', { name: 'Quitar comprobante' });
    expect(botonQuitar.getAttribute('aria-label')).toBe('Quitar comprobante');

    fireEvent.click(botonQuitar);
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });

  it('C3 · cuando hay errorArchivo, se renderiza un elemento con role="alert" con el mensaje de error', () => {
    render(
      <SubidaComprobantePago
        {...propsBase()}
        {...({ errorArchivo: 'El archivo excede el límite máximo de 5 MB.' } as any)}
      />
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('El archivo excede el límite máximo de 5 MB.');
  });
});
