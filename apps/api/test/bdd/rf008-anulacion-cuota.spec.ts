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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
  Rol,
} from '@guachafit/shared';
import type { AnularCuotaDTO } from '@guachafit/shared';
import { getTableColumns, getTableName } from '@guachafit/database';
import { cuotasMembresia } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { RolesGuard } from '../../src/common/guards/roles.guard';

/**
 * RF-008 · Anulación de cuotas (lote API, prompt 01).
 *
 * Contratos A–D del prompt `01-anulacion-cuotas-tests.md` (en verde):
 * - A: shared (`MENSAJE_*`, `AnularCuotaSchema`, `AnularCuotaDTO`, campos de `CuotaDetalleDTO`).
 * - B: migración `0022` + columnas Drizzle (`motivoAnulacion`, `fechaAnulacionUtc`, `anuladaPor`).
 * - C: `FinanzasService.anularCuota` casos 1–12.
 * - D: ruta `POST /finanzas/cuotas/:id/anular`.
 *
 * Los efectos sobre otras rutas (contratos E1–E6) viven en
 * `rf008-anulacion-cuota-efectos.spec.ts`; la concurrencia (F1–F2) en
 * `rf008-anulacion-cuota-concurrencia.e2e.spec.ts`.
 *
 * Siguen la decisión del dueño del 2026-10-12: las anuladas no ocupan su
 * periodo (ver E5–E6 en el spec de efectos).
 *
 * Textos acordados (contrato A): se escriben como literales del contrato y el
 * bloque A fija que los exports de `@guachafit/shared` coinciden con ellos.
 * Los nombres del contrato se resuelven con `import()` dinámico: un `import`
 * estático de un export inexistente rompería la COLECCIÓN del archivo (fallo
 * de montaje), mientras que aquí cada test debe fallar por la razón esperada
 * del contrato, no por sintaxis ni montaje.
 *
 * Mock de BD: réplica del de `rf007-reversion-pago-aprobado.spec.ts` (drizzle
 * mock en memoria) con el registro de relecturas bloqueadas y el rollback
 * simulado de `transaction`. Las columnas de la migración `0022`
 * (`motivo_anulacion`, `fecha_anulacion_utc`, `anulada_por`) se siembran como
 * null, igual que su default nullable en la base.
 */
