import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_COBRO_CUOTA_ANULADA,
  MENSAJE_REPORTE_CUOTA_ANULADA,
  MetodoPago,
  Moneda,
  Rol,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { instanteCorteUtc } from '../../src/modules/finanzas/suscripcion-ciclo';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';

/**
 * RF-008 · Anulación de cuotas — efectos en otras rutas (contratos E1–E6 del
 * prompt `01-anulacion-cuotas-tests.md`).
 *
 * Contratos E1–E6 según la decisión del dueño del 2026-10-12: las anuladas no
 * ocupan su periodo (sustituye al E5 del prompt 01 y a ADR-020 en este punto).
 *
 * El estado "cuota anulada con transacción pendiente" no se alcanza por la API
 * (la anulación lo impide y el reporte sobre anulada está bloqueado): se
 * siembra insertándolo directamente, como pide el contrato E2.
 *
 * Textos acordados: literales del contrato A (el spec `rf008-anulacion-cuota`
 * fija que `@guachafit/shared` los exporta tal cual).
 *
 * Mock de BD: réplica del de `rf007-reversion-pago-aprobado.spec.ts` (drizzle
 * mock en memoria) con rollback simulado de `transaction`. Para [E4] se usa el
 * mock por nombre de tabla de `rf013-dashboard-comando.spec.ts`, porque lo que
 * se audita es el PREDICADO SQL de la meta (el filtro vive en el `where`, no en
 * JS: este mock ignora el `where` a propósito y devuelve filas fijas).
 */
