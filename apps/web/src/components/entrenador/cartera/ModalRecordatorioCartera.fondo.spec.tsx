// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoCuota, type FilaCarteraDTO } from '@guachafit/shared';
import { ModalRecordatorioCartera, type ModalRecordatorioCarteraProps } from './ModalRecordatorioCartera';

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

describe('ModalRecordatorioCartera · cierre al hacer clic fuera del modal (fase roja)', () => {
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

  function renderizar(propsParciales: Partial<ModalRecordatorioCarteraProps> = {}) {
    const onCerrar = vi.fn();
    const onEnviar = vi.fn();
    const onCopiar = vi.fn();
    const onReintentarVistaPrevia = vi.fn();

    const resultado = render(
      <ModalRecordatorioCartera
        fila={fixtureFila()}
        resultado={null}
        error={null}
        enviando={false}
        copiado={false}
        telefonoWhatsApp="+584121234567"
        vistaPrevia={null}
        cargandoVistaPrevia={false}
        errorVistaPrevia={null}
        onReintentarVistaPrevia={onReintentarVistaPrevia}
        saldoTexto="$50,00 USD"
        onCerrar={onCerrar}
        onEnviar={onEnviar}
        onCopiar={onCopiar}
        {...propsParciales}
      />
    );

    const dialog = screen.getByRole('dialog');
    const fondo = dialog.parentElement as HTMLElement;
    const botonCerrar = screen.getByRole('button', { name: 'Cerrar recordatorio' });

    return {
      ...resultado,
      dialog,
      fondo,
      botonCerrar,
      onCerrar,
      onEnviar,
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

    const titulo = screen.getByRole('heading', { name: 'Enviar recordatorio manual' });
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
