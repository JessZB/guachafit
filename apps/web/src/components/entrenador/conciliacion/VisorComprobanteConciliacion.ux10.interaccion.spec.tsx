// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato B4 · VisorComprobanteConciliacion.
 *
 * B4:
 * - Se ven "Monto declarado", "Equivalente en USD" y "Fecha de operación".
 * - Los montos van formateados: "+$25,00 USD" y "Bs. 912,50".
 * - El img tiene alt="Comprobante de pago"; en demo, alt="Comprobante de pago (demostración)".
 * - El enlace se llama "Abrir original (se abre en una pestaña nueva)" (accesible).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { VisorComprobanteConciliacion } from './VisorComprobanteConciliacion';

afterEach(() => {
  cleanup();
});

function txBase(parcial: Partial<TransaccionPagoDetalleDTO> = {}): TransaccionPagoDetalleDTO {
  return {
    id: 'tx-1',
    cuotaId: 'cuota-1',
    clienteId: 'cli-1',
    entrenadorId: 'coach-1',
    registradoPor: 'cli-1',
    montoOriginal: '912.50',
    monedaOriginal: Moneda.VES,
    tasaCambioFijada: '36.50',
    montoEquivalenteUsd: '25.00',
    excedenteUsd: '0.00',
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: 'REF-123',
    fechaOperacion: '2026-10-10',
    comprobanteStorageKey: 'k-1',
    comprobanteUrl: 'https://example.com/comprobante.webp',
    estadoConciliacion: EstadoConciliacion.PENDIENTE,
    fechaReporteUtc: '2026-10-10T10:00:00.000Z',
    createdAtUtc: '2026-10-10T10:00:00.000Z',
    updatedAtUtc: '2026-10-10T10:00:00.000Z',
    clienteNombre: 'Carlos Mendoza',
    saldoPendienteCuotaUsd: '60.00',
    ...parcial,
  };
}

describe('Contrato B4 · VisorComprobanteConciliacion (UX-10)', () => {
  it('B4 · textos de detalle en sentence case, montos formateados, alt de img y nombre accesible del enlace', () => {
    const tx = txBase();
    render(
      <VisorComprobanteConciliacion
        tx={tx}
        isDemoMode={false}
        imagenFallida={false}
        onImagenError={vi.fn()}
        onCerrar={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    // Textos de detalle
    expect(screen.getByText('Monto declarado')).toBeTruthy();
    expect(screen.getByText('Equivalente en USD')).toBeTruthy();
    expect(screen.getByText('Fecha de operación')).toBeTruthy();

    expect(screen.queryByText('Monto Declarado')).toBeNull();
    expect(screen.queryByText('Equivalente USD')).toBeNull();
    expect(screen.queryByText('Fecha Operación')).toBeNull();

    // Montos formateados
    expect(screen.getByText('+$25,00 USD')).toBeTruthy();
    expect(screen.getByText(/Bs\.\s*912,50/)).toBeTruthy();

    // Alt de la imagen real
    const img = screen.getByRole('img', { name: 'Comprobante de pago' });
    expect(img).toBeTruthy();

    // Nombre accesible del enlace a pestaña nueva
    const link = screen.getByRole('link', {
      name: 'Abrir original (se abre en una pestaña nueva)',
    });
    expect(link).toBeTruthy();
  });

  it('B4 · en modo demo la imagen tiene alt="Comprobante de pago (demostración)"', () => {
    const tx = txBase({ comprobanteUrl: null });
    render(
      <VisorComprobanteConciliacion
        tx={tx}
        isDemoMode={true}
        imagenFallida={false}
        onImagenError={vi.fn()}
        onCerrar={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const img = screen.getByRole('img', {
      name: 'Comprobante de pago (demostración)',
    });
    expect(img).toBeTruthy();
  });

  it('B1b · con montoEquivalenteUsd: null, el visor muestra "—" y no existe ningún texto "+—"', () => {
    const tx = txBase({
      montoEquivalenteUsd: null as any,
    });
    const { container } = render(
      <VisorComprobanteConciliacion
        tx={tx}
        isDemoMode={false}
        imagenFallida={false}
        onImagenError={vi.fn()}
        onCerrar={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText('—')).toBeTruthy();
    expect(container.textContent).not.toContain('+—');
  });
});
