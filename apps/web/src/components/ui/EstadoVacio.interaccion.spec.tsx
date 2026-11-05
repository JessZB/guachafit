// @vitest-environment happy-dom
/**
 * Prompt 48 (fase C): spec de interacción del átomo `EstadoVacio`.
 *
 * Consolida `PlantillasPage.tsx:636-650`, `AlumnosPage.tsx:791-823` y
 * `PagosPage.tsx:589-598` (patrón `border-dashed` en 20+ sitios).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dumbbell } from 'lucide-react';
import { EstadoVacio } from './EstadoVacio';

afterEach(() => {
  cleanup();
});

describe('EstadoVacio', () => {
  it('renderiza título y detalle honestos', () => {
    render(<EstadoVacio titulo="Sin resultados" detalle="Ninguna coincide con tu búsqueda." />);

    expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeTruthy();
    expect(screen.getByText('Ninguna coincide con tu búsqueda.')).toBeTruthy();
  });

  it('sin acción no muestra ningún botón', () => {
    render(<EstadoVacio titulo="Sin resultados" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('la acción llama onAccion al pulsar', () => {
    const onAccion = vi.fn();
    render(
      <EstadoVacio
        titulo="Sin resultados"
        accion={{ texto: 'Limpiar filtros', onAccion }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onAccion).toHaveBeenCalledTimes(1);
  });

  it('usa el icono indicado y lo oculta a lectores de pantalla', () => {
    const { container } = render(<EstadoVacio titulo="Sin plantillas" icono={Dumbbell} />);

    const icono = container.querySelector('svg');
    expect(icono).not.toBeNull();
    expect(icono?.getAttribute('aria-hidden')).toBe('true');
  });
});
