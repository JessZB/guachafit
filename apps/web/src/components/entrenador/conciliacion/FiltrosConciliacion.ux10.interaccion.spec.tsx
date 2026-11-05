// @vitest-environment happy-dom
/**
 * 01 · UX-10 · Contrato A2 · FiltrosConciliacion.
 *
 * A2: Línea de estado "Mostrando {visibles} de {enPagina} en esta página" sin contador de cola,
 *     el <p> no lleva la clase font-mono,
 *     y el chip de método no lleva la clase capitalize.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MetodoPago } from '@guachafit/shared';
import { FiltrosConciliacion } from './FiltrosConciliacion';

afterEach(() => {
  cleanup();
});

describe('Contrato A2 · FiltrosConciliacion (UX-10)', () => {
  it('A2 · línea de estado limpia sin cola, sin font-mono, y chip de método sin capitalize', () => {
    render(
      <FiltrosConciliacion
        metodosPresentes={[MetodoPago.PAGO_MOVIL]}
        filtroMetodo="todos"
        onCambiarMetodo={vi.fn()}
        busqueda=""
        onCambiarBusqueda={vi.fn()}
        visibles={2}
        enPagina={5}
        hayFiltroActivo={false}
        onLimpiar={vi.fn()}
      />
    );

    // 1. Línea de estado exacta: "Mostrando 2 de 5 en esta página", sin contador de cola
    const estado = screen.getByText('Mostrando 2 de 5 en esta página');
    expect(estado.textContent).not.toContain('transacciones en cola');
    expect(estado.textContent).not.toContain('transacción en cola');

    // 2. El <p> no lleva la clase font-mono
    expect(estado.className).not.toContain('font-mono');

    // 3. El chip de método no lleva la clase capitalize
    const chipTexto = screen.getByText(/pago/i);
    expect(chipTexto.className).not.toContain('capitalize');
    const contenedorChip = chipTexto.closest('button, span');
    expect(contenedorChip?.className).not.toContain('capitalize');
  });
});
