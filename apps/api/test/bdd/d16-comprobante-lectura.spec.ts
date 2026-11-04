import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  resolverComprobanteUrlCaso,
  type ContextoFinanzas,
} from '../../src/modules/finanzas/casos-finanzas/comprobantes';
import * as comprobantesModule from '../../src/modules/finanzas/casos-finanzas/comprobantes';
import { listarBandejaConciliacionCaso } from '../../src/modules/finanzas/casos-finanzas/bandeja-conciliacion';
import { obtenerCuotaPorIdCaso } from '../../src/modules/finanzas/casos-finanzas/cuotas-lectura';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  Rol,
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
} from '@guachafit/shared';

type ResolverComprobanteFn = (
  ctx: ContextoFinanzas,
  storageKey?: string | null,
  clienteId?: string
) => Promise<string | null>;

const resolverComprobante: ResolverComprobanteFn = resolverComprobanteUrlCaso as any;

describe('D16 / Lectura: Validación de comprobanteStorageKey al LEER (RF-007, RNF-001, ADR-007)', () => {
  const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';
  const OTRO_ALUMNO_ID = '22222222-2222-4222-8222-222222222222';
  const COACH_ID = '99999999-9999-4999-8999-999999999999';
  const UUID_ARCHIVO = '33333333-3333-4333-8333-333333333333';

  const CLAVE_PROPIA_WEBP = `comprobantes/${ALUMNO_ID}/2026/${UUID_ARCHIVO}.webp`;
  const CLAVE_PROPIA_JPEG = `comprobantes/${ALUMNO_ID}/2026/${UUID_ARCHIVO}.jpeg`;
  const CLAVE_PROPIA_JPG = `comprobantes/${ALUMNO_ID}/2026/${UUID_ARCHIVO}.jpg`;
  const CLAVE_OTRO_ALUMNO = `comprobantes/${OTRO_ALUMNO_ID}/2026/${UUID_ARCHIVO}.webp`;
  const CLAVE_ESTRUCTURA_INVALIDA_1 = 'comprobantes/recibo.jpg';
  const CLAVE_ESTRUCTURA_INVALIDA_2 = 'comprobantes/2026-09/transferencia-1295-ves.jpg';
  const CLAVE_PDF = `comprobantes/${ALUMNO_ID}/2026/${UUID_ARCHIVO}.pdf`;

  const URL_FIRMADA_MOCK = 'https://r2.test/presigned-get-url.webp';

  let r2Mock: { generarPresignedGetUrl: ReturnType<typeof vi.fn> };
  let ctxBase: ContextoFinanzas;

  beforeEach(() => {
    vi.restoreAllMocks();
    r2Mock = {
      generarPresignedGetUrl: vi.fn().mockResolvedValue(URL_FIRMADA_MOCK),
    };
    ctxBase = {
      db: {} as any,
      withTenant: vi.fn(),
      r2StorageService: r2Mock as any,
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
    } as unknown as ContextoFinanzas;
  });

  // ===========================================================================
  // 1. Unidad de resolverComprobanteUrlCaso
  // ===========================================================================
  describe('1. Unidad de resolverComprobanteUrlCaso', () => {
    it.each([
      ['webp', CLAVE_PROPIA_WEBP],
      ['jpeg', CLAVE_PROPIA_JPEG],
      ['jpg', CLAVE_PROPIA_JPG],
    ])('clave propia con extensión %s y clienteId devuelve URL firmada a 900s', async (_, clave) => {
      const url = await resolverComprobante(ctxBase, clave, ALUMNO_ID);
      expect(url).toBe(URL_FIRMADA_MOCK);
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledTimes(1);
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledWith(clave, 900);
    });

    it('clave undefined devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, undefined, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave null devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, null, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave vacía ("") devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, '', ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clienteId undefined devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_PROPIA_WEBP, undefined);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clienteId vacío ("") devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_PROPIA_WEBP, '');
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave de otro alumno devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_OTRO_ALUMNO, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave sin estructura ADR-007 (comprobantes/recibo.jpg) devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_ESTRUCTURA_INVALIDA_1, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave con estructura heredada no conforme (comprobantes/2026-09/...) devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_ESTRUCTURA_INVALIDA_2, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('clave con extensión .pdf devuelve null sin llamar a generarPresignedGetUrl', async () => {
      const url = await resolverComprobante(ctxBase, CLAVE_PDF, ALUMNO_ID);
      expect(url).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('sin r2StorageService devuelve null honesto', async () => {
      const ctxSinR2 = { ...ctxBase, r2StorageService: undefined };
      const url = await resolverComprobante(ctxSinR2, CLAVE_PROPIA_WEBP, ALUMNO_ID);
      expect(url).toBeNull();
    });

    it('cuando generarPresignedGetUrl lanza error, devuelve null y no propaga la excepción', async () => {
      r2Mock.generarPresignedGetUrl.mockRejectedValueOnce(new Error('S3 error de red'));
      const url = await resolverComprobante(ctxBase, CLAVE_PROPIA_WEBP, ALUMNO_ID);
      expect(url).toBeNull();
    });

    it('cuando generarPresignedGetUrl lanza error, devuelve null y warn se llama una vez sin clave, clienteId ni boom', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      try {
        r2Mock.generarPresignedGetUrl.mockRejectedValueOnce(new Error('boom clave-secreta'));
        const url = await resolverComprobante(ctxBase, CLAVE_PROPIA_WEBP, ALUMNO_ID);
        expect(url).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const args = warnSpy.mock.calls[0].map((arg) => String(arg)).join(' ');
        expect(args).not.toContain(CLAVE_PROPIA_WEBP);
        expect(args).not.toContain(ALUMNO_ID);
        expect(args).not.toContain('boom');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('aviso de clave inválida existente llama warn una vez sin contener la clave ni el clienteId', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      try {
        const url = await resolverComprobante(ctxBase, CLAVE_OTRO_ALUMNO, ALUMNO_ID);
        expect(url).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const args = warnSpy.mock.calls[0].map((arg) => String(arg)).join(' ');
        expect(args).not.toContain(CLAVE_OTRO_ALUMNO);
        expect(args).not.toContain(ALUMNO_ID);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('nunca lanza por claves con formato inesperado o caracteres especiales', async () => {
      await expect(
        resolverComprobante(ctxBase, '../../etc/passwd', ALUMNO_ID)
      ).resolves.toBeNull();
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 2. Puntos de firma 1 y 2
  // ===========================================================================
  describe('2. Puntos de firma en lectura: listarBandejaConciliacionCaso y obtenerCuotaPorIdCaso', () => {
    it('Punto 1 (listarBandejaConciliacionCaso): fila con clave propia produce comprobanteUrl; fila con clave de otro alumno o no conforme produce comprobanteUrl: null', async () => {
      const registros = [
        {
          tx: {
            id: 'tx-propia',
            cuotaId: 'cuota-1',
            clienteId: ALUMNO_ID,
            entrenadorId: COACH_ID,
            registradoPor: ALUMNO_ID,
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            tasaCambioFijada: '1.0000',
            montoEquivalenteUsd: '50.00',
            excedenteUsd: '0.00',
            metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
            referenciaBancaria: 'REF-PROP',
            fechaOperacion: '2026-11-01',
            comprobanteStorageKey: CLAVE_PROPIA_WEBP,
            estadoConciliacion: EstadoConciliacion.PENDIENTE,
            motivoRechazo: null,
            fechaReporteUtc: new Date('2026-11-01T10:00:00Z'),
            fechaConciliacionUtc: null,
            createdAtUtc: new Date('2026-11-01T10:00:00Z'),
            updatedAtUtc: new Date('2026-11-01T10:00:00Z'),
          },
          alumno: { nombres: 'Pedro', apellidos: 'Pérez' },
          cuota: { saldoPendienteUsd: '50.00' },
        },
        {
          tx: {
            id: 'tx-otro',
            cuotaId: 'cuota-1',
            clienteId: ALUMNO_ID,
            entrenadorId: COACH_ID,
            registradoPor: ALUMNO_ID,
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            tasaCambioFijada: '1.0000',
            montoEquivalenteUsd: '50.00',
            excedenteUsd: '0.00',
            metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
            referenciaBancaria: 'REF-OTRO',
            fechaOperacion: '2026-11-01',
            comprobanteStorageKey: CLAVE_OTRO_ALUMNO,
            estadoConciliacion: EstadoConciliacion.PENDIENTE,
            motivoRechazo: null,
            fechaReporteUtc: new Date('2026-11-01T11:00:00Z'),
            fechaConciliacionUtc: null,
            createdAtUtc: new Date('2026-11-01T11:00:00Z'),
            updatedAtUtc: new Date('2026-11-01T11:00:00Z'),
          },
          alumno: { nombres: 'Pedro', apellidos: 'Pérez' },
          cuota: { saldoPendienteUsd: '50.00' },
        },
        {
          tx: {
            id: 'tx-no-conforme',
            cuotaId: 'cuota-1',
            clienteId: ALUMNO_ID,
            entrenadorId: COACH_ID,
            registradoPor: ALUMNO_ID,
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            tasaCambioFijada: '1.0000',
            montoEquivalenteUsd: '50.00',
            excedenteUsd: '0.00',
            metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
            referenciaBancaria: 'REF-NOCONF',
            fechaOperacion: '2026-11-01',
            comprobanteStorageKey: CLAVE_ESTRUCTURA_INVALIDA_1,
            estadoConciliacion: EstadoConciliacion.PENDIENTE,
            motivoRechazo: null,
            fechaReporteUtc: new Date('2026-11-01T12:00:00Z'),
            fechaConciliacionUtc: null,
            createdAtUtc: new Date('2026-11-01T12:00:00Z'),
            updatedAtUtc: new Date('2026-11-01T12:00:00Z'),
          },
          alumno: { nombres: 'Pedro', apellidos: 'Pérez' },
          cuota: { saldoPendienteUsd: '50.00' },
        },
      ];

      const txMock: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([{ total: registros.length }])),
            leftJoin: vi.fn(() => ({
              leftJoin: vi.fn(() => ({
                where: vi.fn(() => ({
                  orderBy: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      offset: vi.fn(() => Promise.resolve(registros)),
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };

      const ctx: ContextoFinanzas = {
        ...ctxBase,
        withTenant: vi.fn(async (_rls, fn) => fn(txMock)),
      };

      const bandeja = await listarBandejaConciliacionCaso(ctx, COACH_ID);

      expect(bandeja.items).toHaveLength(3);
      expect(bandeja.items[0].comprobanteUrl).toBe(URL_FIRMADA_MOCK);
      expect(bandeja.items[1].comprobanteUrl).toBeNull();
      expect(bandeja.items[2].comprobanteUrl).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledTimes(1);
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledWith(CLAVE_PROPIA_WEBP, 900);
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalledWith(CLAVE_OTRO_ALUMNO, 900);
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalledWith(CLAVE_ESTRUCTURA_INVALIDA_1, 900);
    });

    it('Punto 2 (obtenerCuotaPorIdCaso): tx con clave propia produce comprobanteUrl; tx con clave de otro alumno o no conforme produce comprobanteUrl: null', async () => {
      const cuotaMock = {
        id: 'cuota-1',
        clienteId: ALUMNO_ID,
        entrenadorId: COACH_ID,
        planId: 'plan-1',
        periodo: '2026-11',
        montoTotalUsd: '50.00',
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '50.00',
        fechaEmisionUtc: new Date('2026-11-01T00:00:00Z'),
        fechaCorteUtc: new Date('2026-11-15T23:59:59Z'),
        estado: EstadoCuota.EMITIDA,
        createdAtUtc: new Date('2026-11-01T00:00:00Z'),
        updatedAtUtc: new Date('2026-11-01T00:00:00Z'),
      };

      const txPropia = {
        id: 'tx-1',
        cuotaId: 'cuota-1',
        clienteId: ALUMNO_ID,
        entrenadorId: COACH_ID,
        registradoPor: ALUMNO_ID,
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '0.00',
        metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
        referenciaBancaria: 'REF-PROP',
        fechaOperacion: '2026-11-01',
        comprobanteStorageKey: CLAVE_PROPIA_WEBP,
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        fechaReporteUtc: new Date('2026-11-01T10:00:00Z'),
        fechaConciliacionUtc: null,
        createdAtUtc: new Date('2026-11-01T10:00:00Z'),
        updatedAtUtc: new Date('2026-11-01T10:00:00Z'),
      };

      const txOtro = {
        id: 'tx-2',
        cuotaId: 'cuota-1',
        clienteId: ALUMNO_ID,
        entrenadorId: COACH_ID,
        registradoPor: ALUMNO_ID,
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '0.00',
        metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
        referenciaBancaria: 'REF-OTRO',
        fechaOperacion: '2026-11-01',
        comprobanteStorageKey: CLAVE_OTRO_ALUMNO,
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        fechaReporteUtc: new Date('2026-11-01T11:00:00Z'),
        fechaConciliacionUtc: null,
        createdAtUtc: new Date('2026-11-01T11:00:00Z'),
        updatedAtUtc: new Date('2026-11-01T11:00:00Z'),
      };

      const txNoConforme = {
        id: 'tx-3',
        cuotaId: 'cuota-1',
        clienteId: ALUMNO_ID,
        entrenadorId: COACH_ID,
        registradoPor: ALUMNO_ID,
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '0.00',
        metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
        referenciaBancaria: 'REF-NOCONF',
        fechaOperacion: '2026-11-01',
        comprobanteStorageKey: CLAVE_ESTRUCTURA_INVALIDA_1,
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        fechaReporteUtc: new Date('2026-11-01T12:00:00Z'),
        fechaConciliacionUtc: null,
        createdAtUtc: new Date('2026-11-01T12:00:00Z'),
        updatedAtUtc: new Date('2026-11-01T12:00:00Z'),
      };

      let selectCount = 0;
      const tasaMock = {
        id: 'tasa-1',
        entrenadorId: COACH_ID,
        tasaOficialBcv: '60.0000',
        tasaParalelo: '65.0000',
        tasaActivaEntrenador: '60.0000',
        fuente: 'entrenador_activa',
        fechaActualizacionUtc: new Date(),
      };

      const txMock: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => {
            const builder: any = {
              where: vi.fn(() => builder),
              orderBy: vi.fn(() => builder),
              limit: vi.fn(() => builder),
              offset: vi.fn(() => builder),
              then: (resolve: any) => {
                selectCount++;
                if (selectCount === 1) return resolve([cuotaMock]);
                if (selectCount === 2) return resolve([{ id: 'plan-1', nombre: 'Plan Fuerza' }]);
                if (selectCount === 3) return resolve([{ id: 'perf-1', usuarioId: ALUMNO_ID, nombres: 'Pedro', apellidos: 'Pérez' }]);
                if (selectCount === 4) return resolve([txPropia, txOtro, txNoConforme]);
                return resolve([tasaMock]);
              },
            };
            return builder;
          }),
        })),
      };

      const ctx: ContextoFinanzas = {
        ...ctxBase,
        withTenant: vi.fn(async (_rls, fn) => fn(txMock)),
      };

      const detalle = await obtenerCuotaPorIdCaso(ctx, 'cuota-1', ALUMNO_ID, Rol.ALUMNO);

      expect(detalle.transacciones).toHaveLength(3);
      expect(detalle.transacciones[0].comprobanteUrl).toBe(URL_FIRMADA_MOCK);
      expect(detalle.transacciones[1].comprobanteUrl).toBeNull();
      expect(detalle.transacciones[2].comprobanteUrl).toBeNull();
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledTimes(1);
      expect(r2Mock.generarPresignedGetUrl).toHaveBeenCalledWith(CLAVE_PROPIA_WEBP, 900);
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalledWith(CLAVE_OTRO_ALUMNO, 900);
      expect(r2Mock.generarPresignedGetUrl).not.toHaveBeenCalledWith(CLAVE_ESTRUCTURA_INVALIDA_1, 900);
    });
  });

  // ===========================================================================
  // 3. FinanzasService.resolverComprobanteUrl delega con (clave, clienteId)
  // ===========================================================================
  describe('3. FinanzasService.resolverComprobanteUrl', () => {
    it('delega en resolverComprobanteUrlCaso pasando la clave y el clienteId', async () => {
      const spy = vi.spyOn(comprobantesModule, 'resolverComprobanteUrlCaso');
      const finanzasService = new FinanzasService(
        {} as any,
        undefined,
        r2Mock as any,
        undefined,
        vi.fn(async (_rls, fn) => fn({}))
      );

      await (finanzasService as any).resolverComprobanteUrl(CLAVE_PROPIA_WEBP, ALUMNO_ID);

      expect(spy).toHaveBeenCalledWith(expect.anything(), CLAVE_PROPIA_WEBP, ALUMNO_ID);
    });
  });
});
