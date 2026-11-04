// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { FilaTransaccionPago } from './FilaTransaccionPago';

const baseTx: TransaccionPagoDetalleDTO = {
  id: 'tx-d16-001',
  cuotaId: 'cuota-d16-001',
  clienteId: 'cliente-uuid-1',
  entrenadorId: 'coach-uuid-1',
  registradoPor: 'cliente-uuid-1',
  montoOriginal: '1950.00',
  monedaOriginal: Moneda.VES,
  tasaCambioFijada: '65.0000',
  montoEquivalenteUsd: '30.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.PAGO_MOVIL,
  referenciaBancaria: '987654',
  fechaOperacion: '2026-10-10',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-10T12:00:00.000Z',
  createdAtUtc: '2026-10-10T12:00:00.000Z',
  updatedAtUtc: '2026-10-10T12:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

describe('FilaTransaccionPago (D16): el botón «Ver comprobante» depende de comprobanteUrl', () => {
  it('solo URL → botón presente y el clic llama a onVerComprobante(tx.comprobanteUrl)', () => {
    const onVerComprobante = vi.fn();
    const url = 'https://r2.test/comprobantes/cliente-uuid-1/2026/comprobante.webp';
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteUrl: url,
      comprobanteStorageKey: null,
    };

    render(
      <FilaTransaccionPago
        tx={tx}
        onVerComprobante={onVerComprobante}
        onCorregir={vi.fn()}
      />
    );

    const boton = screen.getByRole('button', { name: /ver comprobante/i });
    expect(boton).toBeTruthy();

    fireEvent.click(boton);
    expect(onVerComprobante).toHaveBeenCalledTimes(1);
    expect(onVerComprobante).toHaveBeenCalledWith(url);
  });

  it('solo clave → botón ausente (comprobanteUrl null o ausente)', () => {
    const onVerComprobante = vi.fn();
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey:
        'comprobantes/11111111-1111-4111-8111-111111111111/2026/22222222-2222-4222-8222-222222222222.webp',
      comprobanteUrl: null,
    };

    render(
      <FilaTransaccionPago
        tx={tx}
        onVerComprobante={onVerComprobante}
        onCorregir={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /ver comprobante/i })).toBeNull();
  });

  it('ninguna de las dos → botón ausente', () => {
    const onVerComprobante = vi.fn();
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey: null,
      comprobanteUrl: null,
    };

    render(
      <FilaTransaccionPago
        tx={tx}
        onVerComprobante={onVerComprobante}
        onCorregir={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /ver comprobante/i })).toBeNull();
  });

  it('solo clave → muestra span con «Comprobante no disponible por ahora»', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey:
        'comprobantes/11111111-1111-4111-8111-111111111111/2026/22222222-2222-4222-8222-222222222222.webp',
      comprobanteUrl: null,
    };

    render(
      <FilaTransaccionPago
        tx={tx}
        onVerComprobante={vi.fn()}
        onCorregir={vi.fn()}
      />
    );

    const span = screen.getByText('Comprobante no disponible por ahora');
    expect(span.tagName.toLowerCase()).toBe('span');
  });

  it('sin URL ni clave → no muestra el aviso «Comprobante no disponible por ahora»', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey: null,
      comprobanteUrl: null,
    };

    render(
      <FilaTransaccionPago
        tx={tx}
        onVerComprobante={vi.fn()}
        onCorregir={vi.fn()}
      />
    );

    expect(screen.queryByText(/comprobante no disponible por ahora/i)).toBeNull();
  });
});
