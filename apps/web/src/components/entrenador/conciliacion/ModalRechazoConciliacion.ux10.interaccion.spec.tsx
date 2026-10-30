// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato B5 · ModalRechazoConciliacion.
 *
 * B5: El título es "Rechazar pago" y el botón "Confirmar rechazo".
 *     No existen "Rechazar Transacción" ni "Confirmar Rechazo".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModalRechazoConciliacion } from './ModalRechazoConciliacion';

afterEach(() => {
  cleanup();
});

describe('Contrato B5 · ModalRechazoConciliacion (UX-10)', () => {
  it('B5 · título "Rechazar pago" y botón "Confirmar rechazo", sin nombres antiguos en mayúsculas de título', () => {
    render(
      <ModalRechazoConciliacion
        alumno="Carlos Mendoza"
        montoTexto="$50,00 USD"
        motivo="Motivo de prueba"
        procesando={false}
        error={null}
        onCambiarMotivo={vi.fn()}
        onCerrar={vi.fn()}
        onConfirmar={vi.fn()}
      />
    );

    // Título h3 o heading del diálogo
    const titulo = screen.getByRole('heading', { name: 'Rechazar pago' });
    expect(titulo).toBeTruthy();

    // Botón de confirmación
    const boton = screen.getByRole('button', { name: 'Confirmar rechazo' });
    expect(boton).toBeTruthy();

    // Textos viejos no deben existir
    expect(screen.queryByText(/Rechazar Transacción/i)).toBeNull();
    expect(screen.queryByText('Confirmar Rechazo')).toBeNull();
  });

  it('R3 · existe el botón Cerrar rechazo de pago', () => {
    render(
      <ModalRechazoConciliacion
        alumno="Carlos Mendoza"
        montoTexto="$50,00 USD"
        motivo="Motivo de prueba"
        procesando={false}
        error={null}
        onCambiarMotivo={vi.fn()}
        onCerrar={vi.fn()}
        onConfirmar={vi.fn()}
      />
    );

    const botonCerrar = screen.getByRole('button', { name: 'Cerrar rechazo de pago' });
    expect(botonCerrar).toBeTruthy();
  });
});
