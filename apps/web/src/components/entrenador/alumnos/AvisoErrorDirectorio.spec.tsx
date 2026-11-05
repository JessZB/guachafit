// @vitest-environment happy-dom
/**
 * Lote "Mis alumnos" (F3) · spec del aviso inline de error del directorio.
 *
 * F3: si una recarga de la misma consulta falla con datos ya en pantalla, la
 * lista se mantiene y este aviso (`role="alert"`) ofrece reintentar. El bloque
 * de pantalla completa (`EstadoErrorDirectorio`) queda solo para el caso sin
 * datos previos (cubierto a nivel página por C12: error de carga con reintento
 * que recupera la lista).
 *
 * El aviso es presentacional: aquí se pincha que el mensaje viaja dentro del
 * `role="alert"` y que "Reintentar" llama al handler (que a nivel página es
 * `directorio.recargar` y vuelve a pedir la lista).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AvisoErrorDirectorio } from './AvisoErrorDirectorio';

afterEach(() => {
  cleanup();
});

describe('AvisoErrorDirectorio', () => {
  it('F3 · muestra el mensaje en un role="alert" y "Reintentar" llama al handler', () => {
    const onReintentar = vi.fn();
    render(<AvisoErrorDirectorio mensaje="Fallo de red simulado" onReintentar={onReintentar} />);

    const aviso = screen.getByRole('alert');
    expect(aviso.textContent).toContain('Fallo de red simulado');
    const reintentar = within(aviso).getByRole('button', { name: 'Reintentar' });
    expect(reintentar).toBeTruthy();

    expect(onReintentar).not.toHaveBeenCalled();
    fireEvent.click(reintentar);
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });
});
