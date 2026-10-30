// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contratos E2, E4, E5 · TarjetasMovilCartera.
 *
 * E2: Montos formateados: $50,00 USD y Bs. 912,50.
 * E4: Miniatura en móvil:
 *     - con comprobanteUrl: img alt="Comprobante de {alumnoNombre}"
 *     - tras fireEvent.error: "Comprobante no disponible"
 *     - sin URL: "Sin captura digital"
 * E5: Tarjeta móvil semántica: cada tarjeta es un article con nombre accesible del alumno
 *     (getByRole('article', { name: 'Carlos Mendoza' })).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoCuota, MetodoPago, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { TarjetasMovilCartera } from './TarjetasMovilCartera';

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

describe('Contratos E2, E4, E5 · TarjetasMovilCartera (UX-10)', () => {
  it('E5 · semántica: cada tarjeta móvil es un article con nombre accesible del alumno', () => {
    const fila = fixtureFila({ alumnoNombre: 'Carlos Mendoza' });
    render(
      <TarjetasMovilCartera
        pestana="mora"
        filas={[fila]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
      />
    );

    const article = screen.getByRole('article', { name: 'Carlos Mendoza' });
    expect(article).toBeTruthy();
  });

  it('E2 · montos en formato venezolano en móvil ($50,00 USD y Bs. 912,50)', () => {
    const filaMora = fixtureFila({ saldoPendienteUsd: '50.00' });
    const { unmount } = render(
      <TarjetasMovilCartera
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
      <TarjetasMovilCartera
        pestana="revision"
        filas={[filaRevision]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    expect(screen.getByText(/Bs\.\s*912,50/)).toBeTruthy();
  });

  it('E4 · miniatura del comprobante en móvil: carga, fallo y ausencia', () => {
    const filaConComprobante = fixtureFila({
      pagoId: 'p-1',
      alumnoNombre: 'Carlos Mendoza',
      comprobanteUrl: 'https://example.com/comprobante-carlos.webp',
      metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
    });

    const { unmount } = render(
      <TarjetasMovilCartera
        pestana="revision"
        filas={[filaConComprobante]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    const img = screen.getByRole('img', { name: 'Comprobante de Carlos Mendoza' });
    expect(img).toBeTruthy();

    fireEvent.error(img);
    expect(screen.getByText('Comprobante no disponible')).toBeTruthy();
    unmount();

    const filaSinComprobante = fixtureFila({
      pagoId: 'p-2',
      alumnoNombre: 'Mariana Pérez',
      comprobanteUrl: null,
      metodoPago: MetodoPago.EFECTIVO_USD,
    });

    render(
      <TarjetasMovilCartera
        pestana="revision"
        filas={[filaSinComprobante]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    expect(screen.getByText('Sin captura digital')).toBeTruthy();
  });
});