describe('RF-008 · anulación de cuotas, contratos A–D', () => {
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

  /** `ahora` fijo: 09-10-2026 08:00 en Caracas; el periodo de los fixtures es 2026-10 → 10/2026. */
  const AHORA = new Date('2026-10-09T12:00:00.000Z');
  const CORTE_FUTURO = new Date('2026-10-10T03:59:59.999Z');

  // Textos acordados del contrato A (la sección A fija que el shared los exporta tal cual).
  const MENSAJE_MOTIVO = 'Escribe el motivo de la anulación.';
  const MENSAJE_EN_REVISION = 'Primero aprueba o rechaza el pago en revisión de esta cuota.';
  const MENSAJE_CON_APROBADOS = 'No se puede anular una cuota con pagos aprobados.';
  const MENSAJE_YA_ANULADA = 'Esta cuota ya está anulada.';
  const MENSAJE_CONCILIACION_ANULADA = 'No se puede conciliar un pago de una cuota anulada.';
  const MENSAJE_CUOTA_NO_ENCONTRADA = 'No encontramos esa cuota. Actualiza la pantalla.';

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
      // transacción (como PostgreSQL). Fija que un 404/409 de la anulación no deja escrituras a
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
      // Migración 0022: el mock acepta las columnas nuevas con su default (nullable → null).
      motivoAnulacion: null,
      fechaAnulacionUtc: null,
      anuladaPor: null,
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
      fechaReporteUtc: new Date('2026-10-05T12:00:00.000Z'),
      fechaConciliacionUtc: null,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      ...overrides,
    });
    return mockTransaccionesPago[mockTransaccionesPago.length - 1];
  }

  /**
   * Puerta del contrato C: devuelve `FinanzasService.anularCuota` ligada.
   * Defensa de montaje: si la función faltara, el test que la usa falla con
   * este mensaje explícito (razón esperada: contrato sin implementar), no con
   * un error de montaje. Con la implementación en verde, el helper es
   * transparente y los casos corren de verdad.
   */
  function exigirAnularCuota(): (
    cuotaId: string,
    entrenadorId: string,
    dto: AnularCuotaDTO,
    ahora?: Date
  ) => Promise<any> {
    const fn = (finanzasService as any).anularCuota;
    if (typeof fn !== 'function') {
      throw new Error('NO_IMPLEMENTADO (contrato C): FinanzasService.anularCuota no está disponible.');
    }
    return fn.bind(finanzasService);
  }

  /** Igual que `exigirAnularCuota`, pero para la ruta del contrato D. */
  function exigirHandlerAnular(): (...args: any[]) => Promise<any> {
    const handler = (FinanzasController.prototype as any).anularCuota;
    if (typeof handler !== 'function') {
      throw new Error(
        'NO_IMPLEMENTADO (contrato D): FinanzasController.anularCuota (POST cuotas/:id/anular) no está disponible.'
      );
    }
    return handler;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: UUID_COACH, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: OTRO_COACH, email: 'otro@guachafit.com', rol: Rol.ENTRENADOR },
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
  // A · Contrato compartido: mensajes, schema, DTO y campos de CuotaDetalleDTO
  // ===========================================================================
  describe('A · contrato compartido (@guachafit/shared)', () => {
    it('[A-msg] exporta los cinco mensajes con los textos acordados', async () => {
      const shared = (await import('@guachafit/shared')) as any;

      expect(shared.MENSAJE_MOTIVO_ANULACION_OBLIGATORIO).toBe(MENSAJE_MOTIVO);
      expect(shared.MENSAJE_ANULACION_PAGO_EN_REVISION).toBe(MENSAJE_EN_REVISION);
      expect(shared.MENSAJE_ANULACION_CON_PAGOS_APROBADOS).toBe(MENSAJE_CON_APROBADOS);
      expect(shared.MENSAJE_CUOTA_YA_ANULADA).toBe(MENSAJE_YA_ANULADA);
      expect(shared.MENSAJE_CONCILIACION_CUOTA_ANULADA).toBe(MENSAJE_CONCILIACION_ANULADA);
    });

    it('[A-schema] AnularCuotaSchema: motivo obligatorio, recortado y con tope de 500', async () => {
      const shared = (await import('@guachafit/shared')) as any;
      const schema = shared.AnularCuotaSchema;
      expect(typeof schema?.safeParse).toBe('function');

      // Motivo solo con espacios → inválido con el mensaje acordado.
      const espacios = schema.safeParse({ motivo: '   ' });
      expect(espacios.success).toBe(false);
      expect(espacios.error.issues[0].message).toBe(MENSAJE_MOTIVO);

      // Cuerpo vacío → inválido con el mismo mensaje.
      const vacio = schema.safeParse({});
      expect(vacio.success).toBe(false);
      expect(
        vacio.error.issues.some((issue: any) => issue.message === MENSAJE_MOTIVO)
      ).toBe(true);

      // Más de 500 caracteres → inválido.
      expect(schema.safeParse({ motivo: 'a'.repeat(501) }).success).toBe(false);

      // Motivo válido → se recorta (trim) antes de persistirse.
      const valido = schema.safeParse({ motivo: '  Error de emisión  ' });
      expect(valido.success).toBe(true);
      expect(valido.data.motivo).toBe('Error de emisión');
    });

    it('[A-DTO] AnularCuotaDTO existe como inferencia de AnularCuotaSchema', async () => {
      // Uso de tipo (lo verifica `tsc`): el DTO viaja como `{ motivo }` validado.
      const dto: AnularCuotaDTO = { motivo: 'Error de emisión' };
      expect(dto.motivo).toBe('Error de emisión');

      const shared = (await import('@guachafit/shared')) as any;
      expect(typeof shared.AnularCuotaSchema?.safeParse).toBe('function');
    });

    it('[A-DTO-cuota] CuotaDetalleDTO gana motivoAnulacion y fechaAnulacionUtc (ISO)', async () => {
      // `CuotaDetalleDTO` es un tipo (sin huella en runtime): su evidencia en
      // ejecución es que la persistencia expone ambos campos — ver [B-col], [C8]
      // y [E3c]. Aquí se fija el proxy de columnas.
      const columnas = getTableColumns(cuotasMembresia) as Record<string, any>;
      expect(columnas.motivoAnulacion).toBeDefined();
      expect(columnas.fechaAnulacionUtc).toBeDefined();
    });
  });

  // ===========================================================================
  // B · Base de datos: migración 0022 + schema de Drizzle
  // ===========================================================================
  describe('B · base de datos (migración 0022 y Drizzle)', () => {
    it('[B-mig] existe la migración 0022 con motivo_anulacion, fecha_anulacion_utc, anulada_por y su FK a usuarios', () => {
      const dir = resolve(process.cwd(), '..', '..', 'packages', 'database', 'drizzle');
      expect(existsSync(dir)).toBe(true);

      const archivos = readdirSync(dir).filter((nombre) => /^0022_.*\.sql$/.test(nombre));
      expect(archivos.length).toBeGreaterThan(0);

      const contenido = readFileSync(resolve(dir, archivos[0]), 'utf8').toLowerCase();
      expect(contenido).toContain('motivo_anulacion');
      expect(contenido).toContain('fecha_anulacion_utc');
      expect(contenido).toContain('anulada_por');
      expect(contenido).toContain('usuarios');
    });

    it('[B-col] cuotas_membresia declara motivoAnulacion, fechaAnulacionUtc y anuladaPor (nullable)', () => {
      const columnas = getTableColumns(cuotasMembresia) as Record<string, any>;

      expect(columnas.motivoAnulacion?.name).toBe('motivo_anulacion');
      expect(columnas.motivoAnulacion?.notNull).toBe(false);

      expect(columnas.fechaAnulacionUtc?.name).toBe('fecha_anulacion_utc');
      expect(columnas.fechaAnulacionUtc?.notNull).toBe(false);

      expect(columnas.anuladaPor?.name).toBe('anulada_por');
      expect(columnas.anuladaPor?.notNull).toBe(false);
    });
  });

  // ===========================================================================
  // C · `FinanzasService.anularCuota` (contratos C1–C12)
  // ===========================================================================
  describe('C · anularCuota (contratos 1–12)', () => {
    it('[C0] FinanzasService.anularCuota existe con la firma del contrato', () => {
      expect(typeof (finanzasService as any).anularCuota).toBe('function');
    });

    it('[C1] motivo vacío → 400 con MENSAJE_MOTIVO_ANULACION_OBLIGATORIO', async () => {
      const anularCuota = exigirAnularCuota();
      sembrarCuota({ id: 'cuota-c1' });

      const promesa = anularCuota('cuota-c1', UUID_COACH, { motivo: '   ' }, AHORA);

      await expect(promesa).rejects.toThrow(BadRequestException);
      await expect(promesa).rejects.toThrow(MENSAJE_MOTIVO);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
    });

    it('[C2a] cuota inexistente → 404 uniforme', async () => {
      const anularCuota = exigirAnularCuota();

      const promesa = anularCuota('cuota-que-no-existe', UUID_COACH, { motivo: 'Error' }, AHORA);

      await expect(promesa).rejects.toThrow(NotFoundException);
      await expect(promesa).rejects.toThrow(MENSAJE_CUOTA_NO_ENCONTRADA);
    });

    it('[C2b] cuota de otro entrenador → el mismo 404 y sin cambios', async () => {
      const anularCuota = exigirAnularCuota();
      sembrarCuota({ id: 'cuota-c2b', entrenadorId: OTRO_COACH });

      const promesa = anularCuota('cuota-c2b', UUID_COACH, { motivo: 'Error' }, AHORA);

      await expect(promesa).rejects.toThrow(NotFoundException);
      await expect(promesa).rejects.toThrow(MENSAJE_CUOTA_NO_ENCONTRADA);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
      expect(mockCuotasMembresia[0].motivoAnulacion ?? null).toBeNull();
    });

    it('[C3] ya anulada → 409 sin cambiar motivo/fecha y sin emitir evento', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      (servicioConEventos as any).anularCuota = (finanzasService as any).anularCuota;
      const anularCuota = (() => {
        const fn = (servicioConEventos as any).anularCuota;
        if (typeof fn !== 'function') {
          throw new Error(
            'NO_IMPLEMENTADO (contrato C): FinanzasService.anularCuota no está disponible.'
          );
        }
        return fn.bind(servicioConEventos);
      })();

      const primera = new Date('2026-10-01T12:00:00.000Z');
      sembrarCuota({
        id: 'cuota-c3',
        estado: EstadoCuota.ANULADA,
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '0.00',
        motivoAnulacion: 'Duplicada',
        fechaAnulacionUtc: primera,
        anuladaPor: UUID_COACH,
      });

      const promesa = anularCuota('cuota-c3', UUID_COACH, { motivo: 'Otro motivo' }, AHORA);

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_YA_ANULADA);
      expect(mockCuotasMembresia[0].motivoAnulacion).toBe('Duplicada');
      expect(mockCuotasMembresia[0].fechaAnulacionUtc).toEqual(primera);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('[C4] con una transacción PENDIENTE → 409 en-revisión, sin cambios', async () => {
      const anularCuota = exigirAnularCuota();
      const cuota = sembrarCuota({ id: 'cuota-c4' });
      sembrarTransaccion({ id: 'tx-c4', cuotaId: cuota.id });

      const promesa = anularCuota('cuota-c4', UUID_COACH, { motivo: 'Error' }, AHORA);

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_EN_REVISION);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
      expect(mockCuotasMembresia[0].motivoAnulacion ?? null).toBeNull();
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
    });

    it('[C5] con una transacción APROBADA → 409 con-pagos-aprobados, sin cambios', async () => {
      const anularCuota = exigirAnularCuota();
      const cuota = sembrarCuota({ id: 'cuota-c5' });
      sembrarTransaccion({
        id: 'tx-c5',
        cuotaId: cuota.id,
        estadoConciliacion: EstadoConciliacion.APROBADO,
      });

      const promesa = anularCuota('cuota-c5', UUID_COACH, { motivo: 'Error' }, AHORA);

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_CON_APROBADOS);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
      expect(mockCuotasMembresia[0].motivoAnulacion ?? null).toBeNull();
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
    });

    it('[C6] solo con RECHAZADO o REVERTIDO → se anula y las transacciones no cambian', async () => {
      const anularCuota = exigirAnularCuota();
      const cuota = sembrarCuota({ id: 'cuota-c6' });
      sembrarTransaccion({
        id: 'tx-c6a',
        cuotaId: cuota.id,
        estadoConciliacion: EstadoConciliacion.RECHAZADO,
        motivoRechazo: 'Comprobante ilegible',
      });
      sembrarTransaccion({
        id: 'tx-c6b',
        cuotaId: cuota.id,
        estadoConciliacion: EstadoConciliacion.REVERTIDO,
      });

      const res = await anularCuota('cuota-c6', UUID_COACH, { motivo: 'Error de emisión' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.RECHAZADO);
      expect(mockTransaccionesPago[1].estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
    });

    it('[C7-defensa] abonado > aplicado sin aprobadas (dato antiguo) → 409 con-pagos-aprobados', async () => {
      const anularCuota = exigirAnularCuota();
      // Fila legada inconsistente: 25.00 abonados que no salieron del saldo a favor.
      sembrarCuota({
        id: 'cuota-c7',
        montoAbonadoUsd: '25.00',
        saldoPendienteUsd: '15.00',
        saldoAFavorAplicadoUsd: '0.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });

      const promesa = anularCuota('cuota-c7', UUID_COACH, { motivo: 'Error' }, AHORA);

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_CON_APROBADOS);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ABONADA_PARCIAL);
      expect(mockCuotasMembresia[0].motivoAnulacion ?? null).toBeNull();
    });

    it('[C8] éxito sin saldo a favor aplicado: queda sin deuda, conserva el total y audita quién/cuándo/por qué', async () => {
      const anularCuota = exigirAnularCuota();
      sembrarCuota({ id: 'cuota-c8' });

      const res = await anularCuota('cuota-c8', UUID_COACH, { motivo: '  Error de emisión  ' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoAFavorAplicadoUsd).toBe('0.00');
      expect(res.cuota.montoTotalUsd).toBe('40.00');
      expect(res.cuota.motivoAnulacion).toBe('Error de emisión');
      expect(res.cuota.fechaAnulacionUtc).toBe(AHORA.toISOString());
      expect(res.cuota.anuladaPor).toBe(UUID_COACH);
      expect(res.saldoAFavorDevueltoUsd).toBe('0.00');
      expect(res.mensaje).toBe('Cuota anulada.');
      // La fila persiste la auditoría igual que el DTO.
      expect(mockCuotasMembresia[0].motivoAnulacion).toBe('Error de emisión');
      expect(mockCuotasMembresia[0].anuladaPor).toBe(UUID_COACH);
    });

    it('[C9a] éxito con 10.00 aplicados: el perfil sube 10.00 y el mensaje lo dice', async () => {
      const anularCuota = exigirAnularCuota();
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      sembrarCuota({
        id: 'cuota-c9a',
        montoAbonadoUsd: '10.00',
        saldoPendienteUsd: '30.00',
        saldoAFavorAplicadoUsd: '10.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });

      const res = await anularCuota('cuota-c9a', UUID_COACH, { motivo: 'Error de emisión' }, AHORA);

      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('15.00');
      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.montoAbonadoUsd).toBe('0.00');
      expect(res.cuota.saldoAFavorAplicadoUsd).toBe('0.00');
      expect(res.saldoAFavorDevueltoUsd).toBe('10.00');
      expect(res.mensaje).toBe('Cuota anulada. 10.00 USD volvieron al saldo a favor del alumno.');
    });

    it('[C9b] AL_DIA cubierta entera por saldo a favor (40.00) devuelve 40.00', async () => {
      const anularCuota = exigirAnularCuota();
      sembrarCuota({
        id: 'cuota-c9b',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        saldoAFavorAplicadoUsd: '40.00',
        estado: EstadoCuota.AL_DIA,
      });

      const res = await anularCuota('cuota-c9b', UUID_COACH, { motivo: 'Beca retroactiva' }, AHORA);

      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('40.00');
      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(res.saldoAFavorDevueltoUsd).toBe('40.00');
      expect(res.mensaje).toBe('Cuota anulada. 40.00 USD volvieron al saldo a favor del alumno.');
    });

    it('[C10] alumno archivado (deletedAtUtc no nulo) → se puede anular', async () => {
      const anularCuota = exigirAnularCuota();
      mockPerfilesAlumno[0].deletedAtUtc = new Date('2026-10-01T00:00:00.000Z');
      sembrarCuota({ id: 'cuota-c10' });

      const res = await anularCuota('cuota-c10', UUID_COACH, { motivo: 'Se fue del gimnasio' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(res.cuota.motivoAnulacion).toBe('Se fue del gimnasio');
    });

    it('[C11a] tras el commit se llama cancelarRecordatoriosCuota(cuotaId)', async () => {
      const anularCuota = exigirAnularCuota();
      sembrarCuota({ id: 'cuota-c11a' });

      const res = await anularCuota('cuota-c11a', UUID_COACH, { motivo: 'Error' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(mockScheduler.cancelarRecordatoriosCuota).toHaveBeenCalledWith('cuota-c11a');
    });

    it('[C11b] si cancelar recordatorios lanza, la anulación queda confirmada igual (best-effort)', async () => {
      const anularCuota = exigirAnularCuota();
      mockScheduler.cancelarRecordatoriosCuota.mockRejectedValueOnce(new Error('Redis caído'));
      sembrarCuota({ id: 'cuota-c11b' });

      const res = await anularCuota('cuota-c11b', UUID_COACH, { motivo: 'Error' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
    });

    it('[C12-existe] CuotaAnuladaEvent existe con NOMBRE estático', async () => {
      const mod = await import(
        '../../src/modules/notificaciones/events/eventos-notificacion'
      );
      const CuotaAnuladaEvent = (mod as any).CuotaAnuladaEvent;

      expect(typeof CuotaAnuladaEvent).toBe('function');
      expect(typeof CuotaAnuladaEvent?.NOMBRE).toBe('string');
    });

    it('[C12a] evento sin devolución: título, cuerpo MM/AAAA, link, referencia sin ":" y datos adicionales', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      (servicioConEventos as any).anularCuota = (finanzasService as any).anularCuota;
      const anularCuota = (() => {
        const fn = (servicioConEventos as any).anularCuota;
        if (typeof fn !== 'function') {
          throw new Error(
            'NO_IMPLEMENTADO (contrato C): FinanzasService.anularCuota no está disponible.'
          );
        }
        return fn.bind(servicioConEventos);
      })();
      const mod = await import(
        '../../src/modules/notificaciones/events/eventos-notificacion'
      );
      const CuotaAnuladaEvent = (mod as any).CuotaAnuladaEvent;

      sembrarCuota({ id: 'cuota-c12a', periodo: '2026-10' });
      await anularCuota('cuota-c12a', UUID_COACH, { motivo: 'Error de emisión' }, AHORA);

      expect(emitAsync).toHaveBeenCalledTimes(1);
      const [nombre, evento] = emitAsync.mock.calls[0];
      expect(nombre).toBe(CuotaAnuladaEvent.NOMBRE);
      expect(evento.payload.tipoEvento).toBe('CUOTA_ANULADA');
      expect(evento.payload.categoria).toBe('FINANZAS');
      expect(evento.payload.destinatarioUserId).toBe(ALUMNO_USER);
      expect(evento.payload.entrenadorId).toBe(UUID_COACH);
      expect(evento.payload.titulo).toBe('Tu entrenador anuló una cuota');
      expect(evento.payload.cuerpo).toBe(
        'Tu entrenador anuló tu cuota de 10/2026. Motivo: Error de emisión.'
      );
      expect(evento.payload.linkAccion).toBe('/app/pagos');
      expect(evento.payload.esCriticoSeguridad).toBe(false);
      expect(evento.payload.referenciaId).toBe('cuota-c12a_anulada');
      expect(evento.payload.referenciaId).not.toContain(':');
      expect(evento.payload.datosAdicionales).toEqual({
        cuotaId: 'cuota-c12a',
        motivoAnulacion: 'Error de emisión',
      });
    });

    it('[C12b] evento con devolución: el cuerpo suma lo que volvió al saldo a favor', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      (servicioConEventos as any).anularCuota = (finanzasService as any).anularCuota;
      const anularCuota = (() => {
        const fn = (servicioConEventos as any).anularCuota;
        if (typeof fn !== 'function') {
          throw new Error(
            'NO_IMPLEMENTADO (contrato C): FinanzasService.anularCuota no está disponible.'
          );
        }
        return fn.bind(servicioConEventos);
      })();

      sembrarCuota({
        id: 'cuota-c12b',
        periodo: '2026-10',
        montoAbonadoUsd: '10.00',
        saldoPendienteUsd: '30.00',
        saldoAFavorAplicadoUsd: '10.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });
      await anularCuota('cuota-c12b', UUID_COACH, { motivo: 'Error de emisión' }, AHORA);

      expect(emitAsync).toHaveBeenCalledTimes(1);
      const [, evento] = emitAsync.mock.calls[0];
      expect(evento.payload.cuerpo).toBe(
        'Tu entrenador anuló tu cuota de 10/2026. Motivo: Error de emisión. 10.00 USD volvieron a tu saldo a favor.'
      );
    });

    it('[C12c] si el bus falla, no se revierte la anulación', async () => {
      const emitAsync = vi.fn().mockRejectedValueOnce(new Error('bus caído'));
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      (servicioConEventos as any).anularCuota = (finanzasService as any).anularCuota;
      const anularCuota = (() => {
        const fn = (servicioConEventos as any).anularCuota;
        if (typeof fn !== 'function') {
          throw new Error(
            'NO_IMPLEMENTADO (contrato C): FinanzasService.anularCuota no está disponible.'
          );
        }
        return fn.bind(servicioConEventos);
      })();
      sembrarCuota({ id: 'cuota-c12c' });

      const res = await anularCuota('cuota-c12c', UUID_COACH, { motivo: 'Error' }, AHORA);

      expect(res.cuota.estado).toBe(EstadoCuota.ANULADA);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
    });
  });

  // ===========================================================================
  // D · Ruta HTTP `POST /finanzas/cuotas/:id/anular`
  // ===========================================================================
  describe('D · ruta HTTP (POST cuotas/:id/anular)', () => {
    it('[D-decl] handler declarado con POST, ruta cuotas/:id/anular y rol ENTRENADOR', () => {
      const handler = (FinanzasController.prototype as any).anularCuota;

      expect(typeof handler).toBe('function');
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('cuotas/:id/anular');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Rol.ENTRENADOR]);
    });

    it('[D-404] un :id que no es UUID responde 404 sin llamar al servicio', async () => {
      exigirHandlerAnular();
      const anularCuota = vi.fn();
      const controller = new FinanzasController({ anularCuota } as any);

      const promesa = controller.anularCuota(
        { user: { entrenadorId: UUID_COACH } },
        'no-es-uuid',
        { motivo: 'Error de emisión' }
      );

      const error = await promesa.catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.message).toBe('No encontramos esa cuota. Actualiza la pantalla.');
      expect(anularCuota).not.toHaveBeenCalled();
    });

    it('[D-400] cuerpo validado con AnularCuotaSchema: sin motivo o en blanco responde 400 sin llamar al servicio', async () => {
      exigirHandlerAnular();
      const anularCuota = vi.fn();
      const controller = new FinanzasController({ anularCuota } as any);

      const vacio = await controller
        .anularCuota({ user: { entrenadorId: UUID_COACH } }, UUID_COACH, {})
        .catch((e) => e);
      expect(vacio).toBeInstanceOf(BadRequestException);
      expect(vacio.getStatus()).toBe(400);
      expect(vacio.message).toBe('Escribe el motivo de la anulación.');

      const blanco = await controller
        .anularCuota({ user: { entrenadorId: UUID_COACH } }, UUID_COACH, { motivo: '   ' })
        .catch((e) => e);
      expect(blanco).toBeInstanceOf(BadRequestException);
      expect(blanco.getStatus()).toBe(400);
      expect(blanco.message).toBe('Escribe el motivo de la anulación.');
      expect(anularCuota).not.toHaveBeenCalled();
    });

    it('[D-200] con motivo válido delega al servicio y responde 200', async () => {
      exigirHandlerAnular();
      const anularCuota = vi.fn().mockResolvedValue({ cuota: { id: UUID_COACH } });
      const controller = new FinanzasController({ anularCuota } as any);

      await controller.anularCuota(
        { user: { entrenadorId: UUID_COACH } },
        UUID_COACH,
        { motivo: '  Error de emisión  ' }
      );

      expect(anularCuota).toHaveBeenCalledWith(UUID_COACH, UUID_COACH, {
        motivo: 'Error de emisión',
      });
    });

    it('[D-403] un ALUMNO recibe 403 del guard real; el entrenador dueño pasa', () => {
      exigirHandlerAnular();
      const guard = new RolesGuard(new Reflector());
      const contexto = (rol: Rol) =>
        ({
          getHandler: () => (FinanzasController.prototype as any).anularCuota,
          getClass: () => FinanzasController,
          switchToHttp: () => ({ getRequest: () => ({ user: { sub: ALUMNO_USER, rol } }) }),
        }) as unknown as ExecutionContext;

      expect(() => guard.canActivate(contexto(Rol.ALUMNO))).toThrow(ForbiddenException);
      expect(guard.canActivate(contexto(Rol.ENTRENADOR))).toBe(true);
    });
  });
});
