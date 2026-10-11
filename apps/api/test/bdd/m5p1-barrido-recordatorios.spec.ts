import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { EstadoCuota } from '@guachafit/shared';
import { BillingReminderProcessor } from '../../src/modules/finanzas/billing-reminder.processor';

/**
 * M5 · lote P1 (contrato F1): el barrido diario reponedor de recordatorios.
 *
 * `BillingReminderProcessor.procesarBarridoDiario` tras la EMISIÓN y el BARRIDO DE ESTADOS
 * llama a `finanzasService.reconciliarRecordatorios(ahora)`; `ResultadoBarrido` gana
 * `recordatoriosAgendados: number` (igual a `agendadas`). Si la reposición lanza, el barrido
 * termina igual con `recordatoriosAgendados: 0` y conserva los demás números. Orden:
 * emisión → estados → reposición.
 *
 * En fase roja FALLA: el processor aún no llama a `reconciliarRecordatorios` y el resultado
 * no trae `recordatoriosAgendados` (undefined).
 */
describe('M5 P1 · barrido diario con reposición de recordatorios (contrato F1)', () => {
  const CUOTA_ID = '123e4567-e89b-12d3-a456-426614174000';
  const AHORA = new Date('2026-10-09T12:00:00.000Z');
  const DIA_MS = 24 * 60 * 60 * 1000;

  let mockEventEmitter: any;
  let mockDlq: any;
  let mockFinanzas: any;

  function cuotaBase(overrides: Record<string, any> = {}) {
    return {
      id: CUOTA_ID,
      clienteId: '11111111-1111-4111-8111-111111111111',
      entrenadorId: '22222222-2222-4222-8222-222222222222',
      estado: EstadoCuota.EMITIDA,
      montoTotalUsd: '60.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '60.00',
      fechaCorteUtc: new Date(AHORA.getTime() + 3 * DIA_MS),
      ...overrides,
    };
  }

  function crearDbMock(filas: any[]) {
    const updates: Array<{ set: any }> = [];
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(filas),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((valores: any) => ({
          where: vi.fn(() => {
            updates.push({ set: valores });
            return Promise.resolve(undefined);
          }),
        })),
      })),
      transaction: vi.fn(async (cb: any) => cb(db)),
      execute: vi.fn(async () => undefined),
    };
    return { db, updates };
  }

  beforeEach(() => {
    mockEventEmitter = { emitAsync: vi.fn().mockResolvedValue([{ inAppId: 'inapp-1' }]) };
    mockDlq = { add: vi.fn().mockResolvedValue({ id: 'dlq-mock' }) };
    mockFinanzas = {
      obtenerTasaVigente: vi.fn().mockResolvedValue({ tasaEfectiva: '60.0000' }),
      proyectarVES: vi.fn((usd: string, tasa: string) =>
        (Number(usd) * Number(tasa)).toFixed(2)
      ),
      emitirCuotasProgramadas: vi
        .fn()
        .mockResolvedValue({ evaluadas: 1, emitidas: 1, omitidas: 0 }),
      // F1: reposición diaria — el processor aún no la invoca (fase roja: 0 llamadas).
      reconciliarRecordatorios: vi.fn().mockResolvedValue({ evaluadas: 1, agendadas: 2 }),
    };
  });

  it('F1: el barrido diario llama a reconciliarRecordatorios(ahora) y reporta recordatoriosAgendados', async () => {
    const { db } = crearDbMock([
      cuotaBase({ id: 'cuota-por-vencer' }),
      cuotaBase({
        id: 'cuota-vencida',
        estado: EstadoCuota.VENCIDA,
        fechaCorteUtc: new Date(AHORA.getTime() - DIA_MS),
      }),
    ]);
    mockFinanzas.reconciliarRecordatorios.mockResolvedValueOnce({ evaluadas: 2, agendadas: 2 });
    const processor = new BillingReminderProcessor(db, mockEventEmitter, mockFinanzas, mockDlq);

    const resultado = await processor.procesarBarridoDiario(AHORA);

    // La reposición corre con el mismo `ahora` del barrido.
    expect(mockFinanzas.reconciliarRecordatorios).toHaveBeenCalledTimes(1);
    expect(mockFinanzas.reconciliarRecordatorios).toHaveBeenCalledWith(AHORA);
    // nuevo número del resultado: igual a las `agendadas` del planificador
    expect(resultado.recordatoriosAgendados).toBe(2);
    // los demás números se conservan
    expect(resultado.cuotasEmitidas).toBe(1);
    expect(resultado.evaluadas).toBe(2);
    expect(resultado.actualizadas).toBe(1);
    expect(resultado.vencidas).toBe(1);
  });

  it('F1: el orden es emisión → barrido de estados → reposición', async () => {
    const { db } = crearDbMock([cuotaBase({ id: 'cuota-orden' })]);
    const processor = new BillingReminderProcessor(db, mockEventEmitter, mockFinanzas, mockDlq);

    await processor.procesarBarridoDiario(AHORA);

    expect(
      mockFinanzas.emitirCuotasProgramadas.mock.invocationCallOrder[0]
    ).toBeLessThan(db.select.mock.invocationCallOrder[0]);
    expect(mockFinanzas.reconciliarRecordatorios.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockFinanzas.emitirCuotasProgramadas.mock.invocationCallOrder[0]
    );
  });

  it('F1: si la reposición lanza, el barrido termina igual con recordatoriosAgendados 0 y conserva los números', async () => {
    const { db, updates } = crearDbMock([
      cuotaBase({ id: 'cuota-conserva' }),
      cuotaBase({
        id: 'cuota-conserva-vencida',
        estado: EstadoCuota.VENCIDA,
        fechaCorteUtc: new Date(AHORA.getTime() - DIA_MS),
      }),
    ]);
    mockFinanzas.reconciliarRecordatorios.mockRejectedValueOnce(new Error('ECONNREFUSED 6379'));
    const processor = new BillingReminderProcessor(db, mockEventEmitter, mockFinanzas, mockDlq);

    const resultado = await processor.procesarBarridoDiario(AHORA); // no propaga la reposición rota

    expect(resultado.recordatoriosAgendados).toBe(0);
    expect(resultado.cuotasEmitidas).toBe(1);
    expect(resultado.evaluadas).toBe(2);
    expect(resultado.actualizadas).toBe(1);
    expect(resultado.porVencer).toBe(1);
    expect(resultado.vencidas).toBe(1);
    expect(updates).toHaveLength(1);
    expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Correcciones del lote (validación 08): contrato V6.
  // ---------------------------------------------------------------------------

  it('V6: si la reposición lanza, el log de error nombra la reposición y el cierre dice que falló', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const { db } = crearDbMock([cuotaBase({ id: 'cuota-v6' })]);
      mockFinanzas.reconciliarRecordatorios.mockRejectedValueOnce(new Error('ECONNREFUSED 6379'));
      const processor = new BillingReminderProcessor(db, mockEventEmitter, mockFinanzas, mockDlq);

      const resultado = await processor.procesarBarridoDiario(AHORA);

      expect(resultado.recordatoriosAgendados).toBe(0);
      const errores = logError.mock.calls.map((c: any[]) => String(c[0]));
      expect(
        errores.some((t) => t.includes('No se pudieron reponer los recordatorios de cobranza'))
      ).toBe(true);
      const cierres = log.mock.calls.map((c: any[]) => String(c[0]));
      expect(cierres.some((t) => t.includes('la reposición de recordatorios falló'))).toBe(true);
      expect(cierres.some((t) => t.includes('cuotas con recordatorios repuestos'))).toBe(false);
    } finally {
      logError.mockRestore();
      log.mockRestore();
    }
  });
});
