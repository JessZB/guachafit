// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  VisorComprobanteConciliacion,
  type VisorComprobanteConciliacionProps,
} from './VisorComprobanteConciliacion';

const TX_CON_COMPROBANTE: TransaccionPagoDetalleDTO = {
  id: 'tx-con-comprobante',
  cuotaId: 'cuota-1',
  clienteId: 'cli-1',
  entrenadorId: 'coach-1',
  registradoPor: 'cli-1',
  montoOriginal: '50.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '50.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  referenciaBancaria: '445566',
  fechaOperacion: '2026-10-09',
  comprobanteStorageKey: 'comprobantes/tx-1.png',
  comprobanteUrl: 'https://example.com/comprobante-real.png',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-09T12:00:00.000Z',
  createdAtUtc: '2026-10-09T12:00:00.000Z',
  updatedAtUtc: '2026-10-09T12:00:00.000Z',
  clienteNombre: 'Carlos Mendoza',
  saldoPendienteCuotaUsd: '60.00',
};

describe('VisorComprobanteConciliacion · cierre al hacer clic fuera del modal (fase roja)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    // @ts-expect-error Limpieza de matchMedia
    delete window.matchMedia;
  });

  function renderizar(propsParciales: Partial<VisorComprobanteConciliacionProps> = {}) {
    const onCerrar = vi.fn();
    const onAprobar = vi.fn();
    const onRechazar = vi.fn();
    const onImagenError = vi.fn();

    const resultado = render(
      <VisorComprobanteConciliacion
        tx={TX_CON_COMPROBANTE}
        isDemoMode={false}
        imagenFallida={false}
        onImagenError={onImagenError}
        onCerrar={onCerrar}
        onRechazar={onRechazar}
        onAprobar={onAprobar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar comprobante de pago' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCerrar,
      onAprobar,
      onRechazar,
    };
  }

  it('con matchMedia matches:false y fake timers: clic en el fondo activa data-saliendo y llama a onCerrar a los 150 ms', () => {
    const { fondo, onCerrar } = renderizar();

    expect(fondo.getAttribute('data-saliendo')).toBeNull();

    fireEvent.click(fondo);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('clic en el panel (role="dialog") o en un texto interior no cierra el modal', () => {
    const { dialog, fondo, onCerrar } = renderizar();

    fireEvent.click(dialog);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).not.toHaveBeenCalled();

    const titulo = screen.getByRole('heading', { name: 'Comprobante de pago' });
    fireEvent.click(titulo);

    expect(fondo.getAttribute('data-saliendo')).toBeNull();
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('sin matchMedia: clic en el fondo llama a onCerrar síncronamente una vez', () => {
    // @ts-expect-error Eliminar mock de matchMedia
    delete window.matchMedia;

    const { fondo, onCerrar } = renderizar();

    fireEvent.click(fondo);

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('regresión: el botón de cerrar existente sigue funcionando con salida animada', () => {
    const { fondo, botonCerrar, onCerrar } = renderizar();

    fireEvent.click(botonCerrar);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(fondo.getAttribute('data-saliendo')).toBe('true');
    expect(onCerrar).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
