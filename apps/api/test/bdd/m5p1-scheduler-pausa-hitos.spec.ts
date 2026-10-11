import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import * as moduloScheduler from '../../src/modules/finanzas/billing-scheduler.service';
import {
  BillingSchedulerService,
  PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS,
  TIEMPO_MAX_COLA_COBRANZA_MS,
} from '../../src/modules/finanzas/billing-scheduler.service';
import { instanteCorteUtc } from '../../src/modules/finanzas/suscripcion-ciclo';

/**
 * M5 · lote P1 (contrato D): planificador de cobranza
 * — pausa tras un `add`/`remove` que AGOTA el tope de cola y hitos SOLO futuros.
 *
 * D1/D2: tras un tiempo agotado (Redis colgado, `esperarConLimite` devuelve
 * `motivo: 'tiempo'`) se exporta `PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS = 60000` y durante
 * esos 60 s `programarRecordatoriosCuota`/`cancelarRecordatoriosCuota` devuelven cortos
 * (`[]` / `0`) SIN volver a golpear la cola. Pasados los 60 s, vuelven a intentarlo.
 * D3: un RECHAZO inmediato (redis abajo pero respondiendo) NO abre la pausa.
 * D4: tercer parámetro opcional `opciones?: { incluirMismoDia?: boolean }` (`true` por
 * defecto): con `false`, un hito de HOY cuya hora (09:00) ya pasó NO se agenda.
 *
 * En fase roja FALLA: la pausa no existe (el reintento ocurre de inmediato — se ve con el
 * contador de llamadas) y el tercer parámetro se ignora (quedan los 4 hitos).
 */
