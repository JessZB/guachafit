// @vitest-environment jsdom
/**
 * 01 · UX-09b · useRecordatorioCartera (Contratos A8 y A9).
 *
 * A8: Demo sin red - con recordatoriosDemo vacío, vistaPrevia.puedeEnviar es true, motivo es 'listo'
 *     y cuerpo contiene el primer nombre. Con recordatoriosDemo con u-001, puedeEnviar es false y motivo 'cooldown_activo'.
 * A9: Sin temporizadores huérfanos - tras copiar, cerrarModalRecordatorio deja vi.getTimerCount() en 0.
 *     Tras copiar, unmount() deja vi.getTimerCount() en 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EstadoCuota, type FilaCarteraDTO } from '@guachafit/shared';
import { useRecordatorioCartera } from './useRecordatorioCartera';

vi.mock('../../../lib/api-client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '../../../lib/api-client';

function fixtureFila(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-001',
    alumnoPerfilId: 'p-001',
    alumnoNombre: 'Carlos Mendoza',
    cuotaId: 'c-001',
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T00:00:00.000Z',
    saldoPendienteUsd: '50.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 5,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: 'Plan Mensual',
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

describe('Contrato A8–A9 · useRecordatorioCartera con renderHook', () => {
  const fila = fixtureFila();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('A8 · Demo sin red', () => {
    it('en modo demo sin cooldown calcula vistaPrevia lista sin llamar a red', async () => {
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

      act(() => {
        result.current.abrirRecordatorio(fila);
      });

      expect(apiClient).not.toHaveBeenCalled();

      const hookCasteado = result.current as any;
      expect(hookCasteado.vistaPrevia).toBeTruthy();
      expect(hookCasteado.vistaPrevia.puedeEnviar).toBe(true);
      expect(hookCasteado.vistaPrevia.motivo).toBe('listo');
      expect(hookCasteado.vistaPrevia.cuerpo).toContain('Carlos');
    });

    it('en modo demo con cooldown previo calcula vistaPrevia bloqueada con cooldown_activo', async () => {
      const recordatoriosDemo: Record<string, string> = {
        'u-001': new Date().toISOString(),
      };
      const setRecordatoriosDemo = vi.fn();
      const recargar = vi.fn();

      const { result } = renderHook(() =>
        useRecordatorioCartera({
          isDemoMode: true,
          recordatoriosDemo,
          setRecordatoriosDemo,
          recargar,
        })
      );

      act(() => {
        result.current.abrirRecordatorio(fila);
      });

      expect(apiClient).not.toHaveBeenCalled();

      const hookCasteado = result.current as any;
      expect(hookCasteado.vistaPrevia).toBeTruthy();
      expect(hookCasteado.vistaPrevia.puedeEnviar).toBe(false);
      expect(hookCasteado.vistaPrevia.motivo).toBe('cooldown_activo');
    });
  });

  describe('A9 · Sin temporizadores huérfanos', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Caso 1: cerrarModalRecordatorio() limpia el temporizador de copiado y deja vi.getTimerCount() en 0', async () => {
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

      act(() => {
        result.current.abrirRecordatorio(fila);
      });

      await act(async () => {
        await result.current.handleEnviarRecordatorio();
      });

      await act(async () => {
        await result.current.copiarMensaje();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.copiado).toBe(true);

      act(() => {
        result.current.cerrarModalRecordatorio();
      });

      expect(vi.getTimerCount()).toBe(0);
    });

    it('Caso 2: unmount() del hook limpia el temporizador de copiado y deja vi.getTimerCount() en 0', async () => {
      let recordatoriosDemo: Record<string, string> = {};
      const setRecordatoriosDemo = vi.fn((cb) => {
        if (typeof cb === 'function') recordatoriosDemo = cb(recordatoriosDemo);
      });
      const recargar = vi.fn();

      const { result, unmount } = renderHook(() =>
        useRecordatorioCartera({
          isDemoMode: true,
          recordatoriosDemo,
          setRecordatoriosDemo,
          recargar,
        })
      );

      act(() => {
        result.current.abrirRecordatorio(fila);
      });

      await act(async () => {
        await result.current.handleEnviarRecordatorio();
      });

      await act(async () => {
        await result.current.copiarMensaje();
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.copiado).toBe(true);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
