import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Job } from 'bullmq';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_MOTIVO_REVERSION_OBLIGATORIO,
  MENSAJE_REVERSION_SALDO_USADO,
  MENSAJE_REVERSION_SOLO_APROBADOS,
  MetodoPago,
  Moneda,
  RevertirPagoSchema,
  Rol,
} from '@guachafit/shared';
import { getTableColumns, getTableName, transaccionesPago } from '@guachafit/database';
import {
  FinanzasService,
  assertBalanceInvariant,
  estadoCuotaTrasRetirarAbono,
  toCents,
} from '../../src/modules/finanzas/finanzas.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { PagoRevertidoEvent } from '../../src/modules/notificaciones/events/eventos-notificacion';
import { construirJobIdNotificacion } from '../../src/modules/notificaciones/notificaciones.config';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { parsearContrato } from '../../src/common/errores/parsear-contrato';

/**
 * RF-007 · Reversión de un pago aprobado por error (API) — contratos 1–14 del prompt
 * `01-rf007-reversion-api-tests.md` y correcciones del lote de validación 07.
 *
 * Decisión del dueño (2026-10-11): solo el entrenador dueño revierte un pago aprobado (bandeja o
 * cobro en sala), en cualquier momento y con motivo obligatorio; la reversión deshace exactamente
 * la aprobación (devuelve a la cuota lo aplicado y quita del saldo a favor el excedente generado);
 * si el excedente ya se gastó, se bloquea con 409 (nunca saldo negativo); la transacción queda
 * `revertida` con su motivo, sin borrarse.
 *
 * La concurrencia REAL (reversión vs emisión y doble reversión) vive en
 * `rf007-reversion-concurrencia.e2e.spec.ts`; el mock de este archivo comparte referencias de fila
 * y no simula bloqueos.
 *
 * Mock de BD: réplica del de `rf006-saldo-favor.spec.ts` (drizzle mock en memoria) con el registro
 * de relecturas bloqueadas y el rollback simulado de `transaction`. Las columnas de la migración
 * `0020` (`motivo_reversion`, `fecha_reversion_utc`) se siembran como null, igual que su default
 * nullable en la base.
 */
