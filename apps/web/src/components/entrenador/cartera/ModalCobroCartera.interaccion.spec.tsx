// @vitest-environment jsdom
/**
 * 01 · UX-08 · ModalCobroCartera: cobro en efectivo honesto y accesible (Contrato C).
 *
 * Requisitos:
 * - C1: Unidad visible: campo Monto (getByLabelText('Monto')) es type="text" con inputMode="decimal",
 *   min-h-11 y sufijo con la unidad (USD o Bs.) incluido en aria-describedby.
 * - C2: Moneda: getByLabelText('Moneda') es un select con min-h-11 y conserva opciones y disabled de Bs. sin tasa.
 * - C3: Fecha: getByLabelText('Fecha de la operación') incluye min-h-11.
 * - C4: Ids únicos: no usa ids estáticos (cobro-monto, cobro-moneda, cobro-fecha); dos modales no repiten ningún id.
 * - C5: Resumen: con resumen no nulo aparece en role="status"; con null no.
 * - C6: Éxito anunciado: con exito, el mensaje está en role="status".
 * - C7: Botones: "Cancelar" y "Registrar cobro" tienen type="button" y min-h-11;
 *   cierre se llama "Cerrar registro de cobro" con min-h-11 y min-w-11.
 * - C8: Pantallas bajas: el role="dialog" incluye max-h-[90vh] y overflow-y-auto.
 * - C9: Saldo formateado: el saldo pendiente muestra saldoTexto (p. ej. "$50,00 USD"), no la cadena cruda.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { EstadoCuota, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { ModalCobroCartera, type ModalCobroCarteraProps } from './ModalCobroCartera';
import type { EstadoCobro } from './useCobroCartera';

afterEach(() => {
  cleanup();
});

type PropsModalCobro = ModalCobroCarteraProps & {
  resumen?: string | null;
  saldoTexto?: string;
};

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

function montarModal(propsParciales: Partial<PropsModalCobro> = {}) {
  const propsPorDefecto: PropsModalCobro = {
    cobro: fixtureCobro(),
    error: null,
    exito: null,
    enviando: false,
    sinPlan: false,
    sinTasa: false,
    tasaVigente: '36.50',
    onCerrar: vi.fn(),
    onCambiarMonto: vi.fn(),
    onCambiarMoneda: vi.fn(),
    onCambiarFecha: vi.fn(),
    onRegistrar: vi.fn(),
    resumen: null,
    saldoTexto: '$50,00 USD',
  };

  const propsCompletas = { ...propsPorDefecto, ...propsParciales };
  // Renderizamos pasando props extendidas
  render(<ModalCobroCartera {...(propsCompletas as unknown as ModalCobroCarteraProps)} />);
  return propsCompletas;
}

describe('ModalCobroCartera · Contrato C (COB-18, COB-19, COB-26)', () => {
  it('C1 · campo Monto es type="text" con inputMode="decimal", min-h-11 y sufijo de unidad en aria-describedby', () => {
    // 1. En USD
    montarModal({ cobro: fixtureCobro({ moneda: Moneda.USD }) });
    const inputMontoUsd = screen.getByLabelText('Monto') as HTMLInputElement;
    expect(inputMontoUsd.type).toBe('text');
    expect(inputMontoUsd.getAttribute('inputmode')).toBe('decimal');
    expect(inputMontoUsd.className).toContain('min-h-11');

    const descUsd = inputMontoUsd.getAttribute('aria-describedby') ?? '';
    expect(descUsd).toBeTruthy();
    const elementoSufijoUsd = document.getElementById(descUsd);
    expect(elementoSufijoUsd?.textContent?.trim()).toBe('USD');

    cleanup();

    // 2. En VES
    montarModal({ cobro: fixtureCobro({ moneda: Moneda.VES }) });
    const inputMontoVes = screen.getByLabelText('Monto') as HTMLInputElement;
    expect(inputMontoVes.type).toBe('text');
    expect(inputMontoVes.getAttribute('inputmode')).toBe('decimal');
    const descVes = inputMontoVes.getAttribute('aria-describedby') ?? '';
    const elementoSufijoVes = document.getElementById(descVes);
    expect(elementoSufijoVes?.textContent?.trim()).toBe('Bs.');
  });

  it('C2 · campo Moneda es un select con min-h-11, conserva opciones y deshabilita Bs. sin tasa', () => {
    // Con tasa: Bs. habilitada
    montarModal({ sinTasa: false });
    const select = screen.getByLabelText('Moneda') as HTMLSelectElement;
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(select.className).toContain('min-h-11');

    const opcionVes = within(select).getByRole('option', { name: /Bs\./i }) as HTMLOptionElement;
    expect(opcionVes.disabled).toBe(false);

    cleanup();

    // Sin tasa: Bs. deshabilitada
    montarModal({ sinTasa: true });
    const selectSinTasa = screen.getByLabelText('Moneda') as HTMLSelectElement;
    const opcionVesDeshabilitada = within(selectSinTasa).getByRole('option', { name: /Bs\./i }) as HTMLOptionElement;
    expect(opcionVesDeshabilitada.disabled).toBe(true);
  });

  it('C3 · campo Fecha de la operación incluye min-h-11', () => {
    montarModal();
    const inputFecha = screen.getByLabelText('Fecha de la operación');
    expect(inputFecha.className).toContain('min-h-11');
  });

  it('C4 · no usa ids estáticos de cobro y montar dos modales genera ids distintos', () => {
    expect(document.getElementById('cobro-monto')).toBeNull();
    expect(document.getElementById('cobro-moneda')).toBeNull();
    expect(document.getElementById('cobro-fecha')).toBeNull();

    // Montar dos modales simultáneos
    const contenedorA = document.createElement('div');
    const contenedorB = document.createElement('div');
    document.body.appendChild(contenedorA);
    document.body.appendChild(contenedorB);

    render(
      <ModalCobroCartera
        {...( {
          cobro: fixtureCobro({ fila: fixtureFila({ alumnoNombre: 'Alumno A' }) }),
          error: null,
          exito: null,
          enviando: false,
          sinPlan: false,
          sinTasa: false,
          onCerrar: vi.fn(),
          onCambiarMonto: vi.fn(),
          onCambiarMoneda: vi.fn(),
          onCambiarFecha: vi.fn(),
          onRegistrar: vi.fn(),
        } as unknown as ModalCobroCarteraProps)}
      />,
      { container: contenedorA }
    );

    render(
      <ModalCobroCartera
        {...( {
          cobro: fixtureCobro({ fila: fixtureFila({ alumnoNombre: 'Alumno B' }) }),
          error: null,
          exito: null,
          enviando: false,
          sinPlan: false,
          sinTasa: false,
          onCerrar: vi.fn(),
          onCambiarMonto: vi.fn(),
          onCambiarMoneda: vi.fn(),
          onCambiarFecha: vi.fn(),
          onRegistrar: vi.fn(),
        } as unknown as ModalCobroCarteraProps)}
      />,
      { container: contenedorB }
    );

    const inputMontoA = within(contenedorA).getByLabelText('Monto');
    const inputMontoB = within(contenedorB).getByLabelText('Monto');
    expect(inputMontoA.id).toBeTruthy();
    expect(inputMontoB.id).toBeTruthy();
    expect(inputMontoA.id).not.toBe(inputMontoB.id);

    document.body.removeChild(contenedorA);
    document.body.removeChild(contenedorB);
  });

  it('C5 · resumen de conversión aparece en role="status" si existe y no se muestra si es null', () => {
    // 1. Con resumen
    montarModal({ resumen: 'Se registrarán Bs. 1.825,00 (≈ $50,00 USD)' });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Se registrarán Bs. 1.825,00 (≈ $50,00 USD)');

    cleanup();

    // 2. Sin resumen
    montarModal({ resumen: null });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('C6 · mensaje de éxito está contenido en role="status"', () => {
    montarModal({ exito: 'Cobro registrado y auto-aprobado para Carlos Mendoza.' });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Cobro registrado y auto-aprobado para Carlos Mendoza.');
  });

  it('C7 · botones Cancelar y Registrar cobro tienen type="button" y min-h-11; botón cerrar se llama "Cerrar registro de cobro" con min-h-11 y min-w-11', () => {
    montarModal();
    const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(botonCancelar.getAttribute('type')).toBe('button');
    expect(botonCancelar.className).toContain('min-h-11');

    const botonRegistrar = screen.getByRole('button', { name: 'Registrar cobro' });
    expect(botonRegistrar.getAttribute('type')).toBe('button');
    expect(botonRegistrar.className).toContain('min-h-11');

    const botonCerrarX = screen.getByRole('button', { name: 'Cerrar registro de cobro' });
    expect(botonCerrarX.getAttribute('type')).toBe('button');
    expect(botonCerrarX.className).toContain('min-h-11');
    expect(botonCerrarX.className).toContain('min-w-11');
  });

  it('C8 · el diálogo del modal incluye max-h-[90vh] y overflow-y-auto para pantallas bajas', () => {
    montarModal();
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('max-h-[90vh]');
    expect(dialogo.className).toContain('overflow-y-auto');
  });

  it('C9 · muestra el saldo formateado (saldoTexto) en lugar de la cadena cruda', () => {
    montarModal({
      cobro: fixtureCobro({
        fila: fixtureFila({ saldoPendienteUsd: '50.00' }),
      }),
      saldoTexto: '$50,00 USD',
    });
    expect(screen.getByText('$50,00 USD')).not.toBeNull();
  });
});
