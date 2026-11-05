// @vitest-environment happy-dom
/**
 * Specs del lote UX-29 (Pulido del alumno: fechas, copy y flex-wrap en Pagos).
 *
 * Cubre:
 * - ALU-11: Erradicación de jerga y unificación a "entrenador" (CabeceraPagos y FilaTransaccionPago).
 * - ALU-12: Formato de fecha de corte con helper canónico formatFechaLocal y fallback seguro.
 * - ALU-13: Fallback seguro ("—") para fecha de operación inválida en FilaTransaccionPago.
 * - ALU-14 & ALU-15: Prevención de desbordes (break-words/break-all, min-w-0, no capitalize, flex-wrap, gap-3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
  type CuotaDetalleDTO,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { CabeceraPagos } from '../../components/atleta/pagos/CabeceraPagos';
import { TarjetaResumenCuota } from '../../components/atleta/pagos/TarjetaResumenCuota';
import { FilaTransaccionPago } from '../../components/atleta/pagos/FilaTransaccionPago';
import { formatFechaLocal } from '../../lib/date-format';
import { etiquetaMetodoPago } from '../../lib/conciliacion-filtros';

afterEach(() => {
  cleanup();
});

const mockCuotaBase: CuotaDetalleDTO = {
  id: 'cuota-test-1',
  clienteId: 'cliente-1',
  entrenadorId: 'entrenador-1',
  planId: 'plan-1',
  periodo: '2026-11',
  montoTotalUsd: '40.00',
  montoAbonadoUsd: '0.00',
  saldoPendienteUsd: '40.00',
  saldoAFavorAplicadoUsd: '0.00',
  fechaEmisionUtc: '2026-11-01T00:00:00.000Z',
  fechaCorteUtc: '2026-11-15T12:00:00.000Z',
  estado: EstadoCuota.EMITIDA,
  planNombre: 'Plan Fuerza Mensual',
  createdAtUtc: '2026-11-01T00:00:00.000Z',
  updatedAtUtc: '2026-11-01T00:00:00.000Z',
};

const mockTxBase: TransaccionPagoDetalleDTO = {
  id: 'tx-test-1',
  cuotaId: 'cuota-test-1',
  clienteId: 'cliente-1',
  entrenadorId: 'entrenador-1',
  registradoPor: 'cliente-1',
  montoOriginal: '40.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.00',
  montoEquivalenteUsd: '40.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.PAGO_MOVIL,
  referenciaBancaria: 'REF-123456',
  fechaOperacion: '2026-11-02',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-11-02T12:00:00.000Z',
  createdAtUtc: '2026-11-02T12:00:00.000Z',
  updatedAtUtc: '2026-11-02T12:00:00.000Z',
};

describe('ALU-11: Erradicación de jerga y copy consistente en Pagos', () => {
  it('CabeceraPagos muestra el título "Pagos y cuotas" con capitalización de oración', () => {
    render(<CabeceraPagos etiquetaSinTasa="Sin tasa configurada" />);
    const encabezado = screen.getByRole('heading', { level: 1 });
    expect(encabezado.textContent?.trim()).toBe('Pagos y cuotas');
  });

  it('CabeceraPagos muestra la tasa con "Bs." en lugar del código "VES"', () => {
    render(<CabeceraPagos tasaEfectiva="65.0000" etiquetaSinTasa={null} />);
    const tasaElem = screen.getByText(/1 USD =/i);
    expect(tasaElem.textContent).toContain('Bs.');
    expect(tasaElem.textContent).not.toContain('VES');
  });

  it('FilaTransaccionPago ante pago rechazado muestra "Motivo del entrenador:" en vez de "Motivo del Coach:"', () => {
    const txRechazada: TransaccionPagoDetalleDTO = {
      ...mockTxBase,
      estadoConciliacion: EstadoConciliacion.RECHAZADO,
      motivoRechazo: 'Referencia bancaria no encontrada en la cuenta.',
    };
    render(<FilaTransaccionPago tx={txRechazada} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);
    expect(screen.queryByText(/motivo del entrenador:/i)).not.toBeNull();
    expect(screen.queryByText(/motivo del coach:/i)).toBeNull();
  });
});

describe('ALU-12: Formato canónico de fecha de corte en TarjetaResumenCuota', () => {
  it('TarjetaResumenCuota formatea fechaCorteUtc con formatFechaLocal', () => {
    const fechaIso = '2026-11-15T12:00:00.000Z';
    const fechaEsperada = formatFechaLocal(fechaIso);
    render(
      <TarjetaResumenCuota
        cuota={{ ...mockCuotaBase, fechaCorteUtc: fechaIso }}
        tasaEfectivaNum={65}
        saldoVesProyectado="2.600,00"
      />
    );
    const corteElem = screen.getByText(/corte:/i);
    expect(corteElem.textContent).toContain(`Corte: ${fechaEsperada}`);
  });

  it('TarjetaResumenCuota muestra fallback "—" si fechaCorteUtc es inválida o vacía', () => {
    render(
      <TarjetaResumenCuota
        cuota={{ ...mockCuotaBase, fechaCorteUtc: 'fecha-no-valida' }}
        tasaEfectivaNum={65}
        saldoVesProyectado="2.600,00"
      />
    );
    const corteElem = screen.getByText(/corte:/i);
    expect(corteElem.textContent?.trim()).toBe('Corte: —');
  });
});

describe('ALU-13: Fallback seguro de fecha de operación en FilaTransaccionPago', () => {
  it('FilaTransaccionPago muestra "—" en lugar del valor crudo cuando la fechaOperacion no puede formatearse', () => {
    const txFechaInvalida: TransaccionPagoDetalleDTO = {
      ...mockTxBase,
      fechaOperacion: 'cadena-invalida-no-parseable',
    };
    render(<FilaTransaccionPago tx={txFechaInvalida} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);
    const fechaRefElem = screen.getByText(/fecha:/i);
    expect(fechaRefElem.textContent).toContain('Fecha: —');
    expect(fechaRefElem.textContent).not.toContain('cadena-invalida-no-parseable');
  });
});

describe('ALU-14 & ALU-15: Flex-wrap y prevención de desbordes en Pagos', () => {
  it('TarjetaResumenCuota incluye flex-wrap y gap-3 en el contenedor de saldo y total', () => {
    render(
      <TarjetaResumenCuota
        cuota={mockCuotaBase}
        tasaEfectivaNum={65}
        saldoVesProyectado="2.600,00"
      />
    );
    const etiquetaSaldo = screen.getByText('Saldo pendiente');
    const contenedor = etiquetaSaldo.closest('.flex');
    expect(contenedor).not.toBeNull();
    expect(contenedor?.className).toContain('flex-wrap');
    expect(contenedor?.className).toContain('gap-3');
  });

  it('FilaTransaccionPago no usa la clase capitalize en el método de pago', () => {
    render(<FilaTransaccionPago tx={mockTxBase} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);
    const metodoElem = screen.getByText(etiquetaMetodoPago(mockTxBase.metodoPago));
    expect(metodoElem.className).not.toContain('capitalize');
  });

  it('FilaTransaccionPago previene desbordes en la referencia bancaria con break-words o break-all y min-w-0', () => {
    const txLarga: TransaccionPagoDetalleDTO = {
      ...mockTxBase,
      referenciaBancaria: 'REF-BANCARIA-SUPER-LARGA-123456789012345678901234567890',
    };
    render(<FilaTransaccionPago tx={txLarga} onVerComprobante={vi.fn()} onCorregir={vi.fn()} />);
    const refElem = screen.getByText(new RegExp(txLarga.referenciaBancaria!));
    const clases = refElem.className;
    const tieneBreak = clases.includes('break-words') || clases.includes('break-all');
    const tieneMinW = clases.includes('min-w-0');
    expect(tieneBreak).toBe(true);
    expect(tieneMinW).toBe(true);
  });
});