describe('M5 P1 · pausa del planificador tras tiempo agotado e hitos solo futuros (contrato D)', () => {
  const CUOTA_ID = 'cuota-d-mock';
  const AHORA = new Date('2026-10-01T00:00:00.000Z');
  const CORTE = new Date('2026-10-14T23:59:59.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('D0: se exporta PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS = 60000', () => {
    const exportado = (moduloScheduler as unknown as Record<string, unknown>)
      .PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS;
    expect(exportado).toBe(60_000);
  });

  it('D1: tras un add que agota la cola, programar devuelve [] sin llamar a add durante la pausa y vuelve tras 60 s', async () => {
    let colgada = true;
    const mockQueue = {
      add: vi.fn(() => (colgada ? new Promise(() => {}) : Promise.resolve({ id: 'job-d1' }))),
      remove: vi.fn().mockResolvedValue(1),
    };
    const scheduler = new BillingSchedulerService(mockQueue as any);

    // 1) El primer programar AGOTA el tope de la cola → [] con UNA sola llamada a add.
    const primera = scheduler.programarRecordatoriosCuota(
      { id: CUOTA_ID, fechaCorteUtc: CORTE },
      AHORA
    );
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
    expect(await primera).toEqual([]);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    // 2) DURANTE los 60 s de pausa: devuelve [] SIN volver a llamar a add.
    //    (El avance despierta el add colgado si hubiera un reintento: en fase roja el contador sube y falla.)
    const durantePausa = scheduler.programarRecordatoriosCuota(
      { id: CUOTA_ID, fechaCorteUtc: CORTE },
      AHORA
    );
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
    expect(await durantePausa).toEqual([]);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    // 3) Pasados los 60 s desde el tiempo agotado: vuelve a llamar a add.
    colgada = false;
    await vi.advanceTimersByTimeAsync(PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS);
    const trasLaPausa = scheduler.programarRecordatoriosCuota(
      { id: CUOTA_ID, fechaCorteUtc: CORTE },
      AHORA
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(await trasLaPausa).toEqual(['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
    expect(mockQueue.add.mock.calls.length).toBeGreaterThan(1);
  });

  it('D2: tras un remove que agota la cola, cancelar devuelve 0 sin llamar a remove durante la pausa y vuelve tras 60 s', async () => {
    let colgado = true;
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-d2' }),
      remove: vi.fn(() => (colgado ? new Promise(() => {}) : Promise.resolve(1))),
    };
    const scheduler = new BillingSchedulerService(mockQueue as any);

    const primera = scheduler.cancelarRecordatoriosCuota(CUOTA_ID);
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
    expect(await primera).toBe(0);
    expect(mockQueue.remove).toHaveBeenCalledTimes(1);

    const durantePausa = scheduler.cancelarRecordatoriosCuota(CUOTA_ID);
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
    expect(await durantePausa).toBe(0);
    expect(mockQueue.remove).toHaveBeenCalledTimes(1);

    colgado = false;
    await vi.advanceTimersByTimeAsync(PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS);
    const trasLaPausa = scheduler.cancelarRecordatoriosCuota(CUOTA_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(await trasLaPausa).toBe(4);
    expect(mockQueue.remove).toHaveBeenCalledTimes(5);
  });

  it('D3: un RECHAZO inmediato NO abre la pausa: la siguiente llamada vuelve a intentar add', async () => {
    const mockQueue = {
      add: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      remove: vi.fn().mockResolvedValue(1),
    };
    const scheduler = new BillingSchedulerService(mockQueue as any);

    expect(
      await scheduler.programarRecordatoriosCuota({ id: CUOTA_ID, fechaCorteUtc: CORTE }, AHORA)
    ).toEqual([]);
    expect(
      await scheduler.programarRecordatoriosCuota({ id: CUOTA_ID, fechaCorteUtc: CORTE }, AHORA)
    ).toEqual([]);

    // Ambas llamadas golpearon la cola: un rechazo (motivo 'error') no pausa.
    expect(mockQueue.add).toHaveBeenCalledTimes(2);
  });

  it('D4: con incluirMismoDia: false un hito de HOY cuya hora ya pasó NO se agenda (3 hitos, no 4)', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-d4' }),
      remove: vi.fn().mockResolvedValue(1),
    };
    const scheduler = new BillingSchedulerService(mockQueue as any);

    const corte = instanteCorteUtc('2026-10-14', 'Europe/Madrid');
    const ahora = new Date('2026-10-09T13:00:00.000Z'); // 15:00 en Madrid: el T-5 es HOY y las 09:00 ya pasaron

    const programados = await scheduler.programarRecordatoriosCuota(
      { id: CUOTA_ID, fechaCorteUtc: corte, zonaHoraria: 'Europe/Madrid' },
      ahora,
      { incluirMismoDia: false }
    );

    expect(programados).toEqual(['T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
    expect(mockQueue.add.mock.calls.some((c: any[]) => (c[1] as any)?.hito === 'T_MINUS_5')).toBe(
      false
    );
  });

  it('D4: sin opciones se mantiene el comportamiento actual (el mismo día se agenda con delay 0)', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-d4b' }),
      remove: vi.fn().mockResolvedValue(1),
    };
    const scheduler = new BillingSchedulerService(mockQueue as any);

    const corte = instanteCorteUtc('2026-10-14', 'Europe/Madrid');
    const ahora = new Date('2026-10-09T13:00:00.000Z');

    const programados = await scheduler.programarRecordatoriosCuota(
      { id: CUOTA_ID, fechaCorteUtc: corte, zonaHoraria: 'Europe/Madrid' },
      ahora
    );

    expect(programados).toEqual(['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
    const llamadaT5 = mockQueue.add.mock.calls.find((c: any[]) => (c[1] as any)?.hito === 'T_MINUS_5');
    expect(llamadaT5?.[2]?.delay).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Correcciones del lote (validación 08): contrato V5.
  // ---------------------------------------------------------------------------

  it('V5: durante la pausa, 5 llamadas producen UN solo aviso de pausa y una nueva pausa lo rearma', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const mockQueue = {
        add: vi.fn(() => new Promise(() => {})),
        remove: vi.fn().mockResolvedValue(1),
      };
      const scheduler = new BillingSchedulerService(mockQueue as any);
      const cuota = { id: CUOTA_ID, fechaCorteUtc: CORTE };
      const avisosDePausa = () =>
        warn.mock.calls.filter((c: any[]) => String(c[0]).includes('Cola de cobranza en pausa'))
          .length;

      // Abre la pausa: el primer add agota el tope (todavía sin aviso de pausa).
      const primera = scheduler.programarRecordatoriosCuota(cuota, AHORA);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      await primera;
      expect(avisosDePausa()).toBe(0);

      // 5 llamadas durante la pausa: UN único aviso; ninguna toca la cola.
      for (let i = 0; i < 5; i++) {
        expect(await scheduler.programarRecordatoriosCuota(cuota, AHORA)).toEqual([]);
      }
      expect(avisosDePausa()).toBe(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);

      // Pasada la ventana, un nuevo tiempo agotado reabre la pausa y vuelve a avisar (una vez).
      await vi.advanceTimersByTimeAsync(PAUSA_COLA_TRAS_TIEMPO_AGOTADO_MS + 1);
      const nueva = scheduler.programarRecordatoriosCuota(cuota, AHORA);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      await nueva;
      expect(await scheduler.programarRecordatoriosCuota(cuota, AHORA)).toEqual([]);
      expect(avisosDePausa()).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('V5: cuando la cola falla NO se registra el log "ninguno (sus hitos ya pasaron)"', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const mockQueue = {
        add: vi.fn(() => new Promise(() => {})),
        remove: vi.fn().mockResolvedValue(1),
      };
      const scheduler = new BillingSchedulerService(mockQueue as any);

      const promesa = scheduler.programarRecordatoriosCuota(
        { id: CUOTA_ID, fechaCorteUtc: CORTE },
        AHORA
      );
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      await promesa;

      const textos = log.mock.calls.map((c: any[]) => String(c[0]));
      expect(textos.some((t) => t.includes('ninguno (sus hitos ya pasaron)'))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it('V5: sin fallo de cola y sin hitos futuros, el cierre sí dice "ninguno (sus hitos ya pasaron)"', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-v5c' }),
        remove: vi.fn().mockResolvedValue(1),
      };
      const scheduler = new BillingSchedulerService(mockQueue as any);
      const cortePasado = new Date(AHORA.getTime() - 10 * 24 * 60 * 60 * 1000);

      const programados = await scheduler.programarRecordatoriosCuota(
        { id: CUOTA_ID, fechaCorteUtc: cortePasado },
        AHORA
      );

      expect(programados).toEqual([]);
      expect(mockQueue.add).not.toHaveBeenCalled();
      const textos = log.mock.calls.map((c: any[]) => String(c[0]));
      expect(textos.some((t) => t.includes('ninguno (sus hitos ya pasaron)'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