describe('RF-008 · efectos de la anulación en otras rutas (contratos E1–E6)', () => {
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

  const UUID_COACH = '11111111-1111-4111-8111-111111111111';
  const ALUMNO_USER = 'alumno-uuid-1';
  const PLAN = '99999999-9999-4999-8999-999999999999';

  /** `ahora` fijo: 09-10-2026 08:00 en Caracas; el ciclo vence el 10-10-2026. */
  const AHORA = new Date('2026-10-09T12:00:00.000Z');
  const CORTE_FUTURO = new Date('2026-10-10T03:59:59.999Z');

  const MENSAJE_CONCILIACION_ANULADA = 'No se puede conciliar un pago de una cuota anulada.';

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
        if (typeof c?.name === 'string') partes.push(c.name);
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
    const db: any = {
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
            for: vi.fn(() => queryObj),
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

  function sembrarCuotaAnulada(overrides: Record<string, any> = {}) {
    mockCuotasMembresia.push({
      id: `cuota-${mockCuotasMembresia.length + 1}`,
      clienteId: ALUMNO_USER,
      entrenadorId: UUID_COACH,
      planId: PLAN,
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '0.00',
      saldoAFavorAplicadoUsd: '0.00',
      fechaEmisionUtc: new Date('2026-09-10T12:00:00.000Z'),
      fechaCorteUtc: CORTE_FUTURO,
      estado: EstadoCuota.ANULADA,
      notas: null,
      motivoAnulacion: 'Error de emisión',
      fechaAnulacionUtc: AHORA,
      anuladaPor: UUID_COACH,
      createdAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      updatedAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
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
      motivoAnulacion: null,
      fechaAnulacionUtc: null,
      anuladaPor: null,
      createdAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      updatedAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
  }

  function sembrarTransaccionPendiente(overrides: Record<string, any> = {}) {
    mockTransaccionesPago.push({
      id: `tx-${mockTransaccionesPago.length + 1}`,
      cuotaId: 'cuota-1',
      clienteId: ALUMNO_USER,
      entrenadorId: UUID_COACH,
      registradoPor: ALUMNO_USER,
      montoOriginal: '40.00',
      monedaOriginal: Moneda.USD,
      tasaCambioFijada: '1.0000',
      montoEquivalenteUsd: '40.00',
      metodoPago: MetodoPago.EFECTIVO_USD,
      referenciaBancaria: null,
      fechaOperacion: '2026-10-05',
      comprobanteStorageKey: null,
      estadoConciliacion: EstadoConciliacion.PENDIENTE,
      motivoRechazo: null,
      excedenteUsd: '0.00',
      fechaReporteUtc: new Date('2026-10-05T12:00:00.000Z'),
      fechaConciliacionUtc: null,
      createdAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      updatedAtUtc: new Date('2026-10-05T12:00:00.000Z'),
      ...overrides,
    });
    return mockTransaccionesPago[mockTransaccionesPago.length - 1];
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
    mockScheduler = {
      programarRecordatoriosCuota: vi.fn().mockResolvedValue([]),
      cancelarRecordatoriosCuota: vi.fn().mockResolvedValue(4),
    };
    finanzasService = new FinanzasService(mockDb, undefined, undefined, mockScheduler);
  });

  // ===========================================================================
  // E1 · reportarPago sobre cuota anulada (mensaje actual)
  // ===========================================================================
  describe('E1 · reportarPago sobre una cuota anulada', () => {
    it('[E1] responde 400 con el mensaje actual, no crea transacción y la cuota sigue anulada', async () => {
      expect(MENSAJE_REPORTE_CUOTA_ANULADA).toBe(
        'No se pueden reportar pagos sobre una cuota anulada.'
      );
      const cuota = sembrarCuotaAnulada({ id: 'cuota-e1' });

      const promesa = finanzasService.reportarPago(cuota.id, ALUMNO_USER, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      await expect(promesa).rejects.toThrow(BadRequestException);
      await expect(promesa).rejects.toThrow(MENSAJE_REPORTE_CUOTA_ANULADA);
      expect(mockTransaccionesPago).toHaveLength(0);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
    });
  });

  // ===========================================================================
  // E-cobro · cobroDirecto sobre cuota anulada (05-S2): 400 sin efectos
  // ===========================================================================
  describe('E-cobro · cobroDirecto sobre una cuota anulada', () => {
    it('[E-cobro] responde 400 con MENSAJE_COBRO_CUOTA_ANULADA, sin transacción ni cambios en la cuota ni en el saldo a favor', async () => {
      // Dato antiguo consistente (pendiente 40.00 sobre la anulada): sin la
      // guarda del contrato, el cobro cursaría de verdad.
      const cuota = sembrarCuotaAnulada({ id: 'cuota-e-cobro', saldoPendienteUsd: '40.00' });

      const promesa = finanzasService.cobroDirecto(cuota.id, UUID_COACH, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      await expect(promesa).rejects.toThrow(BadRequestException);
      await expect(promesa).rejects.toThrow(MENSAJE_COBRO_CUOTA_ANULADA);
      expect(mockTransaccionesPago).toHaveLength(0);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });
  });

  // ===========================================================================
  // E2 · conciliarTransaccion (aprobar y rechazar) con la cuota anulada
  // ===========================================================================
  describe('E2 · conciliar una transacción PENDIENTE cuya cuota está anulada', () => {
    it('[E2-aprobar] aprobar → 409 sin cambios en la transacción, la cuota ni el saldo a favor', async () => {
      // Dato antiguo consistente (pendiente 40.00): sin el guard del contrato,
      // la aprobación cursa de verdad sobre la cuota anulada.
      const cuota = sembrarCuotaAnulada({ id: 'cuota-e2a', saldoPendienteUsd: '40.00' });
      sembrarTransaccionPendiente({ id: 'tx-e2a', cuotaId: cuota.id });

      const promesa = finanzasService.conciliarTransaccion('tx-e2a', UUID_COACH, {
        accion: 'aprobar',
      });

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_CONCILIACION_ANULADA);
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });

    it('[E2-rechazar] rechazar → 409 sin cambios en la transacción, la cuota ni el saldo a favor', async () => {
      const cuota = sembrarCuotaAnulada({ id: 'cuota-e2b', saldoPendienteUsd: '40.00' });
      sembrarTransaccionPendiente({ id: 'tx-e2b', cuotaId: cuota.id });

      const promesa = finanzasService.conciliarTransaccion('tx-e2b', UUID_COACH, {
        accion: 'rechazar',
        motivoRechazo: 'Comprobante ilegible',
      });

      await expect(promesa).rejects.toThrow(ConflictException);
      await expect(promesa).rejects.toThrow(MENSAJE_CONCILIACION_ANULADA);
      expect(mockTransaccionesPago[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
      expect(mockPerfilesAlumno[0].saldoAFavorUsd).toBe('0.00');
    });
  });

  // ===========================================================================
  // E3 · obtenerHistorialCliente con cuotas anuladas
  // ===========================================================================
  describe('E3 · obtenerHistorialCliente ignora las anuladas donde manda el contrato', () => {
    it('[E3-saldo] saldoPendienteTotalUsd excluye las anuladas, incluso con pendiente > 0 (dato antiguo)', async () => {
      // Dato antiguo: la anulada conserva 40.00 de pendiente en BD.
      sembrarCuotaAnulada({ id: 'cuota-e3-anulada', saldoPendienteUsd: '40.00' });
      sembrarCuota({ id: 'cuota-e3-abierta', saldoPendienteUsd: '30.00' });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.saldoPendienteTotalUsd).toBe('30.00');
    });

    it('[E3-mes] cuotaMesActual ignora las anuladas: toma la primera no anulada; si todas lo están, null', async () => {
      // Ninguna es del periodo en curso (periodos futuros fijos): el fallback es la
      // primera de la lista, que hoy es la anulada (la más reciente).
      const emitida = sembrarCuota({
        id: 'cuota-e3-mes-emitida',
        periodo: '2998-01',
        createdAtUtc: new Date('2026-09-10T12:00:00.000Z'),
      });
      sembrarCuotaAnulada({
        id: 'cuota-e3-mes-anulada',
        periodo: '2999-01',
        createdAtUtc: new Date('2026-09-11T12:00:00.000Z'),
      });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.cuotaMesActual?.id).toBe(emitida.id);
    });

    it('[E3-mes-todas] si todas están anuladas, cuotaMesActual es null', async () => {
      sembrarCuotaAnulada({ id: 'cuota-e3-todas', periodo: '2999-01' });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.cuotaMesActual).toBeNull();
    });

    it('[E3-campos] la cuota del historial incluye motivoAnulacion y fechaAnulacionUtc', async () => {
      const hoy = new Date();
      const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      sembrarCuota({ id: 'cuota-e3-campos', periodo: periodoActual });

      const resumen = await finanzasService.obtenerHistorialCliente(
        UUID_COACH,
        ALUMNO_USER,
        UUID_COACH,
        Rol.ENTRENADOR
      );

      expect(resumen.cuotaMesActual).not.toBeNull();
      expect(resumen.cuotaMesActual).toHaveProperty('motivoAnulacion');
      expect(resumen.cuotaMesActual).toHaveProperty('fechaAnulacionUtc');
    });
  });

  // ===========================================================================
  // E4 · Dashboard del entrenador: la meta del mes excluye las anuladas
  // ===========================================================================
  describe('E4 · meta de cobranza del dashboard (entrenador.service.ts)', () => {
    it('[E4-meta] el predicado de cuotas del periodo excluye las anuladas con `ne(estado, anulada)`', async () => {
      const predicados: any[] = [];
      const db: any = {
        select: vi.fn(() => ({
          from: vi.fn((table: any) => {
            const nombre = table ? getTableName(table) : '';
            const filas =
              nombre === 'cuotas_membresia'
                ? [{ montoTotalUsd: '40.00' }, { montoTotalUsd: '40.00' }]
                : nombre === 'perfiles_entrenador'
                  ? [{ capacidadMaxima: 50 }]
                  : [];
            const queryObj: any = {
              where: vi.fn((predicate: any) => {
                predicados.push({ tabla: nombre, predicate });
                return queryObj;
              }),
              orderBy: vi.fn(() => Promise.resolve(filas)),
              limit: vi.fn(() => Promise.resolve(filas)),
              then: (resolve: any) => resolve(filas),
            };
            return queryObj;
          }),
        })),
      };
      const withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(db));
      const entrenadorService = new EntrenadorService(db, withTenantMock);

      await entrenadorService.obtenerDashboardComando(UUID_COACH);

      const deCuotasDelPeriodo = predicados.find(
        ({ tabla, predicate }: any) =>
          tabla === 'cuotas_membresia' && textoDeExpresion(predicate).includes('periodo')
      );
      // Sanidad: el predicado auditado es el de la meta (filtra por periodo).
      expect(deCuotasDelPeriodo).toBeDefined();
      // Contrato: la suma de `montoTotalUsd` del periodo excluye las anuladas.
      // Con `ne()` el valor viaja como parámetro (ya no como texto del SQL),
      // así que se auditan columna, operador y valor por separado: si el
      // operador se invierte (`ne` → `eq`) o se quita el filtro, esta
      // aserción cae.
      expect(extractConditions(deCuotasDelPeriodo.predicate)).toContainEqual({
        column: 'estado',
        op: 'ne',
        value: 'anulada',
      });
    });
  });

  // ===========================================================================
  // E5 · Cobertura: la cuota anulada NO ocupa su periodo (decisión del dueño
  // 2026-10-12, sustituye al E5 del prompt 01 y a ADR-020 en este punto). Con
  // la cuota más reciente anulada y el plan quitado, reasignar con fechaInicio
  // dentro del periodo anulado SE ACEPTA.
  // ===========================================================================
  describe('E5 · la cuota anulada NO ocupa su periodo: reasignar dentro del periodo anulado se acepta', () => {
    it('[E5] con la cuota más reciente anulada y sin plan, reasignar con fechaInicio dentro del periodo anulado SE ACEPTA', async () => {
      // Estado tras anular la cuota del ciclo y quitar el plan: sin plan
      // suscrito y solo la anulada del periodo 2026-10. Como las anuladas no
      // cuentan para la cobertura, no hay nada cubierto y el 2026-10-15 se
      // acepta (antes de la decisión del dueño esto era 400).
      // Fuera de la ventana de emisión (hoy 09-10, inicio 15-10): se suscribe
      // sin emitir cuota todavía.
      sembrarCuotaAnulada({
        id: 'cuota-e5',
        periodo: '2026-10',
        fechaCorteUtc: new Date('2026-10-10T03:59:59.999Z'),
      });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN, fechaInicio: '2026-10-15' },
        AHORA
      );

      expect(dto.fechaInicio).toBe('2026-10-15');
      expect(mockPerfilesAlumno[0].planSuscritoId).toBe(PLAN);
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.ANULADA);
    });

    it('[E5b] reasignar con el MISMO plan y vencimiento en el mismo periodo de la anulada emite una cuota NUEVA de ese periodo', async () => {
      // Misma situación que [E5], pero el inicio 2026-10-10 cae dentro de la
      // ventana de emisión: el periodo del corte (2026-10) coincide con el de
      // la anulada y, como la anulada no lo ocupa, se emite la cuota
      // corregida: 2 filas (una anulada y otra vigente) con el monto del plan.
      sembrarCuotaAnulada({
        id: 'cuota-e5b-anulada',
        periodo: '2026-10',
        fechaCorteUtc: new Date('2026-10-10T03:59:59.999Z'),
      });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN, fechaInicio: '2026-10-10' },
        AHORA
      );

      expect(dto.fechaInicio).toBe('2026-10-10');
      expect(mockPerfilesAlumno[0].planSuscritoId).toBe(PLAN);
      expect(mockCuotasMembresia).toHaveLength(2);

      const anuladas = mockCuotasMembresia.filter((c) => c.estado === EstadoCuota.ANULADA);
      const vigentes = mockCuotasMembresia.filter((c) => c.estado !== EstadoCuota.ANULADA);
      expect(anuladas).toHaveLength(1);
      expect(vigentes).toHaveLength(1);
      expect(vigentes[0].periodo).toBe('2026-10');
      expect(vigentes[0].montoTotalUsd).toBe('40.00');
      // El ciclo avanza igual que en una emisión normal.
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-11-10');
    });
  });

  // ===========================================================================
  // E6 · Tras emitir y anular la cuota del ciclo, el perfil ya avanzó al ciclo
  // siguiente (así lo deja la emisión real: emitirCuotaDeCicloEnTx avanza
  // proximoCorte en la misma transacción). El barrido del mismo día NO crea
  // otra cuota del periodo anulado. E6b: sin anuladas, tampoco duplica la
  // vigente (regresión de la idempotencia del barrido).
  // ===========================================================================
  describe('E6 · tras anular con el ciclo ya avanzado, el barrido no crea otra cuota de ese periodo', () => {
    it('[E6] con la cuota del ciclo anulada y proximoCorte ya avanzado, emitirCuotasProgramadas no crea otra del periodo anulado', async () => {
      // Fixture real: la cuota del ciclo 2026-10 se emitió (proximoCorte avanzó
      // a 2026-11-10) y después se anuló. El mismo día 09-10 el corte 2026-11-10
      // aún no está en ventana, así que el barrido no emite nada.
      Object.assign(mockPerfilesAlumno[0], {
        planSuscritoId: PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-11-10',
      });
      sembrarCuotaAnulada({
        id: 'cuota-e6',
        periodo: '2026-10',
        fechaCorteUtc: instanteCorteUtc('2026-10-10', 'America/Caracas'),
      });

      const resumen = await finanzasService.emitirCuotasProgramadas(AHORA);

      // El barrido evaluó al alumno pero no emitió nada nuevo para el periodo.
      expect(resumen.evaluadas).toBe(1);
      expect(resumen.emitidas).toBe(0);
      expect(mockCuotasMembresia.filter((c) => c.periodo === '2026-10')).toHaveLength(1);
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-11-10');
    });

    it('[E6b] sin anuladas, el barrido no duplica una cuota vigente del mismo periodo', async () => {
      // Regresión: la cuota del ciclo 2026-10 sigue vigente y el barrido repite
      // el ciclo (proximoCorte aún en 2026-10-10). No inserta otra del periodo;
      // el ciclo avanza igual (barrido idempotente).
      Object.assign(mockPerfilesAlumno[0], {
        planSuscritoId: PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarCuota({ id: 'cuota-e6b', periodo: '2026-10' });

      const resumen = await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(resumen.evaluadas).toBe(1);
      expect(resumen.emitidas).toBe(0);
      expect(mockCuotasMembresia.filter((c) => c.periodo === '2026-10')).toHaveLength(1);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-11-10');
    });
  });
});
