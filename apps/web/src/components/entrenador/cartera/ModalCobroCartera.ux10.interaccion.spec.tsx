// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato D4 · ModalCobroCartera.
 *
 * D4: Las etiquetas "Moneda" y "Fecha de la operación" llevan text-muted-foreground
 *     y no text-foreground, igual que "Monto".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoCuota, Moneda, type FilaCarteraDTO } from '@guachafit/shared';
import { ModalCobroCartera } from './ModalCobroCartera';

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

describe('Contrato D4 · ModalCobroCartera (UX-10)', () => {
  it('D4 · las etiquetas "Moneda" y "Fecha de la operación" llevan text-muted-foreground y no text-foreground', () => {
    render(
      <ModalCobroCartera
        cobro={{
          fila: fixtureFila(),
          monto: '50.00',
          moneda: Moneda.USD,
          fechaOperacion: '2026-10-10',
          claveIdempotencia: 'idem-ux10',
        }}
        error={null}
        exito={null}
        enviando={false}
        sinPlan={false}
        sinTasa={false}
        saldoTexto="$50,00 USD"
        resumen={null}
        onCerrar={vi.fn()}
        onCambiarMonto={vi.fn()}
        onCambiarMoneda={vi.fn()}
        onCambiarFecha={vi.fn()}
        onRegistrar={vi.fn()}
      />
    );

    const labelMoneda = screen.getByText('Moneda');
    expect(labelMoneda.className).toContain('text-muted-foreground');
    expect(labelMoneda.className).not.toContain('text-foreground');

    const labelFecha = screen.getByText('Fecha de la operación');
    expect(labelFecha.className).toContain('text-muted-foreground');
    expect(labelFecha.className).not.toContain('text-foreground');
  });
});
