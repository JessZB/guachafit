// @vitest-environment happy-dom
/**
 * 01 · UX-10 · Contrato F1 · useRecordatorioCartera.
 *
 * F1: components/entrenador/cartera/useRecordatorioCartera.ts: en modo demo,
 *     con saldoPendienteUsd: '50.00', el cuerpo de la vista previa y el mensajeSugerido
 *     del envío simulado contienen "$50,00 USD" y no "$50.00 USD".
 *     Probado con renderHook.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { EstadoCuota, type FilaCarteraDTO } from '@guachafit/shared';
import { useRecordatorioCartera } from './useRecordatorioCartera';

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

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
    telefonoWhatsapp: '+58 412-1234567',
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    ...parcial,
  };
}

describe('Contrato F1 · useRecordatorioCartera monto venezolano en demo (UX-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('F1 · el cuerpo de la vista previa y el mensajeSugerido simulado contienen "$50,00 USD" y no "$50.00 USD"', async () => {
    const fila = fixtureFila({ saldoPendienteUsd: '50.00' });
    let recordatoriosDemo: Record<string, string> = {};
    const setRecordatoriosDemo = vi.fn((cb) => {
      if (typeof cb === 'function') recordatoriosDemo = cb(recordatoriosDemo);
    });
    const recargar = vi.fn();

    const { result } = renderHook(() =>
      useRecordatorioCartera({
        isDemoMode: true,
        recordatoriosDemo,
        setRecordatoriosDemo,
        recargar,
      })
    );

    // 1. Abrir recordatorio -> preparar vista previa
    act(() => {
      result.current.abrirRecordatorio(fila);
    });

    const cuerpoVistaPrevia = result.current.vistaPrevia?.cuerpo ?? '';
    expect(cuerpoVistaPrevia).toContain('$50,00 USD');
    expect(cuerpoVistaPrevia).not.toContain('$50.00 USD');

    // 2. Enviar recordatorio simulado
    await act(async () => {
      await result.current.handleEnviarRecordatorio();
    });

    const mensajeSugerido = result.current.resultadoRecordatorio?.mensajeSugerido ?? '';
    expect(mensajeSugerido).toContain('$50,00 USD');
    expect(mensajeSugerido).not.toContain('$50.00 USD');
  });
});
