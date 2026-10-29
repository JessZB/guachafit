// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AvisoErrorRecarga } from './AvisoErrorRecarga';
import { AvisoErrorDirectorio } from '../entrenador/alumnos/AvisoErrorDirectorio';

afterEach(() => {
  cleanup();
});

describe('AvisoErrorRecarga (Contrato A)', () => {
  it('A1 · tiene role="alert", muestra mensaje y un button "Reintentar" con min-h-11 que llama a onReintentar', () => {
    const onReintentar = vi.fn();
    render(<AvisoErrorRecarga mensaje="Fallo de red al recargar" onReintentar={onReintentar} />);

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Fallo de red al recargar');

    const boton = within(alerta).getByRole('button', { name: 'Reintentar' });
    expect(boton).toBeTruthy();
    const clasesBoton = (boton.getAttribute('class') ?? '').split(/\s+/);
    expect(clasesBoton).toContain('min-h-11');

    expect(onReintentar).not.toHaveBeenCalled();
    fireEvent.click(boton);
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('A2 · compatibilidad: AvisoErrorDirectorio es el mismo componente (re-export exacto)', () => {
    expect(AvisoErrorDirectorio).toBe(AvisoErrorRecarga);
  });
});
