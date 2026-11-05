// @vitest-environment happy-dom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `EstadoError`.
 *
 * Consolida `PagosPage.tsx:573-586`, `AlumnosPage.tsx:764-777`,
 * `PlantillasPage.tsx:620-633` y `ProgresoPage.tsx:493-506` (patrón en ≥10 vistas).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoError } from './EstadoError';

function renderError() {
  const onReintentar = vi.fn();
  render(
    <EstadoError
      titulo="No se pudieron cargar las plantillas"
      mensaje="Revisa tu conexión e inténtalo de nuevo."
      onReintentar={onReintentar}
    />
  );
  return onReintentar;
}

afterEach(() => {
  cleanup();
});

describe('EstadoError', () => {
  it('expone rol alert con título y mensaje', () => {
    renderError();

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudieron cargar las plantillas');
    expect(alerta.textContent).toContain('Revisa tu conexión e inténtalo de nuevo.');
  });

  it('el botón Reintentar llama onReintentar al pulsar', () => {
    const onReintentar = renderError();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('acepta un texto de reintento personalizado', () => {
    render(<EstadoError mensaje="Falló la carga." onReintentar={() => undefined} textoReintentar="Cargar de nuevo" />);

    expect(screen.getByRole('button', { name: 'Cargar de nuevo' })).toBeTruthy();
  });

  it('usa el título por defecto cuando no se indica', () => {
    render(<EstadoError onReintentar={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'No pudimos cargar la información' })).toBeTruthy();
  });
});
