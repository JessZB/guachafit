// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstadoCuota, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { ModalCobroCartera, type ModalCobroCarteraProps } from './ModalCobroCartera';
import type { EstadoCobro } from './useCobroCartera';

function fixtureFila(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-1',
    alumnoPerfilId: 'p-1',
    alumnoNombre: 'Carlos Mendoza',
    cuotaId: 'c-1',
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T00:00:00.000Z',
    saldoPendienteUsd: '50.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 5,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: 'Plan Mensual',
    periodo: '2026-10',
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    telefonoWhatsapp: null,
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    ...parcial,
  };
}

function fixtureCobro(parcial: Partial<EstadoCobro> = {}): EstadoCobro {
  return {
    fila: fixtureFila(),
    monto: '50.00',
    moneda: Moneda.USD,
    fechaOperacion: '2026-10-29',
    claveIdempotencia: 'idem-1',
    ...parcial,
  };
}

describe('ModalCobroCartera · cierre al hacer clic fuera del modal (fase roja)', () => {
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

  function renderizar(propsParciales: Partial<ModalCobroCarteraProps> = {}) {
    const onCerrar = vi.fn();
    const onCambiarMonto = vi.fn();
    const onCambiarMoneda = vi.fn();
    const onCambiarFecha = vi.fn();
    const onRegistrar = vi.fn();

    const resultado = render(
      <MemoryRouter>
        <ModalCobroCartera
          cobro={fixtureCobro()}
          error={null}
          exito={null}
          enviando={false}
          sinPlan={false}
          sinTasa={false}
          tasaVigente="36.50"
          saldoTexto="$50,00 USD"
          resumen={null}
          onCerrar={onCerrar}
          onCambiarMonto={onCambiarMonto}
          onCambiarMoneda={onCambiarMoneda}
          onCambiarFecha={onCambiarFecha}
          onRegistrar={onRegistrar}
          {...propsParciales}
        />
      </MemoryRouter>
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar registro de cobro' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCerrar,
      onRegistrar,
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

    const titulo = screen.getByRole('heading', { name: 'Registrar cobro en efectivo' });
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
