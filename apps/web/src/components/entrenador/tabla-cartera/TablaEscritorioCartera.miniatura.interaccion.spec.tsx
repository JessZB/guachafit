// @vitest-environment happy-dom
/**
 * 01 · UX-09b · Miniatura del comprobante en TablaEscritorioCartera (Contrato D).
 *
 * D1: En la pestaña revision, con comprobanteUrl, se ve la img con alt="Comprobante de Carlos Mendoza".
 *     Tras fireEvent.error(img) la img desaparece y se ve "Comprobante no disponible".
 * D2: Sin comprobanteUrl se sigue viendo "Sin captura digital".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { TablaEscritorioCartera } from './TablaEscritorioCartera';

afterEach(() => {
  cleanup();
});

function filaRevision(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-001',
    alumnoPerfilId: 'al-001',
    alumnoNombre: 'Carlos Mendoza',
    cuotaId: 'cuota-1',
    estadoCuota: EstadoCuota.PENDIENTE_REVISION,
    fechaCorteUtc: '2026-10-01T23:59:59.000Z',
    saldoPendienteUsd: '35.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: null,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: null,
    periodo: '2026-10',
    pagoId: 'pago-1',
    montoReportado: '35.00',
    monedaOriginal: Moneda.USD,
    metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
    referenciaBancaria: 'REF-12345',
    comprobanteUrl: 'https://cdn.example.com/comprobante-1.webp',
    fechaReporteUtc: '2026-10-05T12:00:00.000Z',
    diasEspera: 2,
    telefonoWhatsapp: null,
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    ...parcial,
  };
}

describe('Contrato D · Miniatura del comprobante en TablaEscritorioCartera', () => {
  it('D1 · con comprobanteUrl muestra img con alt y al fallar carga muestra "Comprobante no disponible"', () => {
    const fila = filaRevision({
      comprobanteUrl: 'https://cdn.example.com/comprobante-carlos.webp',
      alumnoNombre: 'Carlos Mendoza',
    });

    render(
      <TablaEscritorioCartera
        pestana="revision"
        filas={[fila]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    const img = screen.getByRole('img', { name: 'Comprobante de Carlos Mendoza' });
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/comprobante-carlos.webp');

    fireEvent.error(img);

    expect(screen.queryByRole('img', { name: 'Comprobante de Carlos Mendoza' })).toBeNull();
    expect(screen.getByText('Comprobante no disponible')).toBeTruthy();
  });

  it('D2 · sin comprobanteUrl muestra "Sin captura digital"', () => {
    const fila = filaRevision({
      comprobanteUrl: null,
    });

    render(
      <TablaEscritorioCartera
        pestana="revision"
        filas={[fila]}
        onRecordatorio={vi.fn()}
        onCobrar={vi.fn()}
        onVerFicha={vi.fn()}
        onRevisarPago={vi.fn()}
      />
    );

    expect(screen.getByText('Sin captura digital')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
