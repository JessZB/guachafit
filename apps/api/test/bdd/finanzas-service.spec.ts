import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FinanzasService,
  toCents,
  fromCents,
  roundHalfToEven,
  addDecimals,
  subtractDecimals,
  multiplyDecimals,
  divideDecimalsBankers,
  assertBalanceInvariant,
} from '../../src/modules/finanzas/finanzas.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import {
  Rol,
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
} from '@guachafit/shared';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';

describe('Módulo 2: Finanzas & Deuda Maestra Bimonetaria (FinanzasService & FinanzasController)', () => {
  let finanzasService: FinanzasService;
  let finanzasController: FinanzasController;
  let mockDb: any;

  // In-memory data store for the mock database
  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPerfilesAlumno: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  function extractConditions(sqlObj: any): Array<{ column: string; value: any }> {
    const conditions: Array<{ column: string; value: any }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const nextParam = chunks.slice(i + 1).find((c: any) => c && 'value' in c && !Array.isArray(c.value));
          if (nextParam) {
            conditions.push({ column: chunk.name, value: nextParam.value });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(record: any, column: string, value: any): boolean {
    if (record[column] !== undefined) return record[column] === value;
    const camel = column.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    if (record[camel] !== undefined) return record[camel] === value;
    return false;
  }

  function normalizeRecord(item: any): any {
    if (!item) return item;
    if (!item.createdAtUtc) item.createdAtUtc = new Date();
    if (!item.updatedAtUtc) item.updatedAtUtc = new Date();
    return item;
  }

  function getTableArray(tableName: string): any[] {
    let arr: any[] = [];
    if (tableName === 'planes_membresia') arr = mockPlanesMembresia;
    else if (tableName === 'overrides_cliente_plan') arr = mockOverridesClientePlan;
    else if (tableName === 'cuotas_membresia') arr = mockCuotasMembresia;
    else if (tableName === 'transacciones_pago') arr = mockTransaccionesPago;
    else if (tableName === 'tasas_cambio_referencia') arr = mockTasasCambioReferencia;
    else if (tableName === 'perfiles_entrenador') arr = mockPerfilesEntrenador;
    else if (tableName === 'perfiles_alumno') arr = mockPerfilesAlumno;
    else if (tableName === 'usuarios') arr = mockUsuarios;
    return arr.map(normalizeRecord);
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = [...baseData];
          let isJoinedSelection = false;

          if (fieldsSelection && typeof fieldsSelection === 'object' && fieldsSelection.tx && fieldsSelection.alumno) {
            isJoinedSelection = true;
          }

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                filtered = filtered.filter((item) =>
                  conditions.every((cond) => matchesField(item, cond.column, cond.value))
                );
              }
              return queryObj;
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn((count: number) => {
              filtered = filtered.slice(0, count);
              return queryObj;
            }),
            for: vi.fn(() => queryObj),
            then: (resolve: any) => {
              if (isJoinedSelection) {
                const joined = filtered.map((tx) => {
                  const alumno = mockPerfilesAlumno.find((a) => a.usuarioId === tx.clienteId);
                  return { tx, alumno };
                });
                return resolve(joined);
              }
              return resolve([...filtered]);
            },
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          const record = {
            id: vals.id || `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };

          targetArray.push(record);

          return {
            returning: vi.fn().mockResolvedValue([record]),
            then: (resolve: any) => resolve([record]),
          };
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((setVals: any) => ({
          where: vi.fn((predicate: any) => {
            const tableName = table ? getTableName(table) : '';
            const targetArray = getTableArray(tableName);
            const conditions = extractConditions(predicate);

            const updatedRecords: any[] = [];
            targetArray.forEach((item) => {
              const matches =
                conditions.length === 0 ||
                conditions.every((cond) => matchesField(item, cond.column, cond.value));

              if (matches) {
                Object.assign(item, setVals);
                updatedRecords.push(item);
              }
            });

            return {
              returning: vi.fn().mockResolvedValue(updatedRecords.slice(0, 1)),
              then: (resolve: any) => resolve(updatedRecords.slice(0, 1)),
            };
          }),
        })),
      })),
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: 'coach-uuid-1', email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: 'alumno-uuid-1', email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesEntrenador = [
      {
        id: 'perfil-coach-1',
        usuarioId: 'coach-uuid-1',
        nombres: 'Carlos',
        apellidos: 'Coach',
        tasaCambioGlobal: '60.0000',
      },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-1',
        usuarioId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        nombres: 'Pedro',
        apellidos: 'Pérez',
        tasaFijadaOverride: null,
      },
    ];

    mockPlanesMembresia = [
      {
        id: 'plan-uuid-1',
        entrenadorId: 'coach-uuid-1',
        nombre: 'Plan Mensual Estándar',
        descripcion: 'Acceso total',
        beneficios: ['Rutina', 'Guía nutricional'],
        precioBaseUsd: '50.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      },
    ];

    mockOverridesClientePlan = [];
    mockCuotasMembresia = [];
    mockTransaccionesPago = [];
    mockTasasCambioReferencia = [
      {
        id: 'tasa-ref-1',
        entrenadorId: 'coach-uuid-1',
        tasaOficialBcv: '60.0000',
        tasaParalelo: '65.0000',
        tasaActivaEntrenador: '60.0000',
        fuente: 'manual',
        fechaActualizacionUtc: new Date(),
      },
    ];

    mockDb = createMockDb();
    finanzasService = new FinanzasService(mockDb);
    finanzasController = new FinanzasController(finanzasService);
  });

  // ===========================================================================
  // A. ARITMÉTICA DECIMAL Y REDONDEO BANCARIO (RNF-002)
  // ===========================================================================
  describe('1. Aritmética Decimal y Redondeo Bancario (Round Half to Even)', () => {
    it('debe convertir correctamente entre strings decimales y céntimos enteros (toCents / fromCents)', () => {
      expect(toCents('50.00')).toBe(5000);
      expect(toCents('123.45')).toBe(12345);
      expect(toCents('0.05')).toBe(5);
      expect(fromCents(5000)).toBe('50.00');
      expect(fromCents(12345)).toBe('123.45');
      expect(fromCents(5)).toBe('0.05');
    });

    it('debe redondear al par más cercano (Round Half to Even) mitigando sesgo estadístico', () => {
      expect(roundHalfToEven(2.505, 2)).toBe('2.50'); // 0 es par
      expect(roundHalfToEven(2.515, 2)).toBe('2.52'); // 1 es impar -> sube a 2
      expect(roundHalfToEven(2.525, 2)).toBe('2.52'); // 2 es par
      expect(roundHalfToEven(2.535, 2)).toBe('2.54'); // 3 es impar -> sube a 4
    });

    it('debe sumar y restar montos decimales sin acumulación de error flotante IEEE 754', () => {
      expect(addDecimals('0.10', '0.20')).toBe('0.30');
      expect(subtractDecimals('50.00', '19.99')).toBe('30.01');
    });

    it('debe certificar y exigir la invariante de balance (assertBalanceInvariant)', () => {
      expect(() => assertBalanceInvariant('50.00', '20.00', '30.00')).not.toThrow();
      expect(() => assertBalanceInvariant('50.00', '0.00', '50.00')).not.toThrow();
      expect(() => assertBalanceInvariant('50.00', '50.00', '0.00')).not.toThrow();

      // Discrepancia contable detectada
      expect(() => assertBalanceInvariant('50.00', '20.00', '25.00')).toThrow(
        /Violación de Invariante Contable/
      );
    });
  });

  // ===========================================================================
  // B. MOTOR BIMONETARIO (RF-006, ADR-003)
  // ===========================================================================
  describe('2. Motor Bimonetario y Resolución de Tasas', () => {
    it('debe priorizar tasa override del alumno sobre la tasa activa del entrenador', () => {
      const { tasaEfectiva, esTasaOverride, fuenteTasa } = finanzasService.resolverTasa(
        '60.0000',
        '55.0000'
      );
      expect(tasaEfectiva).toBe('55.0000');
      expect(esTasaOverride).toBe(true);
      expect(fuenteTasa).toBe('override_cliente');
    });

    it('debe utilizar la tasa global del entrenador si no hay override del alumno', () => {
      const { tasaEfectiva, esTasaOverride, fuenteTasa } = finanzasService.resolverTasa(
        '60.0000',
        null
      );
      expect(tasaEfectiva).toBe('60.0000');
      expect(esTasaOverride).toBe(false);
      expect(fuenteTasa).toBe('entrenador_activa');
    });

    it('debe proyectar correctamente el saldo en Bolívares: USD * Tasa', () => {
      const saldoVes = finanzasService.proyectarVES('50.00', '60.0000');
      expect(saldoVes).toBe('3000.00');
    });

    it('debe calcular contravalor USD exacto con redondeo bancario: VES / Tasa', () => {
      const contravalorUsd = finanzasService.calcularContravalorUSD('1500.00', '60.0000');
      expect(contravalorUsd).toBe('25.00');
    });

    it('debe calcular conversiones mediante calcularConversion (USD -> VES y VES -> USD)', async () => {
      const conversionUsdToVes = await finanzasService.calcularConversion(
        {
          monto: '50.00',
          monedaOrigen: Moneda.USD,
          monedaDestino: Moneda.VES,
        },
        'coach-uuid-1'
      );
      expect(conversionUsdToVes.montoConvertido).toBe('3000.00');
      expect(conversionUsdToVes.tasaAplicada).toBe('60.0000');

      const conversionVesToUsd = await finanzasService.calcularConversion(
        {
          monto: '1800.00',
          monedaOrigen: Moneda.VES,
          monedaDestino: Moneda.USD,
        },
        'coach-uuid-1'
      );
      expect(conversionVesToUsd.montoConvertido).toBe('30.00');
    });
  });

  // ===========================================================================
  // C. GESTIÓN DE TASAS DE CAMBIO (RF-006)
  // ===========================================================================
  describe('3. Gestión de Tasas de Cambio', () => {
    it('debe actualizar la tasa del entrenador y rechazar tasas menores o iguales a cero', async () => {
      const res = await finanzasService.actualizarTasa('coach-uuid-1', {
        tasaOficialBcv: '62.5000',
        tasaParalelo: '68.0000',
        tasaActivaEntrenador: '65.0000',
      });
      expect(res.tasaActivaEntrenador).toBe('65.0000');
      expect(res.tasaOficialBcv).toBe('62.5000');

      await expect(
        finanzasService.actualizarTasa('coach-uuid-1', {
          tasaOficialBcv: '0.0000',
          tasaActivaEntrenador: '65.0000',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('debe obtener la tasa vigente del entrenador y detectar override cuando aplique', async () => {
      mockPerfilesAlumno[0].tasaFijadaOverride = '58.0000';
      const tasaVigenteConOverride = await finanzasService.obtenerTasaVigente(
        'coach-uuid-1',
        'alumno-uuid-1'
      );
      expect(tasaVigenteConOverride.esTasaOverride).toBe(true);
      expect(tasaVigenteConOverride.tasaEfectiva).toBe('58.0000');
    });
  });

  // ===========================================================================
  // D. CATÁLOGO DE PLANES Y OVERRIDES (RF-005)
  // ===========================================================================
  describe('4. Catálogo de Planes y Overrides', () => {
    it('debe crear un plan estándar con sus beneficios y duración', async () => {
      const plan = await finanzasService.crearPlan('coach-uuid-1', {
        nombre: 'Plan Trimestral VIP',
        descripcion: 'Acceso total y seguimiento semanal',
        beneficios: ['Rutina personalizada', 'Pautas nutricionales', 'Acceso ilimitado'],
        precioBaseUsd: '120.00',
        duracionMeses: 3,
      });

      expect(plan.nombre).toBe('Plan Trimestral VIP');
      expect(plan.precioBaseUsd).toBe('120.00');
      expect(plan.duracionMeses).toBe(3);
      expect(plan.activo).toBe(true);
    });

    it('debe listar los planes creados por el entrenador', async () => {
      const planes = await finanzasService.listarPlanesPorEntrenador('coach-uuid-1');
      expect(planes.length).toBeGreaterThanOrEqual(1);
      expect(planes[0].entrenadorId).toBe('coach-uuid-1');
    });

    it('debe registrar un override de precio y tasa para un alumno específico', async () => {
      const override = await finanzasService.crearOverride('coach-uuid-1', {
        planId: 'plan-uuid-1',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '45.00',
        tasaFijadaOverride: '58.0000',
        motivoOverride: 'Descuento fidelidad 1 año',
      });

      expect(override.precioAcordadoUsd).toBe('45.00');
      expect(override.tasaFijadaOverride).toBe('58.0000');
      expect(override.motivoOverride).toBe('Descuento fidelidad 1 año');
    });
  });

  // ===========================================================================
  // E. EMISIÓN DE CUOTAS (RF-008, RNF-002)
  // ===========================================================================
  describe('5. Emisión de Cuotas Periódicas', () => {
    it('debe emitir una cuota con saldoPendienteUsd igual a montoTotalUsd y estado EMITIDA', async () => {
      const cuota = await finanzasService.emitirCuota('coach-uuid-1', {
        clienteId: 'alumno-uuid-1',
        planId: 'plan-uuid-1',
        periodo: '2026-09',
        montoTotalUsd: '50.00',
        fechaCorteUtc: '2026-09-30T23:59:59Z',
      });

      expect(cuota.periodo).toBe('2026-09');
      expect(cuota.montoTotalUsd).toBe('50.00');
      expect(cuota.montoAbonadoUsd).toBe('0.00');
      expect(cuota.saldoPendienteUsd).toBe('50.00');
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);
      expect(cuota.saldoPendienteVes).toBe('3000.00'); // 50 * 60 Bs
    });

    it('debe rechazar montos totales menores o iguales a cero', async () => {
      await expect(
        finanzasService.emitirCuota('coach-uuid-1', {
          clienteId: 'alumno-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-10',
          montoTotalUsd: '0.00',
          fechaCorteUtc: '2026-10-31T23:59:59Z',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // F. REPORTE DE PAGO E IDEMPOTENCIA (RF-007, RNF-002)
  // ===========================================================================
  describe('6. Reporte de Pago por el Alumno e Idempotencia', () => {
    beforeEach(() => {
      mockCuotasMembresia = [
        {
          id: 'cuota-test-1',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-09',
          montoTotalUsd: '50.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '50.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
          estado: EstadoCuota.EMITIDA,
        },
      ];
    });

    it('debe registrar el reporte, congelar tasa y transicionar la cuota a PENDIENTE_REVISION', async () => {
      const res = await finanzasService.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: '984521',
          fechaOperacion: '2026-09-06',
          comprobanteStorageKey: 'comprobantes/recibo.jpg',
        },
        'idemp-key-test-1'
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(res.transaccion.tasaCambioFijada).toBe('60.0000');
      expect(res.transaccion.montoEquivalenteUsd).toBe('25.00'); // 1500 / 60
      expect(res.cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
      expect(res.esDuplicadoIdempotente).toBe(false);
    });

    it('debe retornar la transacción previa sin duplicar si se reintenta con el mismo idempotencyKey', async () => {
      const payload = {
        montoOriginal: '1500.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-idem-001',
        fechaOperacion: '2026-09-06',
      };

      const primerIntento = await finanzasService.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        payload,
        'unique-key-abc'
      );
      expect(primerIntento.esDuplicadoIdempotente).toBe(false);

      const segundoIntento = await finanzasService.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        payload,
        'unique-key-abc'
      );
      expect(segundoIntento.esDuplicadoIdempotente).toBe(true);
      expect(segundoIntento.transaccion.id).toBe(primerIntento.transaccion.id);
    });

    it('debe rechazar reporte si otro alumno intenta reportar sobre la cuota ajena (Aislamiento Tenancy)', async () => {
      await expect(
        finanzasService.reportarPago(
          'cuota-test-1',
          'otro-alumno-hacker',
          {
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            metodoPago: MetodoPago.EFECTIVO_USD,
            fechaOperacion: '2026-09-06',
          }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe disparar notificación PAGO_REPORTADO al entrenador si dispatcherService está configurado', async () => {
      const mockDispatcher: any = {
        despacharEvento: vi.fn().mockResolvedValue({ inAppId: 'inapp-1' }),
      };
      const serviceConNotif = new FinanzasService(mockDb, mockDispatcher);

      await serviceConNotif.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        {
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-09-06',
        }
      );

      expect(mockDispatcher.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'PAGO_REPORTADO',
          destinatarioUserId: 'coach-uuid-1',
          categoria: 'FINANZAS',
          esCriticoSeguridad: false,
        })
      );
    });
  });

  // ===========================================================================
  // G. COBRO DIRECTO EN SALA (RF-007)
  // ===========================================================================
  describe('7. Cobro Directo en Sala por el Coach', () => {
    beforeEach(() => {
      mockCuotasMembresia = [
        {
          id: 'cuota-cobro-directo',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-09',
          montoTotalUsd: '50.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '50.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
          estado: EstadoCuota.EMITIDA,
        },
      ];
    });

    it('debe liquidar inmediatamente el cobro en efectivo USD actualizando la cuota', async () => {
      const res = await finanzasService.cobroDirecto(
        'cuota-cobro-directo',
        'coach-uuid-1',
        {
          montoOriginal: '30.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-09-06',
        }
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(res.cuota.montoAbonadoUsd).toBe('30.00');
      expect(res.cuota.saldoPendienteUsd).toBe('20.00');
      expect(res.cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
    });

    it('debe liquidar totalmente a AL_DIA si el cobro cubre el saldo remanente', async () => {
      const res = await finanzasService.cobroDirecto(
        'cuota-cobro-directo',
        'coach-uuid-1',
        {
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-09-06',
        }
      );

      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.montoAbonadoUsd).toBe('50.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('debe rechazar cobro directo si el método de pago no es efectivo', async () => {
      await expect(
        finanzasService.cobroDirecto(
          'cuota-cobro-directo',
          'coach-uuid-1',
          {
            montoOriginal: '50.00',
            monedaOriginal: Moneda.USD,
            metodoPago: MetodoPago.PAGO_MOVIL,
            fechaOperacion: '2026-09-06',
          }
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // H. CONCILIACIÓN CON BLOQUEO PESIMISTA (RNF-002, RF-007)
  // ===========================================================================
  describe('8. Conciliación de Transacciones con Bloqueo Pesimista (FOR UPDATE)', () => {
    beforeEach(() => {
      mockCuotasMembresia = [
        {
          id: 'cuota-conciliar-1',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-09',
          montoTotalUsd: '60.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '60.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
          estado: EstadoCuota.PENDIENTE_REVISION,
        },
      ];

      mockTransaccionesPago = [
        {
          id: 'tx-conciliar-1',
          cuotaId: 'cuota-conciliar-1',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          registradoPor: 'alumno-uuid-1',
          montoOriginal: '1800.00',
          monedaOriginal: Moneda.VES,
          tasaCambioFijada: '60.0000',
          montoEquivalenteUsd: '30.00',
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-conciliar-1',
          fechaOperacion: '2026-09-06',
          estadoConciliacion: EstadoConciliacion.PENDIENTE,
          motivoRechazo: null,
          fechaReporteUtc: new Date(),
          fechaConciliacionUtc: null,
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        },
      ];
    });

    it('debe aprobar el pago, reducir el saldo en USD y actualizar estado a ABONADA_PARCIAL', async () => {
      const res = await finanzasService.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'aprobar' }
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(res.cuota.montoAbonadoUsd).toBe('30.00');
      expect(res.cuota.saldoPendienteUsd).toBe('30.00');
      expect(res.cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
    });

    it('debe rechazar el pago exigiendo motivo y restaurar el estado anterior de la cuota', async () => {
      const res = await finanzasService.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'rechazar', motivoRechazo: 'Referencia bancaria inexistente' }
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.RECHAZADO);
      expect(res.transaccion.motivoRechazo).toBe('Referencia bancaria inexistente');
      // Saldo adeudado permanece intacto
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('60.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
    });

    it('debe exigir motivo de rechazo al rechazar', async () => {
      await expect(
        finanzasService.conciliarTransaccion(
          'tx-conciliar-1',
          'coach-uuid-1',
          { accion: 'rechazar', motivoRechazo: '' }
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('debe despachar evento PAGO_APROBADO con esCriticoSeguridad=true al conciliar exitosamente', async () => {
      const mockDispatcher: any = {
        despacharEvento: vi.fn().mockResolvedValue({ inAppId: 'inapp-2' }),
      };
      const serviceConNotif = new FinanzasService(mockDb, mockDispatcher);

      await serviceConNotif.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'aprobar' }
      );

      expect(mockDispatcher.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'PAGO_APROBADO',
          destinatarioUserId: 'alumno-uuid-1',
          categoria: 'FINANZAS',
          esCriticoSeguridad: true,
        })
      );
    });

    it('debe despachar evento PAGO_RECHAZADO al rechazar un pago', async () => {
      const mockDispatcher: any = {
        despacharEvento: vi.fn().mockResolvedValue({ inAppId: 'inapp-3' }),
      };
      const serviceConNotif = new FinanzasService(mockDb, mockDispatcher);

      await serviceConNotif.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'rechazar', motivoRechazo: 'Comprobante ilegible' }
      );

      expect(mockDispatcher.despacharEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'PAGO_RECHAZADO',
          destinatarioUserId: 'alumno-uuid-1',
          categoria: 'FINANZAS',
          esCriticoSeguridad: false,
        })
      );
    });
  });

  // ===========================================================================
  // I. BANDEJA DE CONCILIACIÓN FIFO (RF-007)
  // ===========================================================================
  describe('9. Bandeja de Conciliación del Entrenador (FIFO)', () => {
    it('debe listar transacciones en estado PENDIENTE ordenadas por fecha de reporte', async () => {
      mockTransaccionesPago = [
        {
          id: 'tx-1',
          cuotaId: 'cuota-1',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          registradoPor: 'alumno-uuid-1',
          montoOriginal: '1000.00',
          monedaOriginal: Moneda.VES,
          tasaCambioFijada: '60.0000',
          montoEquivalenteUsd: '16.67',
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-1',
          fechaOperacion: '2026-09-06',
          estadoConciliacion: EstadoConciliacion.PENDIENTE,
          fechaReporteUtc: new Date('2026-09-06T10:00:00Z'),
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        },
      ];

      const bandeja = await finanzasService.listarBandejaConciliacion('coach-uuid-1');
      expect(bandeja.length).toBe(1);
      expect(bandeja[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(bandeja[0].referenciaBancaria).toBe('ref-1');
      expect(bandeja[0].clienteNombre).toBe('Pedro Pérez');
    });
  });

  // ===========================================================================
  // J. CONTROLADOR REST Y RUTAS (05_Arquitectura/03_Contratos_API_Especificacion)
  // ===========================================================================
  describe('10. FinanzasController Endpoints & Decorators', () => {
    it('GET /finanzas/tasas/vigente debe consultar tasa para el usuario autenticado', async () => {
      const req = {
        user: { sub: 'coach-uuid-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-uuid-1' },
      };
      const res = await finanzasController.obtenerTasaVigente(req);
      expect(res.tasaEfectiva).toBe('60.0000');
    });

    it('POST /finanzas/planes debe validar y crear un plan', async () => {
      const req = {
        user: { sub: 'coach-uuid-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-uuid-1' },
      };
      const body = {
        nombre: 'Plan Calistenia Pro',
        beneficios: ['Rutina semanal', 'Soporte'],
        precioBaseUsd: '35.00',
      };
      const plan = await finanzasController.crearPlan(req, body);
      expect(plan.nombre).toBe('Plan Calistenia Pro');
    });

    it('PATCH /finanzas/transacciones/:id/conciliar debe delegar al servicio', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-c',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-09',
          montoTotalUsd: '50.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '50.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(),
          estado: EstadoCuota.PENDIENTE_REVISION,
        },
      ];
      mockTransaccionesPago = [
        {
          id: 'tx-c',
          cuotaId: 'cuota-c',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          registradoPor: 'alumno-uuid-1',
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
          tasaCambioFijada: '1.0000',
          montoEquivalenteUsd: '50.00',
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-09-06',
          estadoConciliacion: EstadoConciliacion.PENDIENTE,
          fechaReporteUtc: new Date(),
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        },
      ];

      const req = {
        user: { sub: 'coach-uuid-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-uuid-1' },
      };
      const res = await finanzasController.conciliarTransaccion(req, 'tx-c', {
        accion: 'aprobar',
      });
      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
    });
  });
});
