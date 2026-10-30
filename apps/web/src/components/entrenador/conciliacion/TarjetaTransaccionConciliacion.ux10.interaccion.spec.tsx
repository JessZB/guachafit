// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contratos B1, B2, B3, B6 · TarjetaTransaccionConciliacion.
 *
 * B1: Formato montos venezolano: +$25,00 USD, Bs. 912,50, Tasa: 36,50 Bs/USD, sin crudos.
 *     Con USD puro: $25,00 y sin línea de tasa.
 * B2: Textos: "Fecha de operación", "Abono en dólares", botón visible "Ver comprobante"
 *     con nombre accesible "Ver comprobante de {clienteNombre}" (WCAG 2.5.3).
 * B3: Tarjeta es un article con aria-labelledby hacia el h2 del nombre. Dos tarjetas no repiten ningún id.
 * B6: El aviso de excedente en la tarjeta contiene "saldo a favor de {clienteNombre}".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { TarjetaTransaccionConciliacion } from './TarjetaTransaccionConciliacion';

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

describe('Contratos B1, B2, B3, B6 · TarjetaTransaccionConciliacion (UX-10)', () => {
  it('B1 · montos formateados en VES: +$25,00 USD, Bs. 912,50, Tasa: 36,50 Bs/USD, sin números crudos', () => {
    const tx = txBase();
    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText('+$25,00 USD')).toBeTruthy();
    expect(screen.getByText(/Bs\.\s*912,50/)).toBeTruthy();
    expect(screen.getByText(/Tasa:\s*36,50\s*Bs\/USD/)).toBeTruthy();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('25.00');
    expect(bodyText).not.toContain('912.50');
  });

  it('B1 · montos formateados en USD: $25,00 y sin línea de tasa', () => {
    const tx = txBase({
      monedaOriginal: Moneda.USD,
      montoOriginal: '25.00',
      montoEquivalenteUsd: '25.00',
      tasaCambioFijada: null as any,
    });
    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText('+$25,00 USD')).toBeTruthy();
    expect(screen.queryByText(/Tasa:/i)).toBeNull();
  });

  it('B1b · con montoEquivalenteUsd: null, la tarjeta muestra "—" y no existe ningún texto "+—"', () => {
    const tx = txBase({
      montoEquivalenteUsd: null as any,
    });
    const { container } = render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText('—')).toBeTruthy();
    expect(container.textContent).not.toContain('+—');
  });

  it('B2 · textos en sentence case y nombre accesible del botón comprobante acorde a WCAG 2.5.3', () => {
    const tx = txBase({ clienteNombre: 'Carlos Mendoza' });
    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    expect(screen.getByText(/Fecha de operación/)).toBeTruthy();
    expect(screen.getByText(/Abono en dólares/)).toBeTruthy();

    expect(screen.queryByText(/Fecha Operación/)).toBeNull();
    expect(screen.queryByText(/Abono en Dólares/)).toBeNull();
    expect(screen.queryByText(/Ver Comprobante/)).toBeNull();

    // El botón tiene nombre accesible "Ver comprobante de Carlos Mendoza" y texto visible "Ver comprobante"
    const boton = screen.getByRole('button', {
      name: 'Ver comprobante de Carlos Mendoza',
    });
    expect(boton).toBeTruthy();
    expect(boton.textContent?.trim()).toContain('Ver comprobante');
  });

  it('B3 · semántica de article con aria-labelledby al h2 y sin ids duplicados entre tarjetas', () => {
    const tx1 = txBase({ id: 'tx-1', clienteNombre: 'Carlos Mendoza' });
    const tx2 = txBase({ id: 'tx-2', clienteNombre: 'Mariana Pérez' });

    const { container } = render(
      <div>
        <TarjetaTransaccionConciliacion
          tx={tx1}
          onVerComprobante={vi.fn()}
          onRechazar={vi.fn()}
          onAprobar={vi.fn()}
        />
        <TarjetaTransaccionConciliacion
          tx={tx2}
          onVerComprobante={vi.fn()}
          onRechazar={vi.fn()}
          onAprobar={vi.fn()}
        />
      </div>
    );

    const article1 = screen.getByRole('article', { name: 'Carlos Mendoza' });
    const article2 = screen.getByRole('article', { name: 'Mariana Pérez' });
    expect(article1).toBeTruthy();
    expect(article2).toBeTruthy();

    // Verificación de unicidad de IDs en el DOM
    const allIds = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });

  it('B6 · el aviso de excedente de la tarjeta incluye el nombre del alumno', () => {
    const tx = txBase({
      clienteNombre: 'Carlos Mendoza',
      montoEquivalenteUsd: '50.00',
      saldoPendienteCuotaUsd: '40.00',
    });
    render(
      <TarjetaTransaccionConciliacion
        tx={tx}
        onVerComprobante={vi.fn()}
        onRechazar={vi.fn()}
        onAprobar={vi.fn()}
      />
    );

    const nota = screen.getByRole('note');
    expect(nota.textContent).toContain('saldo a favor de Carlos Mendoza');
  });
});
