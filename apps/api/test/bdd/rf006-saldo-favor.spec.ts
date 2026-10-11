import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  FiltroCarteraSchema,
  MetodoPago,
  Moneda,
  Rol,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import {
  FinanzasService,
  aplicarSaldoAFavorACuota,
  mensajeCobroConExcedente,
  mensajePagoAprobado,
  repartirAbono,
  toCents,
} from '../../src/modules/finanzas/finanzas.service';
import { CarteraService } from '../../src/modules/finanzas/cartera.service';
import {
  CobroDirectoRegistradoEvent,
  PagoAprobadoEvent,
} from '../../src/modules/notificaciones/events/eventos-notificacion';

/**
 * RF-006 · Saldo a favor del alumno — verificación de la implementación (prompt 02).
 *
 * Contratos A–E (1..18) del prompt `01-rf006-saldo-favor-api-tests.md`, ampliados con los huecos
 * de cobertura señalados por las revisiones 03–06 del lote (prompt 07):
 * - A: funciones puras exportadas desde `finanzas.service.ts` (`repartirAbono`,
 *   `aplicarSaldoAFavorACuota`) y los mensajes de los eventos con excedente
 *   (`mensajeCobroConExcedente`, `mensajePagoAprobado`).
 * - B: columnas de la migración `0019` (`perfiles_alumno.saldo_a_favor_usd`,
 *   `cuotas_membresia.saldo_a_favor_aplicado_usd`, `transacciones_pago.excedente_usd`).
 *   El mock de BD en memoria las "acepta" (se siembran con sus defaults y se leen/escriben
 *   como cualquier otra columna).
 * - C: aprobar (`conciliarTransaccion`) y cobrar en sala (`cobroDirecto` /
 *   `cobroDirectoInteligente`) con excedente.
 * - D: emisión de cuotas con saldo a favor (`emitirCuotasProgramadas` →
 *   `emitirCuotaDeCicloEnTx`).
 * - E: DTOs compartidos (`CuotaDetalleDTO`, `TransaccionPagoDetalleDTO` + bandeja,
 *   `ResumenFinancieroAlumnoDTO`, `FilaCarteraDTO`).
 *
 * La concurrencia REAL del saldo a favor (bloqueo de PostgreSQL) vive en
 * `rf006-saldo-favor-concurrencia.e2e.spec.ts`; el mock de este archivo comparte referencias de
 * fila y no simula bloqueos.
 *
 * Mock de BD: réplica en memoria del de `rf005-rf009-m5l1-correcciones.spec.ts`, con tres
 * extensiones para este lote:
 * 1. El `select` combinado de la bandeja adjunta también la cuota de la transacción
 *    (`cuota`), para que la producción pueda exponer `saldoPendienteCuotaUsd`.
 * 2. Se registran las llamadas `.for('update')` por tabla (`mockForCalls`) para poder
 *    comprobar las relecturas bloqueadas del contrato 14.
 * 3. `transaction` revierte el estado en memoria si el callback lanza: fija que un fallo dentro
 *    de la transacción (p. ej. el 404 de la acreditación) no deja escrituras a medias.
 */
