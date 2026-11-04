import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';

describe('D16 / Ítem 23: Validación de comprobanteStorageKey en reportarPago (Nivel Servicio)', () => {
  const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';
  const OTRO_ALUMNO_ID = '22222222-2222-4222-8222-222222222222';
  const COACH_ID = '99999999-9999-4999-8999-999999999999';
  const CUOTA_ID = 'cuota-d16-1';
  const UUID_COMPROBANTE = '33333333-3333-4333-8333-333333333333';

  let finanzasService: FinanzasService;
  let mockDb: any;
  let insercionesTransaccion: any[];

  beforeEach(() => {
    insercionesTransaccion = [];

    const cuotaMock = {
      id: CUOTA_ID,
      clienteId: ALUMNO_ID,
      entrenadorId: COACH_ID,
      planId: 'plan-uuid-1',
      periodo: '2026-11',
      montoTotalUsd: '50.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '50.00',
      fechaEmisionUtc: new Date(),
      fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
      estado: EstadoCuota.EMITIDA,
    };

    const tasaMock = {
      id: 'tasa-uuid-1',
      entrenadorId: COACH_ID,
      tasaOficialBcv: '60.0000',
      tasaParalelo: '65.0000',
      tasaActivaEntrenador: '60.0000',
      fuente: 'entrenador_activa',
      fechaActualizacionUtc: new Date(),
    };

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const queryObj: any = {
            where: vi.fn(() => queryObj),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn(() => queryObj),
            offset: vi.fn(() => queryObj),
            for: vi.fn(() => queryObj),
            then: (resolve: any) => {
              if (tableName === 'cuotas_membresia') {
                return resolve([{ ...cuotaMock }]);
              }
              if (tableName === 'tasas_cambio_referencia') {
                return resolve([{ ...tasaMock }]);
              }
              if (tableName === 'transacciones_pago') {
                return resolve([]);
              }
              return resolve([]);
            },
          };
          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          if (tableName === 'transacciones_pago') {
            insercionesTransaccion.push(vals);
          }
          const record = {
            id: vals.id || `tx-uuid-${Date.now()}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };
          return {
            returning: vi.fn().mockResolvedValue([record]),
            then: (resolve: any) => resolve([record]),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...cuotaMock, estado: EstadoCuota.PENDIENTE_REVISION }]),
            then: (resolve: any) => resolve([{ ...cuotaMock, estado: EstadoCuota.PENDIENTE_REVISION }]),
          })),
        })),
      })),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (cb: any) => cb(mockDb)),
    };

    finanzasService = new FinanzasService(mockDb);
  });

  const basePayload = {
    montoOriginal: '1200.00',
    monedaOriginal: Moneda.VES,
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: '984521',
    fechaOperacion: '2026-11-03',
  };

  describe('Casos válidos (persisten y responden 201/éxito)', () => {
    it.each(['webp', 'jpeg', 'jpg'])(
      'acepta clave propia con extensión %s y la persiste',
      async (extension) => {
        const storageKey = `comprobantes/${ALUMNO_ID}/2026/${UUID_COMPROBANTE}.${extension}`;
        const res = await finanzasService.reportarPago(
          CUOTA_ID,
          ALUMNO_ID,
          {
            ...basePayload,
            comprobanteStorageKey: storageKey,
          },
          `idemp-valida-${extension}`
        );

        expect(res.transaccion.comprobanteStorageKey).toBe(storageKey);
        expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
        expect(mockDb.insert).toHaveBeenCalled();
        expect(insercionesTransaccion).toHaveLength(1);
        expect(insercionesTransaccion[0].comprobanteStorageKey).toBe(storageKey);
      }
    );

    it.each([undefined, ''])(
      'acepta comprobanteStorageKey ausente, undefined o cadena vacía y persiste null',
      async (claveVacia) => {
        const res = await finanzasService.reportarPago(
          CUOTA_ID,
          ALUMNO_ID,
          {
            ...basePayload,
            comprobanteStorageKey: claveVacia,
          },
          `idemp-vacia-${String(claveVacia)}`
        );

        expect(res.transaccion.comprobanteStorageKey).toBeNull();
        expect(mockDb.insert).toHaveBeenCalled();
      }
    );
  });

  describe('Casos inválidos (deben fallar con 400 y mensaje exacto antes de BD)', () => {
    async function afirmarRechazoComprobante(storageKey: string, idempotencyKey: string) {
      let error: any;
      try {
        await finanzasService.reportarPago(
          CUOTA_ID,
          ALUMNO_ID,
          {
            ...basePayload,
            comprobanteStorageKey: storageKey,
          },
          idempotencyKey
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe('El comprobante adjunto no es válido.');
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(insercionesTransaccion).toHaveLength(0);
    }

    it('rechaza comprobante perteneciente a otro alumno', async () => {
      const storageKey = `comprobantes/${OTRO_ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`;
      await afirmarRechazoComprobante(storageKey, 'idemp-otro-alumno');
    });

    it('rechaza clave perteneciente a un módulo ajeno (antropometria)', async () => {
      const storageKey = `antropometria/${ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`;
      await afirmarRechazoComprobante(storageKey, 'idemp-modulo-ajeno');
    });

    it('rechaza claves sin la estructura jerárquica esperada (recibo plano o cualquier cadena)', async () => {
      await afirmarRechazoComprobante('comprobantes/recibo.jpg', 'idemp-sin-estructura-1');
      await afirmarRechazoComprobante('cualquier-cosa-larga', 'idemp-sin-estructura-2');
    });

    it('rechaza intento de recorrido de ruta (path traversal)', async () => {
      const storageKey = `comprobantes/${ALUMNO_ID}/../${OTRO_ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`;
      await afirmarRechazoComprobante(storageKey, 'idemp-path-traversal');
    });

    it('rechaza extensión pdf aunque el regex general de R2 lo admita', async () => {
      const storageKey = `comprobantes/${ALUMNO_ID}/2026/${UUID_COMPROBANTE}.pdf`;
      await afirmarRechazoComprobante(storageKey, 'idemp-pdf');
    });
  });
});
