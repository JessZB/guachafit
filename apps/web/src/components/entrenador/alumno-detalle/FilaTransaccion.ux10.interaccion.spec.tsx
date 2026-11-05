// @vitest-environment happy-dom
/**
 * 05 · UX-10 · R1 · FilaTransaccion (sin capitalize en método de pago).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoConciliacion, type ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { FilaTransaccion } from './FilaTransaccion';

type TransaccionFila = ResumenFinancieroAlumnoDTO['transacciones'][number];

afterEach(() => {
  cleanup();
});

describe('R1 · FilaTransaccion (UX-10)', () => {
  it('el elemento con "Efectivo en dólares" no tiene la clase capitalize', () => {
    const tx: TransaccionFila = {
      id: 'tx-1',
      cuotaId: 'cuota-1',
      montoUsd: '40.00',
      montoBs: undefined,
      metodoPago: 'efectivo_usd',
      referencia: 'TX-1',
      estado: EstadoConciliacion.APROBADO,
      motivoReversion: null,
      createdAtUtc: '2026-10-01T14:00:00.000Z',
    };

    render(<FilaTransaccion tx={tx} demo onSolicitarReversion={vi.fn()} />);

    const elemento = screen.getByText('Efectivo en dólares');
    expect(elemento).toBeTruthy();
    expect(elemento.className).not.toContain('capitalize');
  });
});
