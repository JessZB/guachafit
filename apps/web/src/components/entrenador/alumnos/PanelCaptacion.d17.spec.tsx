// @vitest-environment happy-dom
/**
 * D17 · RF-011: Spec del componente `PanelCaptacion`.
 *
 * Cubre:
 * 1. Prop opcional `mensajeCaptacion`:
 *    - Cuando está presente se muestra en un elemento con `role="status"`.
 *    - Cuando está ausente o null, no hay ningún elemento con `role="status"`.
 * 2. Al pulsar «Generar nuevo enlace» y luego «Cancelar» en la confirmación inline,
 *    el foco vuelve al botón «Generar nuevo enlace».
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PanelCaptacion, type PanelCaptacionProps } from './PanelCaptacion';

afterEach(() => {
  cleanup();
});

function renderPanel(propsParciales: Partial<PanelCaptacionProps> = {}) {
  const propsPorDefecto: PanelCaptacionProps = {
    captacionActiva: true,
    registrosPorEnlace: 0,
    rotando: false,
    cambiandoCaptacion: false,
    errorCaptacion: null,
    mensajeCaptacion: null,
    onRotarEnlace: vi.fn(),
    onAlternarCaptacion: vi.fn(),
  };

  const props = { ...propsPorDefecto, ...propsParciales };
  render(<PanelCaptacion {...props} />);
  return props;
}

describe('PanelCaptacion (D17 §4.4)', () => {
  describe('prop mensajeCaptacion', () => {
    it('cuando está ausente o null no renderiza ningún role="status"', () => {
      renderPanel({ mensajeCaptacion: null });
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('cuando mensajeCaptacion tiene valor se muestra en un role="status"', () => {
      renderPanel({ mensajeCaptacion: 'Tu enlace anterior dejó de funcionar. Comparte el nuevo.' });
      const status = screen.getByRole('status');
      expect(status).toBeTruthy();
      expect(status.textContent).toBe('Tu enlace anterior dejó de funcionar. Comparte el nuevo.');
    });
  });

  describe('foco al cancelar confirmación inline', () => {
    it('al cancelar la confirmación inline de rotación, el foco vuelve al botón «Generar nuevo enlace»', async () => {
      renderPanel();

      const botonGenerar = screen.getByRole('button', { name: 'Generar nuevo enlace' });
      fireEvent.click(botonGenerar);

      // La confirmación inline se abre y el botón Cancelar está presente
      const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
      expect(botonCancelar).toBeTruthy();

      // Cancelar la confirmación
      fireEvent.click(botonCancelar);

      // La confirmación se cierra y el botón Generar nuevo enlace reaparece y recibe el foco
      await waitFor(() => {
        const botonGenerarReaparecido = screen.getByRole('button', { name: 'Generar nuevo enlace' });
        expect(document.activeElement).toBe(botonGenerarReaparecido);
      });
    });
  });
});
