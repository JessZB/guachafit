// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { FilaTransaccionPago } from './FilaTransaccionPago';
import { formatDecimal, formatMonto } from '../../../lib/formato-monto';
import * as pagosMontosModule from '../../../lib/pagos-montos';

const { TEXTO_RECHAZO_SIN_MOTIVO } = pagosMontosModule as unknown as {
  TEXTO_RECHAZO_SIN_MOTIVO: string;
};

const fm = (v: string, m: 'USD' | 'VES', o?: { conCodigo?: boolean }) =>
  formatMonto(v, m, { ...o, formato: 'coma-decimal' });
const fd = (v: string, decimales: number) =>
  formatDecimal(v, { decimales, formato: 'coma-decimal' });

const baseTx: TransaccionPagoDetalleDTO = {
  id: 'tx-001',
  cuotaId: 'cuota-001',
  clienteId: 'cliente-1',
  entrenadorId: 'coach-1',
  registradoPor: 'cliente-1',
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

describe('components/atleta/pagos/FilaTransaccionPago · formato común y motivo de rechazo (D15)', () => {
  it('P8: transacción RECHAZADO con motivo muestra «Motivo del entrenador:» y el motivo específico', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Comprobante ilegible',
    };

    render(<FilaTransaccionPago tx={tx} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);

    expect(screen.getByText(/Motivo del entrenador:/i)).not.toBeNull();
    expect(document.body.textContent).toContain('Comprobante ilegible');
  });

  it('P9: transacción RECHAZADO sin motivo (null, ausente o espacios) no muestra etiqueta ni texto viejo y muestra TEXTO_RECHAZO_SIN_MOTIVO', () => {
    const casos = [
      { ...baseTx, estadoConciliacion: EstadoConciliacion.RECHAZADO, motivoRechazo: null },
      { ...baseTx, estadoConciliacion: EstadoConciliacion.RECHAZADO, motivoRechazo: undefined },
      { ...baseTx, estadoConciliacion: EstadoConciliacion.RECHAZADO, motivoRechazo: '   ' },
    ];

    for (const tx of casos) {
      const { unmount } = render(
        <FilaTransaccionPago tx={tx as any} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />
      );

      expect(screen.queryByText(/Motivo del entrenador:/i)).toBeNull();
      expect(document.body.textContent).not.toContain(
        'La referencia no coincide con el estado de cuenta bancario.'
      );
      expect(typeof TEXTO_RECHAZO_SIN_MOTIVO).toBe('string');
      expect(document.body.textContent).toContain(TEXTO_RECHAZO_SIN_MOTIVO);

      unmount();
    }
  });

  it('P10: importes y tasa se formatean con el formato común y el valor crudo con miles no aparece', () => {
    const tx: TransaccionPagoDetalleDTO = {
      ...baseTx,
      montoOriginal: '1950.00',
      monedaOriginal: Moneda.VES,
      montoEquivalenteUsd: '30.00',
      tasaCambioFijada: '65.0000',
    };

    render(<FilaTransaccionPago tx={tx} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);

    const textoCuerpo = document.body.textContent ?? '';

    expect(textoCuerpo).toContain(`+${fm('30.00', 'USD', { conCodigo: true })}`);
    expect(textoCuerpo).toContain(fm('1950.00', 'VES'));
    expect(textoCuerpo).toContain(fd('65.0000', 4));
    expect(textoCuerpo).not.toContain('1950.00');
  });
});
