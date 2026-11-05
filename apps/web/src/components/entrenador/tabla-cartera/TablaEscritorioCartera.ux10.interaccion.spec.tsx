// @vitest-environment happy-dom
/**
 * 01 · UX-10 · Contratos E1, E2 · TablaEscritorioCartera.
 *
 * E1:
 * - La tabla tiene un caption (puede ser sr-only) que contiene "Control de cobros".
 * - Las celdas de cabecera (th) no llevan la clase uppercase.
 * E2:
 * - Con saldoPendienteUsd: '50.00' se ve "$50,00 USD" y no "$50.00 USD".
 * - En la pestaña revision, con montoReportado: '912.50' y monedaOriginal: 'VES', se ve "Bs. 912,50".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoCuota, MetodoPago, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { TablaEscritorioCartera } from './TablaEscritorioCartera';

afterEach(() => {
  cleanup();
});

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
    planNombre: 'Plan Fuerza',
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

describe('Contratos E1, E2 · TablaEscritorioCartera (UX-10)', () => {
  it('E1 · la tabla tiene un caption con "Control de cobros" y las celdas de cabecera th no llevan uppercase', () => {
    const fila = fixtureFila();
    const { container } = render(
      <TablaEscritorioCartera
        pestana="mora"
        filas={[fila]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
      />
    );

    // Caption presente y con "Control de cobros"
    const caption = container.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain('Control de cobros');

    // th sin clase uppercase (ni fila ni celdas)
    const ths = container.querySelectorAll('th');
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach((th) => {
      expect(th.className).not.toContain('uppercase');
    });

    const theadTr = container.querySelector('thead tr');
    expect(theadTr?.className).not.toContain('uppercase');
  });

  it('E2 · montos en formato venezolano: $50,00 USD en mora y Bs. 912,50 en revisión', () => {
    const filaMora = fixtureFila({ saldoPendienteUsd: '50.00' });
    const { unmount } = render(
      <TablaEscritorioCartera
        pestana="mora"
        filas={[filaMora]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
      />
    );

    expect(screen.getByText('$50,00 USD')).toBeTruthy();
    expect(screen.queryByText('$50.00 USD')).toBeNull();
    unmount();

    const filaRevision = fixtureFila({
      pagoId: 'p-1',
      montoReportado: '912.50',
      monedaOriginal: Moneda.VES,
      metodoPago: MetodoPago.PAGO_MOVIL,
    });

    render(
      <TablaEscritorioCartera
        pestana="revision"
        filas={[filaRevision]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    expect(screen.getByText(/Bs\.\s*912,50/)).toBeTruthy();
    expect(screen.queryByText(/912\.50\s*VES/)).toBeNull();
  });

  it('R2 · con saldoAFavorUsd: "10.00" muestra "A favor: $10,00 USD"', () => {
    const fila = fixtureFila({ saldoAFavorUsd: '10.00' });
    render(
      <TablaEscritorioCartera
        pestana="mora"
        filas={[fila]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
      />
    );

    expect(screen.getByText('A favor: $10,00 USD')).toBeTruthy();
  });
});