describe('RF-007 · reversión de un pago aprobado (contratos 1–14 del prompt 01)', () => {
  // ===========================================================================
  // Infraestructura compartida: BD simulada en memoria (drizzle mock).
  // ===========================================================================
  let finanzasService: FinanzasService;
  let mockScheduler: any;
  let mockDb: any;

  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPerfilesAlumno: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];
  let mockForCalls: string[];

  const UUID_COACH = '11111111-1111-4111-8111-111111111111';
  const OTRO_COACH = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_USER = 'alumno-uuid-1';
  const PLAN = '99999999-9999-4999-8999-999999999999';

  /** `ahora` fijo: 09-10-2026 08:00 en Caracas; el corte por defecto vence el 10-10-2026. */
  const AHORA = new Date('2026-10-09T12:00:00.000Z');
  const CORTE_FUTURO = new Date('2026-10-10T03:59:59.999Z');
  const CORTE_VENCIDO = new Date('2026-10-08T03:59:59.999Z');

  /**
   * Valor del enum `enum_estado_conciliacion` (migración `0020`); el shared ya lo define en este
   * lote (`EstadoConciliacion.REVERTIDO`).
   */
  const ESTADO_REVERTIDO = EstadoConciliacion.REVERTIDO;

  const DTO_EFECTIVO_50 = {
    montoOriginal: '50.00',
    monedaOriginal: Moneda.USD,
    metodoPago: MetodoPago.EFECTIVO_USD,
    fechaOperacion: '2026-10-09',
  };

  type OpCondicion =
    | 'eq'
    | 'ne'
    | 'isNull'
    | 'isNotNull'
    | 'in'
    | 'notIn'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte';

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; op: OpCondicion }> {
    const conditions: Array<{ column: string; value: any; op: OpCondicion }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          let opText = '';
          for (const c of subsequent) {
            if (typeof c === 'string') {
              opText += ` ${c}`;
              continue;
            }
            if (Array.isArray(c)) continue;
            if (c && 'value' in c && !Array.isArray(c.value)) break;
            if (Array.isArray(c?.value)) opText += ` ${c.value.join(' ')}`;
          }
          const texto = opText.toLowerCase();

          const esNotIn = /\snot\s+in\s/.test(texto);
          const esIn = !esNotIn && /\sin\s/.test(texto);
          const comparador = texto.match(/>=|<=|>|</)?.[0];
          let op: OpCondicion = 'eq';
          if (texto.includes('is not null')) op = 'isNotNull';
          else if (texto.includes('is null')) op = 'isNull';
          else if (esNotIn) op = 'notIn';
          else if (esIn) op = 'in';
          else if (texto.includes('<>') || texto.includes('!=')) op = 'ne';
          else if (comparador === '>=') op = 'gte';
          else if (comparador === '<=') op = 'lte';
          else if (comparador === '>') op = 'gt';
          else if (comparador === '<') op = 'lt';

          if (op === 'isNull' || op === 'isNotNull') {
            conditions.push({ column: chunk.name, value: null, op });
            continue;
          }

          const params: any[] = [];
          for (const c of subsequent) {
            if (Array.isArray(c)) {
              for (const item of c) {
                if (
                  item &&
                  typeof item === 'object' &&
                  'value' in item &&
                  !Array.isArray(item.value) &&
                  !item.queryChunks
                ) {
                  params.push(item.value);
                }
              }
            } else if (
              c &&
              typeof c === 'object' &&
              'value' in c &&
              !Array.isArray(c.value) &&
              !c.queryChunks
            ) {
              params.push(c.value);
              break;
            }
          }

          if (params.length > 0) {
            conditions.push({
              column: chunk.name,
              value: op === 'in' || op === 'notIn' ? params : params[0],
              op,
            });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function valorDeColumna(record: any, columna: string): any {
    if (record[columna] !== undefined) return record[columna];
    return record[columna.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase())];
  }

  function compararValores(a: any, b: any): number {
    const normalizar = (v: any): any => {
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
      const numero = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(numero) && String(v).trim() !== '' ? numero : v;
    };
    const va = normalizar(a);
    const vb = normalizar(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  }

  function matchesField(record: any, cond: { column: string; value: any; op: OpCondicion }): boolean {
    const colVal = valorDeColumna(record, cond.column);

    switch (cond.op) {
      case 'ne':
        return colVal !== cond.value;
      case 'isNull':
        return colVal === null || colVal === undefined;
      case 'isNotNull':
        return colVal !== null && colVal !== undefined;
      case 'in':
        return Array.isArray(cond.value) && cond.value.includes(colVal);
      case 'notIn':
        return Array.isArray(cond.value) && !cond.value.includes(colVal);
      case 'gt':
        return compararValores(colVal, cond.value) > 0;
      case 'gte':
        return compararValores(colVal, cond.value) >= 0;
      case 'lt':
        return compararValores(colVal, cond.value) < 0;
      case 'lte':
        return compararValores(colVal, cond.value) <= 0;
      default:
        return colVal === cond.value;
    }
  }

  function extraerOrden(expr: any): { columna: string | null; direccion: 'asc' | 'desc' } {
    let columna: string | null = null;
    let direccion: 'asc' | 'desc' = 'asc';
    const visitar = (chunks: any[]) => {
      for (const c of chunks) {
        if (c && typeof c.name === 'string' && !columna) columna = c.name;
        if (c && Array.isArray(c.value)) {
          const texto = c.value.join(' ').toLowerCase();
          if (texto.includes('desc')) direccion = 'desc';
        }
        if (c && Array.isArray(c.queryChunks)) visitar(c.queryChunks);
      }
    };
    if (expr && Array.isArray(expr.queryChunks)) visitar(expr.queryChunks);
    return { columna, direccion };
  }

  function textoDeExpresion(expr: any): string {
    if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return '';
    const partes: string[] = [];
    const visitar = (chunks: any[]) => {
      for (const c of chunks) {
        if (Array.isArray(c?.value)) partes.push(c.value.join(' '));
        if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
      }
    };
    visitar(expr.queryChunks);
    return partes.join(' ').toLowerCase();
  }

  function buscarNombreColumna(expr: any): string | null {
    const visitar = (chunks: any[]): string | null => {
      for (const c of chunks) {
        if (c && typeof c.name === 'string') return c.name;
        if (c && Array.isArray(c.queryChunks)) {
          const encontrado = visitar(c.queryChunks);
          if (encontrado) return encontrado;
        }
      }
      return null;
    };
    return expr && Array.isArray(expr.queryChunks) ? visitar(expr.queryChunks) : null;
  }

  function esSeleccionAgregada(seleccion: any): boolean {
    return Boolean(
      seleccion &&
        typeof seleccion === 'object' &&
        Object.values(seleccion).some((valor) => {
          const texto = textoDeExpresion(valor);
          return texto.includes('count(') || texto.includes('sum(');
        })
    );
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

  /** Acceso a la MISMA referencia del store: las escrituras del mock deben persistir de verdad. */
  function getTablaCruda(tableName: string): any[] {
    if (tableName === 'planes_membresia') return mockPlanesMembresia;
    if (tableName === 'overrides_cliente_plan') return mockOverridesClientePlan;
    if (tableName === 'cuotas_membresia') return mockCuotasMembresia;
    if (tableName === 'transacciones_pago') return mockTransaccionesPago;
    if (tableName === 'tasas_cambio_referencia') return mockTasasCambioReferencia;
    if (tableName === 'perfiles_entrenador') return mockPerfilesEntrenador;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'usuarios') return mockUsuarios;
    return [];
  }

  function createMockDb() {
    const forCalls: string[] = [];

    const db: any = {
      __forCalls: forCalls,
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = [...baseData];

          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
            innerJoin: vi.fn(() => queryObj),
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                filtered = filtered.filter((item) =>
                  conditions.every((cond) => matchesField(item, cond))
                );
              }
              return queryObj;
            }),
            orderBy: vi.fn((...exprs: any[]) => {
              const criterios = exprs.map(extraerOrden).filter((c) => c.columna);
              if (criterios.length > 0) {
                filtered = [...filtered].sort((a, b) => {
                  for (const { columna, direccion } of criterios) {
                    const va = valorDeColumna(a, columna!);
                    const vb = valorDeColumna(b, columna!);
                    if (va === vb) continue;
                    const cmp = va > vb ? 1 : -1;
                    return direccion === 'desc' ? -cmp : cmp;
                  }
                  return 0;
                });
              }
              return queryObj;
            }),
            limit: vi.fn((count: number) => {
              limiteAplicado = count;
              return queryObj;
            }),
            offset: vi.fn((count: number) => {
              desplazamientoAplicado = count;
              return queryObj;
            }),
            for: vi.fn(() => {
              // Deja rastro de la relectura bloqueada (FOR UPDATE) por tabla.
              forCalls.push(tableName);
              return queryObj;
            }),
            then: (resolve: any) => {
              if (esSeleccionAgregada(fieldsSelection)) {
                const resultado: any = {};
                for (const [campo, expr] of Object.entries(fieldsSelection as Record<string, any>)) {
                  const texto = textoDeExpresion(expr);
                  if (texto.includes('count(')) {
                    resultado[campo] = filtered.length;
                  } else if (texto.includes('sum(')) {
                    const columna = buscarNombreColumna(expr);
                    const suma = filtered.reduce(
                      (acc, fila) => acc + Number(valorDeColumna(fila, columna!) ?? 0),
                      0
                    );
                    resultado[campo] = suma.toFixed(2);
                  }
                }
                return resolve([resultado]);
              }

              const pagina =
                limiteAplicado === null
                  ? filtered.slice(desplazamientoAplicado)
                  : filtered.slice(desplazamientoAplicado, desplazamientoAplicado + limiteAplicado);

              return resolve([...pagina]);
            },
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTablaCruda(tableName);

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
            const targetArray = getTablaCruda(tableName);
            const conditions = extractConditions(predicate);

            const updatedRecords: any[] = [];
            targetArray.forEach((item) => {
              const matches =
                conditions.length === 0 ||
                conditions.every((cond) => matchesField(item, cond));

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
      delete: vi.fn((table: any) => ({
        where: vi.fn((predicate: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTablaCruda(tableName);
          const conditions = extractConditions(predicate);
          for (let i = targetArray.length - 1; i >= 0; i--) {
            if (
              conditions.length === 0 ||
              conditions.every((cond) => matchesField(targetArray[i], cond))
            ) {
              targetArray.splice(i, 1);
            }
          }
          return Promise.resolve(undefined);
        }),
      })),
      execute: vi.fn().mockResolvedValue([]),
      // Rollback simulado: si el callback lanza, el estado en memoria vuelve al inicio de la
      // transacción (como PostgreSQL). Fija que un 404/409 de la reversión no deja escrituras a
      // medias.
      transaction: vi.fn(async (cb: any) => {
        const tablas = [
          'usuarios',
          'perfiles_entrenador',
          'perfiles_alumno',
          'planes_membresia',
          'overrides_cliente_plan',
          'cuotas_membresia',
          'transacciones_pago',
          'tasas_cambio_referencia',
        ];
        const snapshot = new Map<string, any[]>(
          tablas.map((nombre) => [nombre, getTablaCruda(nombre).map((fila) => ({ ...fila }))])
        );
        try {
          return await cb(db);
        } catch (error) {
          for (const nombre of tablas) {
            const filas = getTablaCruda(nombre);
            filas.splice(0, filas.length, ...(snapshot.get(nombre) as any[]));
          }
          throw error;
        }
      }),
    };
    return db;
  }

  function sembrarCuota(overrides: Record<string, any> = {}) {
    mockCuotasMembresia.push({
      id: `cuota-${mockCuotasMembresia.length + 1}`,
      clienteId: ALUMNO_USER,
      entrenadorId: UUID_COACH,
      planId: PLAN,
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      saldoAFavorAplicadoUsd: '0.00',
      fechaEmisionUtc: new Date('2026-09-10T12:00:00.000Z'),
      fechaCorteUtc: CORTE_FUTURO,
      estado: EstadoCuota.EMITIDA,
      notas: null,
      createdAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      updatedAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
  }

  function sembrarTransaccion(overrides: Record<string, any> = {}) {
    mockTransaccionesPago.push({
      id: `tx-${mockTransaccionesPago.length + 1}`,
      cuotaId: 'cuota-1',
      clienteId: ALUMNO_USER,
      entrenadorId: UUID_COACH,
      registradoPor: ALUMNO_USER,
      montoOriginal: '50.00',
      monedaOriginal: Moneda.USD,
      tasaCambioFijada: '1.0000',
      montoEquivalenteUsd: '50.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: null,
      fechaOperacion: '2026-10-05',
      comprobanteStorageKey: null,
      estadoConciliacion: EstadoConciliacion.PENDIENTE,
      motivoRechazo: null,
      excedenteUsd: '0.00',
      // Migración 0020: el mock acepta las columnas nuevas con su default (nullable → null).
      motivoReversion: null,
      fechaReversionUtc: null,
      fechaReporteUtc: new Date('2026-10-05T12:00:00.000Z'),
      fechaConciliacionUtc: null,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      ...overrides,
    });
    return mockTransaccionesPago[mockTransaccionesPago.length - 1];
  }

  /** Siembra un pago ya aprobado (p. ej. $50 sobre una cuota de $40 con $10 de excedente). */
  function sembrarPagoAprobado(
    cuota: any,
    overrides: Record<string, any> = {}
  ): any {
    return sembrarTransaccion({
      cuotaId: cuota.id,
      estadoConciliacion: EstadoConciliacion.APROBADO,
      fechaConciliacionUtc: new Date('2026-10-05T12:00:00.000Z'),
      ...overrides,
    });
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: UUID_COACH, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: ALUMNO_USER, email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesEntrenador = [
      {
        id: 'perfil-coach-1',
        usuarioId: UUID_COACH,
        nombres: 'Carlos',
        apellidos: 'Coach',
        tasaCambioGlobal: '60.0000',
      },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-1',
        usuarioId: ALUMNO_USER,
        entrenadorId: UUID_COACH,
        nombres: 'Pedro',
        apellidos: 'Pérez',
        tasaFijadaOverride: null,
        zonaHoraria: 'America/Caracas',
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: null,
        cicloAncla: null,
        proximoCorte: null,
        deletedAtUtc: null,
        saldoAFavorUsd: '0.00',
      },
    ];

    mockPlanesMembresia = [
      {
        id: PLAN,
        entrenadorId: UUID_COACH,
        nombre: 'Plan Mensual Estándar',
        descripcion: 'Acceso total',
        beneficios: ['Rutina'],
        precioBaseUsd: '40.00',
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
        entrenadorId: UUID_COACH,
        tasaOficialBcv: '60.0000',
        tasaParalelo: '65.0000',
        tasaActivaEntrenador: '60.0000',
        fuente: 'manual',
        fechaActualizacionUtc: new Date(),
      },
    ];

    mockDb = createMockDb();
    mockForCalls = mockDb.__forCalls;
    mockScheduler = {
      programarRecordatoriosCuota: vi.fn().mockResolvedValue([]),
      cancelarRecordatoriosCuota: vi.fn().mockResolvedValue(4),
    };
    finanzasService = new FinanzasService(mockDb, undefined, undefined, mockScheduler);
  });

  // ===========================================================================
  // A · Contrato compartido: enum, columnas, schema y endpoint (contratos 1–3)
  // ===========================================================================
  describe('A · contrato compartido (contratos 1–3 y endpoint)', () => {
    it('[C1] EstadoConciliacion.REVERTIDO = "revertido"', () => {
      expect((EstadoConciliacion as any).REVERTIDO).toBe('revertido');
    });

    it('[C2] transacciones_pago declara motivoReversion y fechaReversionUtc (texto y fecha, nullable)', () => {
      const columnas = getTableColumns(transaccionesPago) as Record<string, any>;

      expect(columnas.motivoReversion?.name).toBe('motivo_reversion');
      expect(columnas.motivoReversion?.dataType).toBe('string');
      expect(columnas.motivoReversion?.notNull).toBe(false);

      expect(columnas.fechaReversionUtc?.name).toBe('fecha_reversion_utc');
      expect(columnas.fechaReversionUtc?.dataType).toBe('date');
      expect(columnas.fechaReversionUtc?.notNull).toBe(false);
    });

    it('[C3] RevertirPagoSchema: motivo obligatorio, recortado y con tope de 500', () => {
      expect(MENSAJE_MOTIVO_REVERSION_OBLIGATORIO).toBe('Escribe el motivo de la reversión.');

      const schema = RevertirPagoSchema as any;
      expect(typeof schema?.safeParse).toBe('function');

      // Motivo ausente o solo espacios → inválido con el mensaje acordado.
      const vacio = schema.safeParse({ motivo: '   ' });
      expect(vacio.success).toBe(false);
      expect(vacio.error.issues[0].message).toBe('Escribe el motivo de la reversión.');

      // Más de 500 caracteres → inválido.
      expect(schema.safeParse({ motivo: 'a'.repeat(501) }).success).toBe(false);

      // Motivo válido → se recorta (trim) antes de persistirse.
      const valido = schema.safeParse({ motivo: '  Fondos no recibidos  ' });
      expect(valido.success).toBe(true);
      expect(valido.data.motivo).toBe('Fondos no recibidos');
    });

    it('[C3-400] el cuerpo sin motivo responde 400 en el borde HTTP (parsearContrato)', () => {
      expect(typeof (RevertirPagoSchema as any)?.safeParse).toBe('function');

      expect(() => parsearContrato(RevertirPagoSchema as any, {})).toThrow(BadRequestException);
      expect(() => parsearContrato(RevertirPagoSchema as any, { motivo: '' })).toThrow(
        BadRequestException
      );
    });

    it('[C-EP] POST transacciones/:id/revertir declarado con rol ENTRENADOR', () => {
      const handler = (FinanzasController.prototype as any).revertirTransaccion;

      expect(typeof handler).toBe('function');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('transacciones/:id/revertir');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Rol.ENTRENADOR]);
    });

    it('[C-EP-404] un :id que no es UUID responde 404 sin llamar al servicio', async () => {
      const revertir = vi.fn();
      const controller = new FinanzasController({ revertirTransaccion: revertir } as any);

      const promesa = controller.revertirTransaccion(
        { user: { entrenadorId: UUID_COACH } },
        'no-es-uuid',
        { motivo: 'Fondos no recibidos' }
      );

      const error = await promesa.catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.message).toBe('No encontramos ese pago. Actualiza la pantalla.');
      expect(revertir).not.toHaveBeenCalled();
    });

    it('[C-EP-400] sin motivo responde 400 con MENSAJE_MOTIVO_REVERSION_OBLIGATORIO sin llamar al servicio', async () => {
      const revertir = vi.fn();
      const controller = new FinanzasController({ revertirTransaccion: revertir } as any);

      // Cuerpo vacío: también 400 (el mensaje traducido es el genérico de campo faltante).
      const vacio = await controller
        .revertirTransaccion({ user: { entrenadorId: UUID_COACH } }, UUID_COACH, {})
        .catch((e) => e);
      expect(vacio).toBeInstanceOf(BadRequestException);
      expect(vacio.getStatus()).toBe(400);

      // "Sin motivo" desde la UI (campo en blanco): el mensaje acordado del contrato.
      const blanco = await controller
        .revertirTransaccion({ user: { entrenadorId: UUID_COACH } }, UUID_COACH, { motivo: '   ' })
        .catch((e) => e);
      expect(blanco).toBeInstanceOf(BadRequestException);
      expect(blanco.getStatus()).toBe(400);
      expect(blanco.message).toBe(MENSAJE_MOTIVO_REVERSION_OBLIGATORIO);
      expect(revertir).not.toHaveBeenCalled();
    });

    it('[C-EP-403] un ALUMNO recibe 403 del guard real; el entrenador dueño pasa', () => {
      const guard = new RolesGuard(new Reflector());
      const contexto = (rol: Rol) =>
        ({
          getHandler: () => FinanzasController.prototype.revertirTransaccion,
          getClass: () => FinanzasController,
          switchToHttp: () => ({ getRequest: () => ({ user: { sub: ALUMNO_USER, rol } }) }),
        }) as unknown as ExecutionContext;

      expect(() => guard.canActivate(contexto(Rol.ALUMNO))).toThrow(ForbiddenException);
      expect(guard.canActivate(contexto(Rol.ENTRENADOR))).toBe(true);
    });
  });

  // ===========================================================================
  // B · Función pura `estadoCuotaTrasRetirarAbono` (contrato 4)
  // ===========================================================================
  describe('B · estadoCuotaTrasRetirarAbono (contrato 4)', () => {
    it('[C4a] con otras transacciones pendientes manda pendiente_revision', () => {
      expect(
        estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaCorteUtc: CORTE_FUTURO,
          hayOtrasPendientes: true,
          ahora: AHORA,
        })
      ).toBe(EstadoCuota.PENDIENTE_REVISION);
    });

    it('[C4b] saldo 0 → al_dia', () => {
      expect(
        estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: '40.00',
          saldoPendienteUsd: '0.00',
          fechaCorteUtc: CORTE_FUTURO,
          hayOtrasPendientes: false,
          ahora: AHORA,
        })
      ).toBe(EstadoCuota.AL_DIA);
    });

    it('[C4c] abonado > 0 → abonada_parcial (aunque el corte ya haya vencido)', () => {
      expect(
        estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: '25.00',
          saldoPendienteUsd: '15.00',
          fechaCorteUtc: CORTE_VENCIDO,
          hayOtrasPendientes: false,
          ahora: AHORA,
        })
      ).toBe(EstadoCuota.ABONADA_PARCIAL);
    });

    it('[C4d] corte vencido sin abono → vencida', () => {
      expect(
        estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaCorteUtc: CORTE_VENCIDO,
          hayOtrasPendientes: false,
          ahora: AHORA,
        })
      ).toBe(EstadoCuota.VENCIDA);
    });

    it('[C4e] corte vigente sin abono → emitida', () => {
      expect(
        estadoCuotaTrasRetirarAbono({
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaCorteUtc: CORTE_FUTURO,
          hayOtrasPendientes: false,
          ahora: AHORA,
        })
      ).toBe(EstadoCuota.EMITIDA);
    });
  });

  // ===========================================================================
  // B · Regresión: el rechazo de `conciliarTransaccion` conserva sus estados
  // (contrato 4, segunda mitad: la regla extraída debe comportarse igual)
  // ===========================================================================
  describe('B · regresión: el rechazo conserva sus estados (contrato 4)', () => {
    it('[C4-reg1] otra pendiente en la cuota → pendiente_revision', async () => {
      const cuota = sembrarCuota({ id: 'cuota-reg1' });
      sembrarTransaccion({ id: 'tx-reg1-a', cuotaId: cuota.id });
      sembrarTransaccion({ id: 'tx-reg1-b', cuotaId: cuota.id });

      const res = await finanzasService.conciliarTransaccion('tx-reg1-a', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Referencia no encontrada',
      });

      expect(res.cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
    });

    it('[C4-reg2] cuota ya saldada por otro pago → al_dia', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-reg2',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarTransaccion({ id: 'tx-reg2', cuotaId: cuota.id });

      const res = await finanzasService.conciliarTransaccion('tx-reg2', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Pago duplicado',
      });

      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('[C4-reg3] cuota con abono parcial → abonada_parcial', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-reg3',
        montoAbonadoUsd: '25.00',
        saldoPendienteUsd: '15.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });
      sembrarTransaccion({ id: 'tx-reg3', cuotaId: cuota.id });

      const res = await finanzasService.conciliarTransaccion('tx-reg3', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Comprobante ilegible',
      });

      expect(res.cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
    });

    it('[C4-reg4] corte vencido sin abono → vencida', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-reg4',
        fechaCorteUtc: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      sembrarTransaccion({ id: 'tx-reg4', cuotaId: cuota.id });

      const res = await finanzasService.conciliarTransaccion('tx-reg4', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Fondos no recibidos',
      });

      expect(res.cuota.estado).toBe(EstadoCuota.VENCIDA);
    });

    it('[C4-reg5] corte vigente sin abono → emitida', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-reg5',
        fechaCorteUtc: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      sembrarTransaccion({ id: 'tx-reg5', cuotaId: cuota.id });

      const res = await finanzasService.conciliarTransaccion('tx-reg5', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Monto insuficiente',
      });

      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
    });
  });

  // ===========================================================================
  // C · `revertirTransaccion` (contratos 5–11)
  // ===========================================================================
  describe('C · revertirTransaccion (contratos 5–11)', () => {
    it('[C5] pago de $50 sobre una cuota de $40: devuelve la cuota y quita el excedente del saldo a favor', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c5' });
      sembrarTransaccion({ id: 'tx-c5', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      // Aprobación previa: la cuota queda al día y el perfil gana 10.00 de saldo a favor.
      await finanzasService.conciliarTransaccion('tx-c5', UUID_COACH, { accion: 'aprobar' });
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-c5',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      // Respuesta y transacción revertida con motivo y fecha.
      // Corrección 4 (readability): con excedente, el mensaje menciona el saldo a favor retirado.
      expect(res.mensaje).toBe(
        'Pago revertido. La cuota volvió a su saldo anterior y se descontaron 10.00 USD del saldo a favor del alumno.'
      );
      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
      expect(res.transaccion.motivoReversion).toBe('Fondos no recibidos');
      expect(res.transaccion.fechaReversionUtc).toBe(AHORA.toISOString());

      // La cuota vuelve a su estado previo a la aprobación (corte vigente → emitida).
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);

      // El saldo a favor vuelve a 0.00.
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C6] pago parcial de $25 sobre $40: la cuota vuelve a cero y el saldo a favor no cambia', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c6' });
      sembrarTransaccion({
        id: 'tx-c6',
        cuotaId: cuota.id,
        montoOriginal: '25.00',
        montoEquivalenteUsd: '25.00',
      });

      await finanzasService.conciliarTransaccion('tx-c6', UUID_COACH, { accion: 'aprobar' });
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('25.00');

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-c6',
        UUID_COACH,
        { motivo: 'Error de cobro' },
        AHORA
      );

      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
      // Sin excedente: el mensaje no menciona saldo a favor (corrección 4).
      expect(res.mensaje).toBe('Pago revertido. La cuota volvió a su saldo anterior.');
      // Sin excedente que retirar: el saldo a favor queda intacto.
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('5.00');
    });

    it('[C7] excedente ya gastado por una emisión posterior: 409 y nada cambia', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-c7',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, { id: 'tx-c7', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      // El saldo a favor actual es 0.00: una emisión posterior ya consumió los 10.00.
      mockPerfilesAlumno[0].saldoAFavorUsd = '0.00';

      const promesa = (finanzasService as any).revertirTransaccion(
        'tx-c7',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(
        'No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.'
      );

      // No cambia nada: ni la transacción, ni la cuota, ni el perfil.
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(mockTransaccionesPago[0].motivoReversion ?? null).toBeNull();
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('40.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('0.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C7-msg] MENSAJE_REVERSION_SALDO_USADO exportado con el texto acordado', () => {
      expect(MENSAJE_REVERSION_SALDO_USADO).toBe(
        'No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.'
      );
    });

    it('[C8] revertir un pago pendiente, rechazado o ya revertido: 409 solo-aprobados', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c8' });
      const casos: Array<{ nombre: string; estado: EstadoConciliacion }> = [
        { nombre: 'pendiente', estado: EstadoConciliacion.PENDIENTE },
        { nombre: 'rechazado', estado: EstadoConciliacion.RECHAZADO },
        { nombre: 'revertido', estado: ESTADO_REVERTIDO },
      ];

      for (const [indice, caso] of casos.entries()) {
        const tx = sembrarTransaccion({
          id: `tx-c8-${indice}`,
          cuotaId: cuota.id,
          estadoConciliacion: caso.estado,
          motivoRechazo: caso.estado === EstadoConciliacion.RECHAZADO ? 'Pago duplicado' : null,
        });

        const promesa = (finanzasService as any).revertirTransaccion(
          tx.id,
          UUID_COACH,
          { motivo: 'Intento indebido' },
          AHORA
        );

        await expect(promesa).rejects.toThrow(ConflictException);
        await expect(promesa).rejects.toThrow('Solo se puede revertir un pago aprobado.');
        expect(tx.estadoConciliacion).toBe(caso.estado);
      }
    });

    it('[C8-msg] MENSAJE_REVERSION_SOLO_APROBADOS exportado con el texto acordado', () => {
      expect(MENSAJE_REVERSION_SOLO_APROBADOS).toBe('Solo se puede revertir un pago aprobado.');
    });

    it('[C9] pago de otro entrenador: 404 (mismo mensaje de la conciliación) y sin cambios', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c9', entrenadorId: OTRO_COACH });
      const tx = sembrarPagoAprobado(cuota, {
        id: 'tx-c9',
        entrenadorId: OTRO_COACH,
        montoEquivalenteUsd: '40.00',
      });

      const promesa = (finanzasService as any).revertirTransaccion(
        'tx-c9',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      await expect(promesa).rejects.toThrow(NotFoundException);
      await expect(promesa).rejects.toThrow('No encontramos ese pago. Actualiza la pantalla.');
      expect(tx.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
    });

    it('[C10] pago de una cuota anulada: 409 y sin cambios', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c10', estado: EstadoCuota.ANULADA });
      const tx = sembrarPagoAprobado(cuota, { id: 'tx-c10', montoEquivalenteUsd: '40.00' });

      const promesa = (finanzasService as any).revertirTransaccion(
        'tx-c10',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow('No se puede revertir un pago de una cuota anulada.');
      expect(tx.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
    });

    it('[C11] un cobro en sala aprobado también se revierte con la misma lógica', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c11' });

      const cobro = await finanzasService.cobroDirecto(cuota.id, UUID_COACH, DTO_EFECTIVO_50);
      expect(cobro.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');

      const res = await (finanzasService as any).revertirTransaccion(
        cobro.transaccion.id,
        UUID_COACH,
        { motivo: 'Cobro duplicado en sala' },
        AHORA
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    // -------------------------------------------------------------------------
    // Correcciones del lote de validación 07: huecos de cobertura y referencias.
    // -------------------------------------------------------------------------

    it('[C4-5b] reversión con OTRA transacción pendiente en la misma cuota → pendiente_revision', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c45b' });
      sembrarTransaccion({ id: 'tx-c45b-a', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });
      // Aprobación real: la cuota queda al día y el perfil gana 10.00 de saldo a favor.
      await finanzasService.conciliarTransaccion('tx-c45b-a', UUID_COACH, { accion: 'aprobar' });
      // Otra transacción de la misma cuota sigue pendiente de revisión.
      sembrarTransaccion({ id: 'tx-c45b-b', cuotaId: cuota.id, montoEquivalenteUsd: '20.00' });

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-c45b-a',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(res.cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C15-legado] pago anterior a la 0019 (abonado > total, sin excedente): pendiente recalculado e invariante', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-legado',
        // Fila legada: antes de la 0019 el abono sumaba el monto completo (podía superar el total).
        montoAbonadoUsd: '50.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, {
        id: 'tx-legado',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '0.00',
      });

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-legado',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
      // El abonado nunca queda negativo y el pendiente se recalcula desde el total.
      expect(toCents(res.cuota.montoAbonadoUsd)).toBeGreaterThanOrEqual(0);
      assertBalanceInvariant(
        res.cuota.montoTotalUsd,
        res.cuota.montoAbonadoUsd,
        res.cuota.saldoPendienteUsd
      );
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C16-VES] reversión de un pago en VES: aplicado y excedente en centavos exactos', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-ves',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      // 3000.60 VES a tasa 60.0000 → 50.01 USD: aplicado 40.00 y excedente 10.01 (centavos exactos).
      sembrarPagoAprobado(cuota, {
        id: 'tx-ves',
        montoOriginal: '3000.60',
        monedaOriginal: Moneda.VES,
        tasaCambioFijada: '60.0000',
        montoEquivalenteUsd: '50.01',
        excedenteUsd: '10.01',
      });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.01';

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-ves',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(res.transaccion.montoOriginal).toBe('3000.60');
      expect(res.transaccion.monedaOriginal).toBe(Moneda.VES);
      expect(res.transaccion.excedenteUsd).toBe('10.01');
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.EMITIDA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
      expect(res.mensaje).toContain('10.01 USD');
    });

    it('[C17-archivado] alumno archivado: la reversión procede igual (sin 404), como la aprobación', async () => {
      // Comportamiento observado: el perfil se busca por usuario+entrenador sin filtrar
      // `deletedAtUtc`, así que un alumno archivado con excedente no recibe 404 y la reversión
      // procede de forma coherente. Se fija aquí para que un cambio futuro lo haga visible.
      mockPerfilesAlumno[0].deletedAtUtc = new Date('2026-10-01T00:00:00.000Z');
      const cuota = sembrarCuota({
        id: 'cuota-arch',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, {
        id: 'tx-arch',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '10.00',
      });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-arch',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C18-doble] segunda reversión del mismo pago: 409 y nada cambia', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-c18',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, { id: 'tx-c18', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      const primera = await (finanzasService as any).revertirTransaccion(
        'tx-c18',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );
      expect(primera.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);

      const segunda = (finanzasService as any).revertirTransaccion(
        'tx-c18',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );
      await expect(segunda).rejects.toThrow(ConflictException);
      await expect(segunda).rejects.toThrow('Solo se puede revertir un pago aprobado.');

      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C-REF-1] la referencia de un pago revertido se libera: el alumno la reenvía (pre-chequeo)', async () => {
      const cuota = sembrarCuota({ id: 'cuota-ref1' });
      sembrarTransaccion({
        id: 'tx-ref1-vieja',
        cuotaId: cuota.id,
        estadoConciliacion: ESTADO_REVERTIDO,
        referenciaBancaria: 'REF-7788',
        metodoPago: MetodoPago.PAGO_MOVIL,
        fechaOperacion: '2026-10-05',
      });

      const reenvio = await finanzasService.reportarPago(cuota.id, ALUMNO_USER, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'REF-7788',
        fechaOperacion: '2026-10-05',
      });

      expect(reenvio.esDuplicadoIdempotente).toBe(false);
      expect(reenvio.transaccion.referenciaBancaria).toBe('REF-7788');
      expect(reenvio.transaccion.estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(reenvio.cuota.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
    });

    it('[C-REF-2] un pago aprobado o pendiente con esa referencia sigue bloqueando (409)', async () => {
      const mensajeDuplicado =
        'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.';

      for (const estado of [EstadoConciliacion.APROBADO, EstadoConciliacion.PENDIENTE]) {
        const cuota = sembrarCuota({ id: `cuota-ref2-${estado}` });
        sembrarTransaccion({
          id: `tx-ref2-${estado}`,
          cuotaId: cuota.id,
          estadoConciliacion: estado,
          referenciaBancaria: 'REF-7788',
          metodoPago: MetodoPago.PAGO_MOVIL,
          fechaOperacion: '2026-10-05',
        });

        const promesa = finanzasService.reportarPago(cuota.id, ALUMNO_USER, {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'REF-7788',
          fechaOperacion: '2026-10-05',
        });

        await expect(promesa).rejects.toThrow(ConflictException);
        await expect(promesa).rejects.toThrow(mensajeDuplicado);
      }
    });

    it('[C-REM-1] con deuda, la reversión agenda recordatorios con la cuota, su corte y la zona del alumno', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-rem1',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, { id: 'tx-rem1', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      await (finanzasService as any).revertirTransaccion(
        'tx-rem1',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(1);
      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith({
        id: 'cuota-rem1',
        fechaCorteUtc: new Date(CORTE_FUTURO),
        zonaHoraria: 'America/Caracas',
      });
    });

    it('[C-REM-2] si la cuota queda sin deuda (otro pago la saldó), no se agendan recordatorios', async () => {
      // El pago se aprobó cuando la cuota ya estaba saldada: aplicó 0.00 y su monto completo quedó
      // como saldo a favor. Al revertirlo, la cuota sigue al día y no hay deuda que recordar.
      const cuota = sembrarCuota({
        id: 'cuota-rem2',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, {
        id: 'tx-rem2-b',
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '50.00',
      });
      mockPerfilesAlumno[0].saldoAFavorUsd = '50.00';

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-rem2-b',
        UUID_COACH,
        { motivo: 'Cobro duplicado en sala' },
        AHORA
      );

      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
    });

    it('[C-REM-3] un fallo del agendador no rompe la reversión (best-effort)', async () => {
      mockScheduler.programarRecordatoriosCuota.mockRejectedValue(new Error('Redis caído'));
      const cuota = sembrarCuota({
        id: 'cuota-rem3',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarPagoAprobado(cuota, { id: 'tx-rem3', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-rem3',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(1);
      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });
  });

  // ===========================================================================
  // D · Evento `PagoRevertidoEvent` (contrato 12)
  // ===========================================================================
  describe('D · evento PagoRevertidoEvent (contrato 12)', () => {
    it('[C12a] PagoRevertidoEvent.NOMBRE = "notificacion.pago-revertido"', () => {
      expect((PagoRevertidoEvent as any)?.NOMBRE).toBe('notificacion.pago-revertido');
    });

    it('[C12b] tras revertir se emite el evento al alumno con monto, motivo y datosAdicionales', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      const cuota = sembrarCuota({ id: 'cuota-c12' });
      sembrarPagoAprobado(cuota, {
        id: 'tx-c12',
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        montoEquivalenteUsd: '50.00',
        excedenteUsd: '10.00',
      });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      await (servicioConEventos as any).revertirTransaccion(
        'tx-c12',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(emitAsync).toHaveBeenCalledTimes(1);
      const [nombre, evento] = emitAsync.mock.calls[0];
      expect(nombre).toBe('notificacion.pago-revertido');
      expect(evento.payload.tipoEvento).toBe('PAGO_REVERTIDO');
      expect(evento.payload.categoria).toBe('FINANZAS');
      expect(evento.payload.titulo).toBe('Tu entrenador revirtió un pago');
      // El cuerpo nombra el monto original con su moneda y el motivo de la reversión.
      expect(evento.payload.cuerpo).toContain('50.00 USD');
      expect(evento.payload.cuerpo).toContain('Fondos no recibidos');
      expect(evento.payload.destinatarioUserId).toBe(ALUMNO_USER);
      expect(evento.payload.datosAdicionales).toEqual(
        expect.objectContaining({
          transaccionId: 'tx-c12',
          cuotaId: cuota.id,
          motivoReversion: 'Fondos no recibidos',
        })
      );
      // Corrección 1 (BLOCKER): la referencia lleva `_`, nunca `:` (BullMQ 5 rechaza `:`).
      expect(evento.payload.referenciaId).toBe('tx-c12_revertido');
      // Corrección 4 (readability): el aviso explica la consecuencia financiera.
      expect(evento.payload.cuerpo).toContain('Ese monto vuelve a figurar como pendiente en tu cuota.');
    });

    it('[C12-jobId] el jobId del aviso de reversión pasa la validación de BullMQ (sin ":")', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      const cuota = sembrarCuota({ id: 'cuota-c12j' });
      sembrarPagoAprobado(cuota, { id: 'tx-c12j', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      await (servicioConEventos as any).revertirTransaccion(
        'tx-c12j',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      const [, evento] = emitAsync.mock.calls[0];
      const jobId = construirJobIdNotificacion(evento.payload, AHORA);
      expect(jobId).not.toContain(':');

      // Misma validación que ejecuta `Job.addJob` antes de escribir en Redis (bullmq 5.81.4).
      const validar = (id: string) =>
        (Job.prototype as any).validateOptions.call(
          { opts: { jobId: id }, name: 'notif' },
          { data: {} }
        );
      expect(() => validar(jobId)).not.toThrow();

      // Regresión del BLOCKER: con el sufijo anterior (`:revertido`) BullMQ rechaza el id.
      const jobIdViejo = construirJobIdNotificacion(
        { ...evento.payload, referenciaId: 'tx-c12j:revertido' },
        AHORA
      );
      expect(() => validar(jobIdViejo)).toThrow('Custom Id cannot contain :');
    });

    it('[C12c] un fallo del bus no revierte nada (fire-and-forget)', async () => {
      const emitAsync = vi.fn().mockRejectedValue(new Error('bus caído'));
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      const cuota = sembrarCuota({ id: 'cuota-c12c' });
      sembrarPagoAprobado(cuota, { id: 'tx-c12c', montoEquivalenteUsd: '50.00', excedenteUsd: '10.00' });
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      const res = await (servicioConEventos as any).revertirTransaccion(
        'tx-c12c',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      // La reversión se completó pese al bus caído: nada se revirtió por el fallo.
      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });
  });

  // ===========================================================================
  // E · Agregados e invariante (contratos 13–14)
  // ===========================================================================
  describe('E · agregados e invariante (contratos 13–14)', () => {
    it('[C13a] los agregados del historial solo suman pagos aprobados: un revertido no cuenta', async () => {
      sembrarTransaccion({
        id: 'tx-c13-ok',
        estadoConciliacion: EstadoConciliacion.APROBADO,
        montoEquivalenteUsd: '50.00',
        fechaConciliacionUtc: new Date(),
        createdAtUtc: new Date(),
      });
      sembrarTransaccion({
        id: 'tx-c13-rev',
        estadoConciliacion: ESTADO_REVERTIDO,
        montoEquivalenteUsd: '50.00',
        motivoReversion: 'Fondos no recibidos',
        fechaReversionUtc: new Date(),
        createdAtUtc: new Date(),
      });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.totalPagadoHistoricoUsd).toBe('50.00');
      expect(resumen.totalPagadoMesActualUsd).toBe('50.00');
    });

    it('[C13b] tras revertir, el pago deja de contar en el recaudado del historial', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c13b' });
      sembrarTransaccion({
        id: 'tx-c13b',
        cuotaId: cuota.id,
        montoEquivalenteUsd: '50.00',
        createdAtUtc: new Date(),
      });

      await finanzasService.conciliarTransaccion('tx-c13b', UUID_COACH, { accion: 'aprobar' });
      const antes = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );
      expect(antes.totalPagadoHistoricoUsd).toBe('50.00');

      await (finanzasService as any).revertirTransaccion(
        'tx-c13b',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      const despues = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );
      expect(despues.totalPagadoHistoricoUsd).toBe('0.00');
      expect(despues.totalPagadoMesActualUsd).toBe('0.00');
    });

    it('[C14] invariante RNF-002 tras revertir: abonado <= total y pendiente = total − abonado', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c14' });
      sembrarTransaccion({ id: 'tx-c14', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      await finanzasService.conciliarTransaccion('tx-c14', UUID_COACH, { accion: 'aprobar' });

      const res = await (finanzasService as any).revertirTransaccion(
        'tx-c14',
        UUID_COACH,
        { motivo: 'Fondos no recibidos' },
        AHORA
      );

      expect(toCents(res.cuota.montoAbonadoUsd)).toBeLessThanOrEqual(
        toCents(res.cuota.montoTotalUsd)
      );
      expect(toCents(res.cuota.saldoPendienteUsd)).toBe(
        toCents(res.cuota.montoTotalUsd) - toCents(res.cuota.montoAbonadoUsd)
      );
      assertBalanceInvariant(
        res.cuota.montoTotalUsd,
        res.cuota.montoAbonadoUsd,
        res.cuota.saldoPendienteUsd
      );
    });
  });
});
