// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { TarjetaTransaccionConciliacion } from './TarjetaTransaccionConciliacion';

const baseTx: TransaccionPagoDetalleDTO = {
  id: 'tx-d16-conc-1',
  cuotaId: 'cuota-d16-1',
  clienteId: '11111111-1111-4111-8111-111111111111',
  entrenadorId: 'coach-uuid-1',
  registradoPor: '11111111-1111-4111-8111-111111111111',
  montoOriginal: '50.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '50.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  referenciaBancaria: 'REF-123456',
  fechaOperacion: '2026-10-09',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-09T12:00:00.000Z',
  createdAtUtc: '2026-10-09T12:00:00.000Z',
  updatedAtUtc: '2026-10-09T12:00:00.000Z',
  clienteNombre: 'Pedro Pérez',
};

afterEach(() => {
  cleanup();
});

describe('TarjetaTransaccionConciliacion (D16): el botón «Ver comprobante» depende de comprobanteUrl', () => {
  it('solo URL → botón presente y el clic llama a onVerComprobante(tx)', () => {
    const onVerComprobante = vi.fn();
    const url = 'https://r2.test/comprobantes/11111111-1111-4111-8111-111111111111/2026/comprobante.webp';
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteUrl: url,
      comprobanteStorageKey: null,
    };

    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={onVerComprobante}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const boton = screen.getByRole('button', { name: /ver comprobante/i });
    expect(boton).toBeTruthy();

    fireEvent.click(boton);
    expect(onVerComprobante).toHaveBeenCalledTimes(1);
    expect(onVerComprobante).toHaveBeenCalledWith(tx);
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
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={onVerComprobante}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
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
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={onVerComprobante}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /ver comprobante/i })).toBeNull();
  });

  it('solo clave → muestra span con «Comprobante no disponible por ahora» y no «Sin captura digital»', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey:
        'comprobantes/11111111-1111-4111-8111-111111111111/2026/22222222-2222-4222-8222-222222222222.webp',
      comprobanteUrl: null,
    };

    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const span = screen.getByText('Comprobante no disponible por ahora');
    expect(span.tagName.toLowerCase()).toBe('span');
    expect(screen.queryByText(/sin captura digital/i)).toBeNull();
  });

  it('sin URL ni clave → muestra «Sin captura digital» y no «Comprobante no disponible por ahora»', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      comprobanteStorageKey: null,
      comprobanteUrl: null,
    };

    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText('Sin captura digital')).toBeTruthy();
    expect(screen.queryByText(/comprobante no disponible por ahora/i)).toBeNull();
  });
});
