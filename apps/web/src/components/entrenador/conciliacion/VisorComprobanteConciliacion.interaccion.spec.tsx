// @vitest-environment happy-dom
/**
 * Lote UX-07a · Contrato C: VisorComprobanteConciliacion (COB-07, COB-08).
 *
 * Requisitos:
 * - C1: Título: el role="dialog" se llama "Comprobante de pago" y no "Auditoría de Comprobante Bancario".
 * - C2: Scroll propio: role="dialog" incluye overflow-y-auto.
 * - C3: Sin colores crudos: ningún elemento incluye bg-black.
 * - C4: Sin jerga (con comprobante: sin Presigned, TTL, ADR-, R2; con aviso de 15 minutos; sin comprobante: sin R2, sin URL de lectura, aviso no tiene comprobante).
 * - C5: "Abrir original" sin absolute y con min-h-11.
 * - C6: Acciones "Aprobar este pago" y "Rechazar este pago" con texto visible Aprobar/Rechazar, type="button", min-h-11 y sin nombres viejos.
 * - C7: Cerrar: botón "Cerrar comprobante de pago" con min-h-11, min-w-11 y llama a onCerrar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const TX_SIN_COMPROBANTE: TransaccionPagoDetalleDTO = {
  ...TX_CON_COMPROBANTE,
  id: 'tx-sin-comprobante',
  comprobanteStorageKey: null,
  comprobanteUrl: null,
};

afterEach(() => {
  cleanup();
});

function montarVisor(propsParciales: Partial<VisorComprobanteConciliacionProps> = {}) {
  const onImagenError = vi.fn();
  const onCerrar = vi.fn();
  const onRechazar = vi.fn();
  const onAprobar = vi.fn();

  render(
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

  return { onImagenError, onCerrar, onRechazar, onAprobar };
}

describe('VisorComprobanteConciliacion · Contrato C (COB-07, COB-08)', () => {
  it('C1 · diálogo tiene nombre accesible "Comprobante de pago" y elimina "Auditoría de Comprobante Bancario"', () => {
    montarVisor();

    const dialogo = screen.getByRole('dialog', { name: 'Comprobante de pago' });
    expect(dialogo).toBeTruthy();
    expect(screen.queryByText(/Auditoría de Comprobante Bancario/i)).toBeNull();
  });

  it('C4 · sin jerga técnica con y sin comprobante', () => {
    // 1. Con comprobante
    const { unmount } = render(
      <VisorComprobanteConciliacion
        tx={TX_CON_COMPROBANTE}
        isDemoMode={false}
        imagenFallida={false}
        onImagenError={vi.fn()}
        onCerrar={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const textoCon = document.body.textContent ?? '';
    expect(textoCon).not.toMatch(/Presigned/i);
    expect(textoCon).not.toMatch(/TTL/i);
    expect(textoCon).not.toMatch(/ADR-/i);
    expect(textoCon).not.toMatch(/R2/i);
    expect(textoCon).toContain('El enlace del comprobante caduca en 15 minutos.');
    unmount();

    // 2. Sin comprobante
    render(
      <VisorComprobanteConciliacion
        tx={TX_SIN_COMPROBANTE}
        isDemoMode={false}
        imagenFallida={false}
        onImagenError={vi.fn()}
        onCerrar={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const textoSin = document.body.textContent ?? '';
    expect(textoSin).not.toMatch(/R2/i);
    expect(textoSin).not.toMatch(/URL de lectura/i);
    expect(textoSin).toContain('Este pago no tiene comprobante disponible.');
  });

  it('C5 · "Abrir original" no incluye absolute, incluye min-h-11 y preserva atributos de enlace seguro', () => {
    montarVisor();

    const enlace = screen.getByRole('link', { name: /abrir original/i });
    expect(enlace.getAttribute('href')).toBe('https://example.com/comprobante-real.png');
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toContain('noopener');

    const clases = enlace.getAttribute('class') ?? '';
    expect(clases).not.toContain('absolute');
    expect(clases).toContain('min-h-11');
  });

  it('C6 · acciones tienen nombre accesible "Aprobar este pago" y "Rechazar este pago", type="button", min-h-11 y llaman a callbacks', () => {
    const { onAprobar, onRechazar } = montarVisor();

    const botonAprobar = screen.getByRole('button', { name: 'Aprobar este pago' });
    expect(botonAprobar.textContent?.trim()).toBe('Aprobar');
    expect(botonAprobar.getAttribute('type')).toBe('button');
    expect(botonAprobar.getAttribute('class')).toContain('min-h-11');

    const botonRechazar = screen.getByRole('button', { name: 'Rechazar este pago' });
    expect(botonRechazar.textContent?.trim()).toBe('Rechazar');
    expect(botonRechazar.getAttribute('type')).toBe('button');
    expect(botonRechazar.getAttribute('class')).toContain('min-h-11');
    expect(botonRechazar.getAttribute('class')).toContain('text-destructive');
    expect(botonRechazar.getAttribute('class')).not.toContain('text-foreground');

    fireEvent.click(botonAprobar);
    expect(onAprobar).toHaveBeenCalledWith(TX_CON_COMPROBANTE);

    fireEvent.click(botonRechazar);
    expect(onRechazar).toHaveBeenCalledWith(TX_CON_COMPROBANTE);

    expect(screen.queryByRole('button', { name: /Aprobar y Descontar Saldo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rechazar Pago/i })).toBeNull();
  });

  it('C7 · botón cerrar se llama "Cerrar comprobante de pago", tiene min-h-11 y min-w-11, y llama a onCerrar', async () => {
    const { onCerrar } = montarVisor();

    const botonCerrar = screen.getByRole('button', {
      name: 'Cerrar comprobante de pago',
    });
    const clases = botonCerrar.getAttribute('class') ?? '';
    expect(clases).toContain('min-h-11');
    expect(clases).toContain('min-w-11');

    fireEvent.click(botonCerrar);
    await waitFor(() => expect(onCerrar).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByRole('button', { name: /Cerrar auditoría de comprobante/i })
    ).toBeNull();
  });
});
