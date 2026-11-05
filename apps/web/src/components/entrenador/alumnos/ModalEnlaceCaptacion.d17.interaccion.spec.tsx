// @vitest-environment happy-dom
/**
 * D17 · RF-011: Diálogo «Invitar» con rotación, confirmación inline, pausa y contador.
 * Contratos: d17-contratos.md §4.4
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalEnlaceCaptacion, type ModalEnlaceCaptacionProps } from './ModalEnlaceCaptacion';

afterEach(() => {
  cleanup();
});

function montar(parcial: Partial<ModalEnlaceCaptacionProps> = {}) {
  const onRotarEnlace = vi.fn();
  const onAlternarCaptacion = vi.fn();
  const onCopiar = vi.fn();
  const onCerrar = vi.fn();

  const props: ModalEnlaceCaptacionProps = {
    onCerrar,
    registrationUrl: 'http://localhost:5173/onboarding?coach=COACH1',
    coachCode: 'COACH1',
    coachCodeError: null,
    isDemoMode: false,
    copiado: false,
    errorCopia: null,
    onCopiar,
    captacionActiva: true,
    registrosPorEnlace: 0,
    rotando: false,
    cambiandoCaptacion: false,
    errorCaptacion: null,
    onRotarEnlace,
    onAlternarCaptacion,
    ...parcial,
  };

  render(<ModalEnlaceCaptacion {...props} />);
  return { props, onRotarEnlace, onAlternarCaptacion };
}

describe('ModalEnlaceCaptacion (D17 §4.4)', () => {
  it('botón «Generar nuevo enlace» abre confirmación inline con texto exacto y botones Sí / Cancelar', () => {
    montar();

    const botonGenerar = screen.getByRole('button', { name: 'Generar nuevo enlace' });
    fireEvent.click(botonGenerar);

    expect(
      screen.getByText(
        'Tu enlace anterior dejará de funcionar de inmediato. ¿Generar uno nuevo?'
      )
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Sí, generar nuevo enlace' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  });

  it('cancelar en confirmación inline no llama a rotarEnlace y oculta la confirmación', () => {
    const { onRotarEnlace } = montar();

    const botonGenerar = screen.getByRole('button', { name: 'Generar nuevo enlace' });
    fireEvent.click(botonGenerar);

    const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(botonCancelar);

    expect(onRotarEnlace).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        'Tu enlace anterior dejará de funcionar de inmediato. ¿Generar uno nuevo?'
      )
    ).toBeNull();
  });

  it('confirmar en confirmación inline llama a rotarEnlace', () => {
    const { onRotarEnlace } = montar();

    const botonGenerar = screen.getByRole('button', { name: 'Generar nuevo enlace' });
    fireEvent.click(botonGenerar);

    const botonConfirmar = screen.getByRole('button', { name: 'Sí, generar nuevo enlace' });
    fireEvent.click(botonConfirmar);

    expect(onRotarEnlace).toHaveBeenCalledTimes(1);
  });

  it('con captación activa muestra botón «Pausar captación» y no muestra el aviso de pausa', () => {
    const { onAlternarCaptacion } = montar({ captacionActiva: true });

    const botonPausar = screen.getByRole('button', { name: 'Pausar captación' });
    expect(botonPausar).toBeTruthy();

    expect(
      screen.queryByText(
        'La captación está pausada: quien abra tu enlace verá que no está disponible.'
      )
    ).toBeNull();

    fireEvent.click(botonPausar);
    expect(onAlternarCaptacion).toHaveBeenCalledTimes(1);
  });

  it('con captación pausada muestra botón «Reanudar captación» y el aviso exacto de pausa', () => {
    const { onAlternarCaptacion } = montar({ captacionActiva: false });

    const botonReanudar = screen.getByRole('button', { name: 'Reanudar captación' });
    expect(botonReanudar).toBeTruthy();

    expect(
      screen.getByText(
        'La captación está pausada: quien abra tu enlace verá que no está disponible.'
      )
    ).toBeTruthy();

    fireEvent.click(botonReanudar);
    expect(onAlternarCaptacion).toHaveBeenCalledTimes(1);
  });

  it('contador en sus tres variantes: 0 registros', () => {
    montar({ registrosPorEnlace: 0 });
    expect(
      screen.getByText('Aún nadie se registró con este enlace.')
    ).toBeTruthy();
  });

  it('contador en sus tres variantes: 1 registro', () => {
    montar({ registrosPorEnlace: 1 });
    expect(
      screen.getByText('1 alumno se registró con este enlace.')
    ).toBeTruthy();
  });

  it('contador en sus tres variantes: N registros', () => {
    montar({ registrosPorEnlace: 14 });
    expect(
      screen.getByText('14 alumnos se registraron con este enlace.')
    ).toBeTruthy();
  });

  it('el error de rotar o pausar se muestra en un role="alert"', () => {
    const MENSAJE_ERROR = 'No se pudo pausar la captación. Intenta de nuevo.';
    montar({ errorCaptacion: MENSAJE_ERROR });

    const alertas = screen.getAllByRole('alert');
    const alertaEncontrada = alertas.some((a) => a.textContent?.includes(MENSAJE_ERROR));
    expect(alertaEncontrada).toBe(true);
  });
});