describe('RF-006 · saldo a favor (contratos A–E del prompt 01)', () => {
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
  const ALUMNO_USER = 'alumno-uuid-1';
  const PLAN = '99999999-9999-4999-8999-999999999999';

  /** `ahora` fijo: 09-10-2026 08:00 en Caracas; el ciclo vence el 10-10-2026. */
  const AHORA = new Date('2026-10-09T12:00:00.000Z');

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
          let isJoinedSelection = false;

          if (
            fieldsSelection &&
            typeof fieldsSelection === 'object' &&
            fieldsSelection.tx &&
            fieldsSelection.alumno
          ) {
            isJoinedSelection = true;
          }

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
              // Contrato 14: deja rastro de la relectura bloqueada (FOR UPDATE) por tabla.
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

              if (isJoinedSelection) {
                // Bandeja RF-007/RF-009: la transacción + su alumno + su cuota (esta última la
                // necesita el contrato 16 para exponer `saldoPendienteCuotaUsd`).
                const joined = pagina.map((tx) => {
                  const alumno = mockPerfilesAlumno.find((a) => a.usuarioId === tx.clienteId);
                  const cuota = mockCuotasMembresia.find((c) => c.id === tx.cuotaId) ?? null;
                  return { tx, alumno, cuota };
                });
                return resolve(joined);
              }

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
      // transacción (como PostgreSQL). Lo necesita el contrato que fija que un 404 de la
      // acreditación no deja la transacción ni la cuota a medio actualizar.
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

  function sembrarAlumno(overrides: Record<string, any> = {}) {
    mockPerfilesAlumno.push({
      id: `perfil-${mockPerfilesAlumno.length + 1}`,
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
      // Migración 0019: el mock acepta la columna con su default.
      saldoAFavorUsd: '0.00',
      ...overrides,
    });
    return mockPerfilesAlumno[mockPerfilesAlumno.length - 1];
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
      // Migración 0019: el mock acepta la columna con su default.
      saldoAFavorAplicadoUsd: '0.00',
      fechaEmisionUtc: new Date('2026-09-10T12:00:00.000Z'),
      fechaCorteUtc: new Date('2026-10-10T03:59:59.999Z'),
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
      // Migración 0019: el mock acepta la columna con su default.
      excedenteUsd: '0.00',
      fechaReporteUtc: new Date('2026-10-05T12:00:00.000Z'),
      fechaConciliacionUtc: null,
      createdAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      updatedAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      ...overrides,
    });
    return mockTransaccionesPago[mockTransaccionesPago.length - 1];
  }

  /** Deja al alumno base con una suscripción activa (el corte cae dentro de la ventana). */
  function suscribirAlumnoBase(overrides: Record<string, any> = {}) {
    Object.assign(mockPerfilesAlumno[0], {
      planSuscritoId: PLAN,
      cicloAncla: '2026-10-10',
      proximoCorte: '2026-10-10',
      ...overrides,
    });
    return mockPerfilesAlumno[0];
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
  // A · Función pura `repartirAbono` (contrato 1)
  // ===========================================================================
  describe('A · repartirAbono (función pura exportada)', () => {
    it('[A1a] $40.00 con abono de $50.00: aplica 40.00 y el excedente es 10.00', () => {
      expect(repartirAbono('40.00', '50.00')).toEqual({
        aplicadoUsd: '40.00',
        excedenteUsd: '10.00',
      });
    });

    it('[A1b] $40.00 con abono de $25.00: aplica 25.00 y sin excedente', () => {
      expect(repartirAbono('40.00', '25.00')).toEqual({
        aplicadoUsd: '25.00',
        excedenteUsd: '0.00',
      });
    });

    it('[A1c] saldo $0.00 con abono de $30.00: nada se aplica y todo es excedente', () => {
      expect(repartirAbono('0.00', '30.00')).toEqual({
        aplicadoUsd: '0.00',
        excedenteUsd: '30.00',
      });
    });

    it('[A1d] $40.00 con abono de $40.00: aplica 40.00 y sin excedente', () => {
      expect(repartirAbono('40.00', '40.00')).toEqual({
        aplicadoUsd: '40.00',
        excedenteUsd: '0.00',
      });
    });
  });

  // ===========================================================================
  // A · Función pura `aplicarSaldoAFavorACuota` (readability 4/5 del prompt 05)
  // ===========================================================================
  describe('A2 · aplicarSaldoAFavorACuota (función pura exportada)', () => {
    it('[A2a] sin saldo a favor la cuota nace emitida y con toda la deuda', () => {
      expect(aplicarSaldoAFavorACuota('40.00', '0.00', false)).toEqual({
        aplicadoUsd: '0.00',
        saldoPendienteUsd: '40.00',
        saldoAFavorRestanteUsd: '0.00',
        estado: EstadoCuota.EMITIDA,
      });
    });

    it('[A2b] saldo parcial ($10 de $40): nace abonada_parcial y consume todo el saldo', () => {
      expect(aplicarSaldoAFavorACuota('40.00', '10.00', false)).toEqual({
        aplicadoUsd: '10.00',
        saldoPendienteUsd: '30.00',
        saldoAFavorRestanteUsd: '0.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });
    });

    it('[A2c] saldo igual a la cuota: nace al_dia y el saldo queda en 0', () => {
      expect(aplicarSaldoAFavorACuota('40.00', '40.00', false)).toEqual({
        aplicadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        saldoAFavorRestanteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
    });

    it('[A2d] saldo mayor que la cuota ($50 de $40): aplica el total y deja $10 a favor', () => {
      expect(aplicarSaldoAFavorACuota('40.00', '50.00', false)).toEqual({
        aplicadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        saldoAFavorRestanteUsd: '10.00',
        estado: EstadoCuota.AL_DIA,
      });
    });

    it('[A2e] becado: no consume saldo aunque exista', () => {
      expect(aplicarSaldoAFavorACuota('0.00', '10.00', true)).toEqual({
        aplicadoUsd: '0.00',
        saldoPendienteUsd: '0.00',
        saldoAFavorRestanteUsd: '10.00',
        estado: EstadoCuota.AL_DIA,
      });
    });
  });

  // ===========================================================================
  // A · Mensajes de los eventos con excedente (resilience H1 del prompt 04)
  // ===========================================================================
  describe('A3 · mensajes con excedente', () => {
    it('[A3a] mensajeCobroConExcedente: sin excedente, parcial y todo a favor', () => {
      const inicio = 'Tu entrenador registró un cobro de 50.00 USD';

      // Sin excedente: el texto de siempre.
      expect(mensajeCobroConExcedente(inicio, '50.00', '0.00')).toBe(
        'Tu entrenador registró un cobro de 50.00 USD aplicado a tu cuota.'
      );

      // Excedente parcial: se nombran las dos partes del reparto.
      expect(mensajeCobroConExcedente(inicio, '50.00', '10.00')).toBe(
        'Tu entrenador registró un cobro de 50.00 USD: 40.00 USD se aplicaron a tu cuota y 10.00 USD quedaron como saldo a favor para tu próxima cuota.'
      );

      // Todo excedente: la cuota ya estaba pagada.
      expect(mensajeCobroConExcedente(inicio, '50.00', '50.00')).toBe(
        'Tu entrenador registró un cobro de 50.00 USD; como tu cuota ya estaba pagada, quedó completo como saldo a favor para tu próxima cuota.'
      );
    });

    it('[A3b] mensajePagoAprobado: sin excedente devuelve la base; con excedente la completa', () => {
      const base = 'Tu pago de 50.00 USD fue aprobado con éxito.';

      expect(mensajePagoAprobado(base, '0.00')).toBe(base);
      expect(mensajePagoAprobado(base, '10.00')).toBe(
        'Tu pago de 50.00 USD fue aprobado con éxito. 10.00 USD quedaron como saldo a favor para tu próxima cuota.'
      );
    });
  });

  // ===========================================================================
  // B · Columnas de la migración 0019 (contratos 2–4)
  // ===========================================================================
  describe('B · columnas persistidas (el mock de BD las acepta)', () => {
    it('[B2] aprobar con excedente persiste perfiles_alumno.saldo_a_favor_usd con el incremento', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-b2' });
      sembrarTransaccion({ id: 'tx-b2', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      await finanzasService.conciliarTransaccion('tx-b2', UUID_COACH, { accion: 'aprobar' });

      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('15.00');
    });

    it('[B4] aprobar con excedente persiste transacciones_pago.excedente_usd', async () => {
      const cuota = sembrarCuota({ id: 'cuota-b4' });
      sembrarTransaccion({ id: 'tx-b4', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      await finanzasService.conciliarTransaccion('tx-b4', UUID_COACH, { accion: 'aprobar' });

      expect(mockTransaccionesPago[0].excedenteUsd).toBe('10.00');
    });

    it('[B3] emitir con saldo a favor persiste cuotas_membresia.saldo_a_favor_aplicado_usd', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '10.00' });

      await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(mockCuotasMembresia[0].saldoAFavorAplicadoUsd).toBe('10.00');
    });
  });

  // ===========================================================================
  // C · Aprobar o cobrar con excedente (contratos 5–9)
  // ===========================================================================
  describe('C · aprobar o cobrar con excedente', () => {
    it('[C5] aprobar $50 sobre una cuota de $40: aplica 40, acredita 10 al perfil y expone el excedente', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c5' });
      sembrarTransaccion({ id: 'tx-c5', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      const res = await finanzasService.conciliarTransaccion('tx-c5', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(res.transaccion.excedenteUsd).toBe('10.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('15.00');
    });

    it('[C6a] pago exacto ($40 sobre $40): excedente 0.00, cuota al día y saldo a favor intacto', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c6a' });
      sembrarTransaccion({
        id: 'tx-c6a',
        cuotaId: cuota.id,
        montoOriginal: '40.00',
        montoEquivalenteUsd: '40.00',
      });

      const res = await finanzasService.conciliarTransaccion('tx-c6a', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.transaccion.excedenteUsd).toBe('0.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('5.00');
    });

    it('[C6b] pago parcial ($25 sobre $40): excedente 0.00, abonada_parcial y saldo a favor intacto', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c6b' });
      sembrarTransaccion({
        id: 'tx-c6b',
        cuotaId: cuota.id,
        montoOriginal: '25.00',
        montoEquivalenteUsd: '25.00',
      });

      const res = await finanzasService.conciliarTransaccion('tx-c6b', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.transaccion.excedenteUsd).toBe('0.00');
      expect(res.cuota.montoAbonadoUsd).toBe('25.00');
      expect(res.cuota.saldoPendienteUsd).toBe('15.00');
      expect(res.cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('5.00');
    });

    it('[C7] pago sobre una cuota ya saldada: todo el pago va al saldo a favor y la cuota no cambia', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-c7',
        montoAbonadoUsd: '40.00',
        saldoPendienteUsd: '0.00',
        estado: EstadoCuota.AL_DIA,
      });
      sembrarTransaccion({ id: 'tx-c7', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      const res = await finanzasService.conciliarTransaccion('tx-c7', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.transaccion.excedenteUsd).toBe('50.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('50.00');
    });

    it('[C8a] cobroDirecto con $50 sobre una cuota de $40: mismo reparto que conciliar', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c8a' });

      const res = await finanzasService.cobroDirecto(cuota.id, UUID_COACH, DTO_EFECTIVO_50);

      expect(res.transaccion.excedenteUsd).toBe('10.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('15.00');
    });

    it('[C8b] cobroDirectoInteligente con cuota abierta reparte el excedente igual', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      sembrarCuota({ id: 'cuota-c8b' });

      const res = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        DTO_EFECTIVO_50,
        undefined,
        AHORA
      );

      expect(res.transaccion.excedenteUsd).toBe('10.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('15.00');
    });

    it('[C8c] cobroDirectoInteligente sin cuota abierta: adelanta la cuota y reparte el excedente sobre ella', async () => {
      suscribirAlumnoBase();

      const res = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        DTO_EFECTIVO_50,
        undefined,
        AHORA
      );

      expect(mockCuotasMembresia).toHaveLength(1);
      expect(res.transaccion.excedenteUsd).toBe('10.00');
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');
    });

    it('[C8d] cobroDirectoInteligente con saldo a favor: la cuota adelantada nace con el saldo aplicado y el cobro reparte sobre lo pendiente', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '10.00' });

      const res = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        DTO_EFECTIVO_50,
        undefined,
        AHORA
      );

      // La cuota adelantada nace abonada_parcial con los 10.00 del saldo aplicados.
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(res.cuota.saldoAFavorAplicadoUsd).toBe('10.00');
      // El cobro de 50.00 reparte 30.00 sobre lo pendiente y 20.00 al saldo a favor.
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(res.transaccion.excedenteUsd).toBe('20.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('20.00');
    });

    it('[C9] tras aprobar, montoAbonadoUsd nunca supera montoTotalUsd (cuota parcial + pago con excedente)', async () => {
      const cuota = sembrarCuota({
        id: 'cuota-c9',
        montoAbonadoUsd: '30.00',
        saldoPendienteUsd: '10.00',
        estado: EstadoCuota.ABONADA_PARCIAL,
      });
      sembrarTransaccion({
        id: 'tx-c9',
        cuotaId: cuota.id,
        montoOriginal: '15.00',
        montoEquivalenteUsd: '15.00',
      });

      const res = await finanzasService.conciliarTransaccion('tx-c9', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.transaccion.excedenteUsd).toBe('5.00');
      expect(toCents(res.cuota.montoAbonadoUsd)).toBeLessThanOrEqual(
        toCents(res.cuota.montoTotalUsd)
      );
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
    });

    it('[C10a] cobroDirecto con excedente emite el evento con el reparto y datosAdicionales.excedenteUsd', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      const cuota = sembrarCuota({ id: 'cuota-c10a' });

      await servicioConEventos.cobroDirecto(cuota.id, UUID_COACH, DTO_EFECTIVO_50);

      expect(emitAsync).toHaveBeenCalledTimes(1);
      const [nombre, evento] = emitAsync.mock.calls[0];
      expect(nombre).toBe(CobroDirectoRegistradoEvent.NOMBRE);
      expect(evento.payload.cuerpo).toBe(
        'Tu entrenador registró un cobro de 50.00 USD: 40.00 USD se aplicaron a tu cuota y 10.00 USD quedaron como saldo a favor para tu próxima cuota.'
      );
      expect(evento.payload.datosAdicionales.excedenteUsd).toBe('10.00');
    });

    it('[C10b] conciliarTransaccion al aprobar con excedente emite PagoAprobadoEvent con excedenteUsd', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const servicioConEventos = new FinanzasService(
        mockDb,
        { emitAsync } as any,
        undefined,
        mockScheduler
      );
      const cuota = sembrarCuota({ id: 'cuota-c10b' });
      sembrarTransaccion({ id: 'tx-c10b', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      await servicioConEventos.conciliarTransaccion('tx-c10b', UUID_COACH, { accion: 'aprobar' });

      expect(emitAsync).toHaveBeenCalledTimes(1);
      const [nombre, evento] = emitAsync.mock.calls[0];
      expect(nombre).toBe(PagoAprobadoEvent.NOMBRE);
      expect(evento.payload.cuerpo).toBe(
        'Tu pago de 50.00 USD fue aprobado con éxito. 10.00 USD quedaron como saldo a favor para tu próxima cuota.'
      );
      expect(evento.payload.datosAdicionales.excedenteUsd).toBe('10.00');
    });

    it('[C11] excedente con un perfil de otro entrenador: 404 y la transacción y la cuota quedan intactas', async () => {
      const OTRO_COACH = '22222222-2222-4222-8222-222222222222';
      // La cuota pertenece a otro tenant; el perfil del alumno es del coach que concilia.
      const cuota = sembrarCuota({ id: 'cuota-c11', entrenadorId: OTRO_COACH });
      sembrarTransaccion({
        id: 'tx-c11',
        cuotaId: cuota.id,
        montoEquivalenteUsd: '50.00',
        entrenadorId: UUID_COACH,
      });

      const promesa = finanzasService.conciliarTransaccion('tx-c11', UUID_COACH, {
        accion: 'aprobar',
      });
      // El 404 debe venir del lookup del perfil en la acreditación, no de otra validación.
      await expect(promesa).rejects.toThrow(NotFoundException);
      await expect(promesa).rejects.toThrow('No encontramos a este alumno.');

      // Rollback (simulado por el mock): ni la transacción ni la cuota cambiaron.
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(mockTransaccionesPago[0].excedenteUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[C12] rechazo de un pago cuando otro ya saldó la cuota: queda al_dia y no toca el saldo a favor', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '5.00';
      const cuota = sembrarCuota({ id: 'cuota-c12' });
      // Dos pagos sobre la misma cuota: el aprobado la salda; el rechazado no la vuelve parcial.
      sembrarTransaccion({
        id: 'tx-c12-ok',
        cuotaId: cuota.id,
        montoOriginal: '40.00',
        montoEquivalenteUsd: '40.00',
      });
      sembrarTransaccion({ id: 'tx-c12-rechazada', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      await finanzasService.conciliarTransaccion('tx-c12-ok', UUID_COACH, { accion: 'aprobar' });
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.AL_DIA);

      const res = await finanzasService.conciliarTransaccion('tx-c12-rechazada', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Pago duplicado',
      });

      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.RECHAZADO);
      expect(res.transaccion.excedenteUsd).toBe('0.00');
      // La cuota ya estaba saldada: rechazar el duplicado NO la degrada a abonada_parcial.
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      // El rechazo no acredita ni consume saldo a favor.
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('5.00');
    });

    it('[C13] cobro en VES con excedente: el contravalor redondeado se reparte en centavos exactos', async () => {
      const cuota = sembrarCuota({ id: 'cuota-c13' });

      const res = await finanzasService.cobroDirecto(cuota.id, UUID_COACH, {
        montoOriginal: '3050.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.EFECTIVO_VES,
        fechaOperacion: '2026-10-09',
      });

      // 3050.00 / 60.0000 = 50.8333… → contravalor 50.83 (half-to-even al céntimo, RN-04).
      expect(res.transaccion.tasaCambioFijada).toBe('60.0000');
      expect(res.transaccion.montoEquivalenteUsd).toBe('50.83');
      expect(res.transaccion.excedenteUsd).toBe('10.83');
      // La cuota recibe 40.00 y el reparto cierra exacto: aplicado + excedente = contravalor.
      expect(res.cuota.montoAbonadoUsd).toBe('40.00');
      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(toCents(res.cuota.montoAbonadoUsd) + toCents(res.transaccion.excedenteUsd)).toBe(
        toCents(res.transaccion.montoEquivalenteUsd)
      );
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.83');
    });
  });

  // ===========================================================================
  // D · Emisión con saldo a favor (contratos 10–14)
  // ===========================================================================
  describe('D · emisión con saldo a favor (emitirCuotasProgramadas → emitirCuotaDeCicloEnTx)', () => {
    it('[D10] saldo $10 + cuota $40: nace abonada_parcial con 10.00 aplicados y el perfil queda en 0', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '10.00' });

      const resumen = await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(resumen).toEqual({ evaluadas: 1, emitidas: 1, omitidas: 0 });
      const cuota = mockCuotasMembresia[0];
      expect(cuota.saldoAFavorAplicadoUsd).toBe('10.00');
      expect(cuota.montoAbonadoUsd).toBe('10.00');
      expect(cuota.saldoPendienteUsd).toBe('30.00');
      expect(cuota.estado).toBe(EstadoCuota.ABONADA_PARCIAL);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[D10b] la cuota que nace abonada_parcial con saldo a favor SÍ agenda recordatorios', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '10.00' });

      await finanzasService.emitirCuotasProgramadas(AHORA);

      // Nace con deuda pendiente (30.00): los recordatorios T-5/T-1/T/T+2 deben agendarse.
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ABONADA_PARCIAL);
      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledTimes(1);
      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockCuotasMembresia[0].id })
      );
    });

    it('[D11] saldo $50 + cuota $40: nace al_dia con 40.00 aplicados, deja 10 y NO agenda recordatorios', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '50.00' });

      await finanzasService.emitirCuotasProgramadas(AHORA);

      const cuota = mockCuotasMembresia[0];
      expect(cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(cuota.saldoAFavorAplicadoUsd).toBe('40.00');
      expect(cuota.saldoPendienteUsd).toBe('0.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');
      // Nace pagada: no debe agendarse ningún recordatorio.
      expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
    });

    it('[D12] sin saldo a favor la emisión queda como hoy: aplicado 0.00 y estado emitida', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '0.00' });

      await finanzasService.emitirCuotasProgramadas(AHORA);

      const cuota = mockCuotasMembresia[0];
      expect(cuota.saldoAFavorAplicadoUsd).toBe('0.00');
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);
      expect(cuota.montoAbonadoUsd).toBe('0.00');
      expect(cuota.saldoPendienteUsd).toBe('40.00');
    });

    it('[D13] becado (cuota de $0): no consume saldo a favor', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '10.00' });
      mockOverridesClientePlan.push({
        id: 'override-becado-1',
        planId: PLAN,
        clienteId: ALUMNO_USER,
        precioAcordadoUsd: '0.00',
      });

      await finanzasService.emitirCuotasProgramadas(AHORA);

      const cuota = mockCuotasMembresia[0];
      expect(cuota.montoTotalUsd).toBe('0.00');
      expect(cuota.estado).toBe(EstadoCuota.AL_DIA);
      expect(cuota.saldoAFavorAplicadoUsd).toBe('0.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');
    });

    it('[D14a] la emisión aplica el saldo leído de la BD dentro de la transacción, no el del perfil recibido', async () => {
      // La fila real tiene 30.00, pero el llamador pasa un perfil con un saldo obsoleto (10.00):
      // pudo leerlo antes de que otra aprobación acreditara. La emisión debe releer la fila
      // bloqueada (FOR UPDATE) y aplicar el saldo REAL.
      suscribirAlumnoBase({ saldoAFavorUsd: '30.00' });
      const perfilObsoleto = { ...mockPerfilesAlumno[0], saldoAFavorUsd: '10.00' };

      await (finanzasService as any).emitirCuotaDeCicloEnTx(
        mockDb,
        perfilObsoleto,
        mockPlanesMembresia[0],
        '2026-10-10',
        AHORA
      );

      // La relectura bloqueada del saldo ocurre exactamente una vez: sin el lock nuevo, 0.
      expect(mockForCalls.filter((tabla) => tabla === 'perfiles_alumno')).toHaveLength(1);
      expect(mockCuotasMembresia[0].saldoAFavorAplicadoUsd).toBe('30.00');
      expect(mockCuotasMembresia[0].montoAbonadoUsd).toBe('30.00');
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('10.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ABONADA_PARCIAL);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[D14b] aprobaciones sucesivas acumulan el saldo a favor (incremento, no sobrescritura)', async () => {
      const cuota1 = sembrarCuota({ id: 'cuota-d14b-1' });
      const cuota2 = sembrarCuota({ id: 'cuota-d14b-2' });
      sembrarTransaccion({ id: 'tx-d14b-1', cuotaId: cuota1.id, montoEquivalenteUsd: '50.00' });
      sembrarTransaccion({ id: 'tx-d14b-2', cuotaId: cuota2.id, montoEquivalenteUsd: '50.00' });

      await finanzasService.conciliarTransaccion('tx-d14b-1', UUID_COACH, { accion: 'aprobar' });
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');

      await finanzasService.conciliarTransaccion('tx-d14b-2', UUID_COACH, { accion: 'aprobar' });
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('20.00');
    });

    it('[D14c] dos aprobaciones con Promise.all acumulan el saldo a favor (regresión funcional; el locking real lo cubre el e2e)', async () => {
      const cuota1 = sembrarCuota({ id: 'cuota-d14c-1' });
      const cuota2 = sembrarCuota({ id: 'cuota-d14c-2' });
      sembrarTransaccion({ id: 'tx-d14c-1', cuotaId: cuota1.id, montoEquivalenteUsd: '50.00' });
      sembrarTransaccion({ id: 'tx-d14c-2', cuotaId: cuota2.id, montoEquivalenteUsd: '50.00' });

      await Promise.all([
        finanzasService.conciliarTransaccion('tx-d14c-1', UUID_COACH, { accion: 'aprobar' }),
        finanzasService.conciliarTransaccion('tx-d14c-2', UUID_COACH, { accion: 'aprobar' }),
      ]);

      // El mock comparte referencias de fila y no simula bloqueos: este test fija la acumulación
      // funcional y que cada acreditación deja su relectura FOR UPDATE (una por aprobación).
      expect(mockForCalls.filter((tabla) => tabla === 'perfiles_alumno')).toHaveLength(2);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('20.00');
    });

    it('[D15] el saldo de $90 cubre dos cuotas de $40 en dos emisiones y deja $10', async () => {
      suscribirAlumnoBase({ saldoAFavorUsd: '90.00' });

      const primera = await finanzasService.emitirCuotasProgramadas(AHORA);
      expect(primera).toEqual({ evaluadas: 1, emitidas: 1, omitidas: 0 });
      expect(mockCuotasMembresia[0].saldoAFavorAplicadoUsd).toBe('40.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('50.00');

      // Segundo ciclo: el corte avanzó a 2026-11-10 y el barrido corre dentro de su ventana.
      const segundoCiclo = new Date('2026-11-05T12:00:00.000Z');
      const segunda = await finanzasService.emitirCuotasProgramadas(segundoCiclo);
      expect(segunda).toEqual({ evaluadas: 1, emitidas: 1, omitidas: 0 });

      expect(mockCuotasMembresia).toHaveLength(2);
      expect(mockCuotasMembresia[1].periodo).toBe('2026-11');
      expect(mockCuotasMembresia[1].saldoAFavorAplicadoUsd).toBe('40.00');
      expect(mockCuotasMembresia[1].estado).toBe(EstadoCuota.AL_DIA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('10.00');
      // Ninguna de las dos cuotas nace con deuda: sin recordatorios.
      expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // E · Lectura: DTOs compartidos y bandeja (contratos 15–17)
  // ===========================================================================
  describe('E · lectura (DTOs compartidos y bandeja)', () => {
    it('[E15] CuotaDetalleDTO.saldoAFavorAplicadoUsd existe en la lectura de la cuota', async () => {
      const cuota = sembrarCuota({ id: 'cuota-e15' });
      sembrarTransaccion({
        id: 'tx-e15',
        cuotaId: cuota.id,
        montoOriginal: '25.00',
        montoEquivalenteUsd: '25.00',
      });

      const res = await finanzasService.conciliarTransaccion('tx-e15', UUID_COACH, {
        accion: 'aprobar',
      });

      expect(res.cuota.saldoAFavorAplicadoUsd).toBe('0.00');
    });

    it('[E16a] la bandeja expone TransaccionPagoDetalleDTO.excedenteUsd aunque aún no se concilie', async () => {
      const cuota = sembrarCuota({ id: 'cuota-e16a' });
      sembrarTransaccion({ id: 'tx-e16a', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      const bandeja = await finanzasService.listarBandejaConciliacion(UUID_COACH);

      expect(bandeja.items).toHaveLength(1);
      expect(bandeja.items[0].excedenteUsd).toBe('0.00');
    });

    it('[E16b] la bandeja trae saldoPendienteCuotaUsd con el saldo actual de su cuota', async () => {
      const cuota = sembrarCuota({ id: 'cuota-e16b', saldoPendienteUsd: '40.00' });
      sembrarTransaccion({ id: 'tx-e16b', cuotaId: cuota.id, montoEquivalenteUsd: '50.00' });

      const bandeja = await finanzasService.listarBandejaConciliacion(UUID_COACH);

      expect(bandeja.items).toHaveLength(1);
      expect(bandeja.items[0].saldoPendienteCuotaUsd).toBe('40.00');
    });

    it('[E16c] bandeja con un pago cuya cuota no existe: saldoPendienteCuotaUsd undefined y no falla', async () => {
      sembrarTransaccion({
        id: 'tx-e16c',
        cuotaId: 'cuota-inexistente',
        montoEquivalenteUsd: '50.00',
      });

      const bandeja = await finanzasService.listarBandejaConciliacion(UUID_COACH);

      expect(bandeja.items).toHaveLength(1);
      expect(bandeja.items[0].saldoPendienteCuotaUsd).toBeUndefined();
      expect(bandeja.items[0].excedenteUsd).toBe('0.00');
    });

    it('[E17] ResumenFinancieroAlumnoDTO.saldoAFavorUsd sale en obtenerHistorialCliente', async () => {
      mockPerfilesAlumno[0].saldoAFavorUsd = '10.00';

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.saldoAFavorUsd).toBe('10.00');
    });

    it('[E19] ResumenFinancieroAlumnoDTO.cuotaMesActual expone saldoAFavorAplicadoUsd (contrato 10)', async () => {
      // Fase roja: `obtenerHistorialCliente` todavía no mapea la columna de la cuota al DTO.
      sembrarCuota({ id: 'cuota-e19', saldoAFavorAplicadoUsd: '10.00' });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      const cuota = resumen.cuotaMesActual as { saldoAFavorAplicadoUsd?: string } | null;
      expect(cuota?.saldoAFavorAplicadoUsd).toBe('10.00');
    });
  });

  // ===========================================================================
  // E · Cartera: tablero del coach (contrato 18)
  // ===========================================================================
  describe('E · cartera (tablero del coach)', () => {
    const COACH_ID = 'coach-uuid-1';
    const DIA_MS = 24 * 60 * 60 * 1000;

    type RespuestaTabla = any[] | ((n: number) => any[]);

    /**
     * Mock de Drizzle por nombre de tabla y contador de invocación (réplica del de
     * `rf009-cartera-coach.spec.ts`): el tablero encadena consultas y este doble solo
     * necesita devolver la respuesta correcta en el orden en que se piden.
     */
    function crearMockDbCartera(respuestas: Record<string, RespuestaTabla>) {
      const contadores: Record<string, number> = {};

      const db: any = {
        select: vi.fn(() => ({
          from: vi.fn((table: any) => {
            const nombre = table ? getTableName(table) : '';
            contadores[nombre] = (contadores[nombre] ?? 0) + 1;
            const definicion = respuestas[nombre];
            const data =
              typeof definicion === 'function'
                ? definicion(contadores[nombre])
                : definicion ?? [];

            const queryObj: any = {
              innerJoin: vi.fn(() => queryObj),
              leftJoin: vi.fn(() => queryObj),
              where: vi.fn(() => queryObj),
              groupBy: vi.fn(() => queryObj),
              having: vi.fn(() => queryObj),
              orderBy: vi.fn(() => queryObj),
              limit: vi.fn(() => queryObj),
              offset: vi.fn(() => queryObj),
              then: (resolve: any) => resolve(data),
            };
            return queryObj;
          }),
        })),
        transaction: vi.fn(async (fn: any) => fn(db)),
        execute: vi.fn(async () => undefined),
      };

      return { db };
    }

    function crearFinanzasFake() {
      return {
        obtenerTasaVigente: vi.fn(async () => ({
          entrenadorId: COACH_ID,
          tasaOficialBcv: null,
          tasaActivaEntrenador: null,
          tasaAcordadaCliente: null,
          tasaEfectiva: null,
          esTasaOverride: false,
          fuente: 'sin_configurar',
          fechaActualizacionUtc: null,
        })),
        resolverComprobanteUrl: vi.fn(async () => null),
        proyectarVES: vi.fn((saldo: string, tasa: string) =>
          (Number(saldo) * Number(tasa)).toFixed(2)
        ),
      };
    }

    it('[E18] FilaCarteraDTO.saldoAFavorUsd sale en el tablero de cartera (pestaña mora)', async () => {
      const ahora = Date.now();
      const { db } = crearMockDbCartera({
        transacciones_pago: (n: number) => (n === 1 ? [] : [{ total: 0 }]),
        cuotas_membresia: (n: number) => {
          if (n === 1) return [{ total: '40.00', alumnos: 1 }];
          if (n === 2) return [{ total: '0.00', alumnos: 0 }];
          if (n === 3) return [{ total: 0 }];
          if (n === 4) return [{ total: 1 }];
          if (n === 5)
            return [
              {
                clienteId: 'alumno-uuid-1',
                perfilId: 'perfil-alumno-1',
                nombres: 'Pedro',
                apellidos: 'Pérez',
                telefonoWhatsapp: null,
                tasaOverride: null,
                proximoCorte: null,
                saldoTotalUsd: '40.00',
                corteMasUrgente: new Date(ahora - DIA_MS),
                // Migración 0019: la fila de cartera debe traer el saldo a favor del alumno.
                saldoAFavorUsd: '10.00',
              },
            ];
          if (n === 6)
            return [
              {
                id: 'cuota-e18',
                clienteId: 'alumno-uuid-1',
                estado: EstadoCuota.VENCIDA,
                fechaCorteUtc: new Date(ahora - DIA_MS),
                saldoPendienteUsd: '40.00',
              },
            ];
          return [];
        },
        notificaciones_in_app: [],
      });

      const servicio = new CarteraService(db, crearFinanzasFake() as any);
      const resultado = await servicio.obtenerCartera(
        COACH_ID,
        FiltroCarteraSchema.parse({ pestana: 'mora' })
      );

      expect(resultado.items).toHaveLength(1);
      expect(resultado.items[0].saldoAFavorUsd).toBe('10.00');
    });
  });
});
