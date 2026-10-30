// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato A3 · BandejaVaciaConciliacion.
 *
 * A3: BandejaVaciaConciliacion usa ui/EstadoVacio:
 *     - título "No hay pagos por validar"
 *     - detalle "Cuando un alumno reporte un pago, aparecerá aquí."
 *     - botón "Ver quién debe" que navega a /coach/cartera (con MemoryRouter y ruta stub)
 *     - el texto "Bandeja al Día" ya no existe.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BandejaVaciaConciliacion } from './BandejaVaciaConciliacion';

afterEach(() => {
  cleanup();
});

describe('Contrato A3 · BandejaVaciaConciliacion (UX-10)', () => {
  it('A3 · título "No hay pagos por validar", detalle, botón "Ver quién debe" con navegación a /coach/cartera y sin "Bandeja al Día"', () => {
    render(
      <MemoryRouter initialEntries={['/coach/conciliacion']}>
        <Routes>
          <Route path="/coach/conciliacion" element={<BandejaVaciaConciliacion />} />
          <Route path="/coach/cartera" element={<div>Vista Cartera Stub</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Título y detalle esperados
    expect(screen.getByText('No hay pagos por validar')).toBeTruthy();
    expect(
      screen.getByText('Cuando un alumno reporte un pago, aparecerá aquí.')
    ).toBeTruthy();

    // "Bandeja al Día" ya no existe
    expect(screen.queryByText(/Bandeja al Día/i)).toBeNull();

    // Botón "Ver quién debe" navega a /coach/cartera
    const boton = screen.getByRole('button', { name: 'Ver quién debe' });
    fireEvent.click(boton);

    expect(screen.getByText('Vista Cartera Stub')).toBeTruthy();
  });
});
