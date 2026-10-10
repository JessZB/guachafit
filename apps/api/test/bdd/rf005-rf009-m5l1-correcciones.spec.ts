import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoAlumno, EstadoCuota, MetodoPago, Moneda, Rol } from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import {
  BillingSchedulerService,
  TIEMPO_MAX_COLA_COBRANZA_MS,
} from '../../src/modules/finanzas/billing-scheduler.service';
import { BillingReminderProcessor } from '../../src/modules/finanzas/billing-reminder.processor';
import {
  calcularDiaLocalHito,
  calcularTimestampHito,
} from '../../src/modules/finanzas/cobranza-hitos';
import {
  instanteUtcDesdeHoraLocal,
  instanteUtcDesdeMedianocheLocal,
} from '../../src/common/adherencia.util';
import { instanteCorteUtc } from '../../src/modules/finanzas/suscripcion-ciclo';

/**
 * M5-L1 (prompt 07): validación de las correcciones — contratos C1–C10.
 *
 * Cubre, test por test:
 * - C1: horario de verano en `instanteUtcDesdeHoraLocal` y `calcularTimestampHito`.
 * - C2: recordatorio del mismo día local (F2) con delay 0.
 * - C3: Redis caído (F1): `add`/`remove` que nunca resuelven o rechazan, y el barrido
 *       diario que termina aunque la cola cuelgue.
 * - C4/C5: solape al reasignar (decisión del dueño) y mensaje del rango de fechas (F7).
 * - C6: cobro en sala (F3/F9): efectivo obligatorio, alumno archivado, 23505 → 409,
 *       idempotencia con `x-idempotency-key`, `ahora` inyectado y referencia siempre null.
 * - C7: controlador con `x-idempotency-key`.
 * - C8: barrido revalida tras el bloqueo (F5).
 * - C9: `quitarSuscripcion(..., ahora)` sella `updatedAtUtc`.
 *
 * El mock de BD en memoria replica el de `rf005-rf008-suscripcion-servicio.spec.ts` y añade
 * soporte real de `innerJoin` (lo usa `calcularCoberturaVigente` para leer la duración del plan).
 */
describe('M5-L1 correcciones (prompt 07): contratos C1–C10', () => {
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

  const UUID_COACH = '11111111-1111-4111-8111-111111111111';
  const UUID_COACH_2 = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_USER = 'alumno-uuid-1';
  const ALUMNO_2_USER = 'alumno-uuid-2';
  const ALUMNO_3_USER = 'alumno-uuid-3';
  const PLAN = '99999999-9999-4999-8999-999999999999';
  const PLAN_TRIMESTRAL = '77777777-7777-4777-8777-777777777777';
  const PLAN_COACH_2 = '88888888-8888-4888-8888-888888888888';

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

  /**
   * Columnas presentes en una condición SQL (nombre + tabla), leídas del objeto drizzle.
   * Las columnas exponen `.table` (objeto de tabla) desde drizzle-orm.
   */
  function columnasDeCondicion(cond: any): Array<{ nombre: string; tabla: string | null }> {
    const columnas: Array<{ nombre: string; tabla: string | null }> = [];
    const visitar = (chunks: any) => {
      if (!Array.isArray(chunks)) return;
      for (const chunk of chunks) {
        if (chunk && typeof chunk.name === 'string' && chunk.table) {
          columnas.push({ nombre: chunk.name, tabla: getTableName(chunk.table) });
        } else if (chunk && Array.isArray(chunk.queryChunks)) {
          visitar(chunk.queryChunks);
        }
      }
    };
    visitar(cond?.queryChunks);
    return columnas;
  }

  /**
   * Evalúa la condición de un `innerJoin` sobre un par de filas (base + unida).
   * Para `eq(planesMembresia.id, cuotasMembresia.planId)` compara `planes.id` con `cuotas.plan_id`.
   */
  function evaluarJoin(filaBase: any, filaUnida: any, condicion: any, tablaUnida: any): boolean {
    const columnas = columnasDeCondicion(condicion);
    if (columnas.length < 2) return true;
    const nombreTablaUnida = getTableName(tablaUnida);
    const [a, b] = columnas;
    const intentar = (colUnida: any, colBase: any): boolean | null => {
      if (colUnida.tabla === nombreTablaUnida && colBase.tabla !== nombreTablaUnida) {
        return (
          valorDeColumna(filaUnida, colUnida.nombre) === valorDeColumna(filaBase, colBase.nombre)
        );
      }
      return null;
    };
    return (
      intentar(a, b) ??
      intentar(b, a) ?? (
        valorDeColumna(filaUnida, a.nombre) === valorDeColumna(filaBase, b.nombre) ||
        valorDeColumna(filaBase, a.nombre) === valorDeColumna(filaUnida, b.nombre)
      )
    );
  }

  function createMockDb() {
    const db: any = {
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

          const tablasUnidas: Array<{ tabla: any; condicion: any }> = [];
          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
            // M5-L1 correcciones: `calcularCoberturaVigente` usa innerJoin + duracionMeses del plan.
            innerJoin: vi.fn((tablaUnida: any, condicion: any) => {
              tablasUnidas.push({ tabla: tablaUnida, condicion });
              return queryObj;
            }),
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

              if (isJoinedSelection) {
                const joined = pagina.map((tx) => {
                  const alumno = mockPerfilesAlumno.find((a) => a.usuarioId === tx.clienteId);
                  return { tx, alumno };
                });
                return resolve(joined);
              }

              if (tablasUnidas.length > 0) {
                const fusionadas: any[] = [];
                for (const filaBase of pagina) {
                  let fusionada = { ...filaBase };
                  let descartada = false;
                  for (const { tabla: tablaUnida, condicion } of tablasUnidas) {
                    const filasUnidas = getTableArray(getTableName(tablaUnida));
                    const objetivo = filasUnidas.find((filaUnida) =>
                      evaluarJoin(filaBase, filaUnida, condicion, tablaUnida)
                    );
                    if (!objetivo) {
                      descartada = true;
                      break;
                    }
                    fusionada = { ...fusionada, ...objetivo };
                  }
                  if (!descartada) fusionadas.push(fusionada);
                }
                return resolve(fusionadas);
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
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  function sembrarAlumno(overrides: Record<string, any> = {}) {
    mockPerfilesAlumno.push({
      id: `perfil-${mockPerfilesAlumno.length + 1}`,
      usuarioId: `alumno-${mockPerfilesAlumno.length + 1}-uuid`,
      entrenadorId: UUID_COACH,
      nombres: 'Alumno',
      apellidos: `Numero ${mockPerfilesAlumno.length + 1}`,
      tasaFijadaOverride: null,
      zonaHoraria: 'America/Caracas',
      estadoActivacion: EstadoAlumno.ACTIVO,
      planSuscritoId: null,
      cicloAncla: null,
      proximoCorte: null,
      deletedAtUtc: null,
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
      fechaEmisionUtc: new Date(),
      fechaCorteUtc: new Date('2026-10-02T03:59:59.999Z'),
      estado: EstadoCuota.EMITIDA,
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
  }

  /** Deja al alumno base con una suscripción activa (sin cuotas emitidas). */
  function suscribirAlumnoBase(overrides: Record<string, any> = {}) {
    Object.assign(mockPerfilesAlumno[0], {
      planSuscritoId: PLAN,
      cicloAncla: '2026-10-01',
      proximoCorte: '2026-10-20',
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
      {
        id: PLAN_TRIMESTRAL,
        entrenadorId: UUID_COACH,
        nombre: 'Plan Trimestral',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '100.00',
        duracionMeses: 3,
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
  // C1 · Horario de verano (F6)
  // ===========================================================================
  describe('C1 · Horario de verano (F6): instanteUtcDesdeHoraLocal y calcularTimestampHito', () => {
    it('C1: el día en que se sale del horario de verano usa el offset nuevo (NY 09:00 → 14:00Z)', () => {
      expect(
        instanteUtcDesdeHoraLocal('2026-11-01', 9, 'America/New_York').toISOString()
      ).toBe('2026-11-01T14:00:00.000Z');
    });

    it('C1: el día en que se entra en el horario de verano usa el offset nuevo (NY 09:00 → 13:00Z)', () => {
      expect(
        instanteUtcDesdeHoraLocal('2026-03-08', 9, 'America/New_York').toISOString()
      ).toBe('2026-03-08T13:00:00.000Z');
    });

    it('C1: hora 0 es equivalente a instanteUtcDesdeMedianocheLocal (Caracas → 04:00Z)', () => {
      expect(instanteUtcDesdeHoraLocal('2026-10-09', 0, 'America/Caracas').toISOString()).toBe(
        '2026-10-09T04:00:00.000Z'
      );
      expect(
        instanteUtcDesdeHoraLocal('2026-10-09', 0, 'America/Caracas').getTime()
      ).toBe(instanteUtcDesdeMedianocheLocal('2026-10-09', 'America/Caracas').getTime());
    });

    it('C1: una zona inválida se trata como UTC', () => {
      expect(instanteUtcDesdeHoraLocal('2026-10-09', 9, 'Zona/Falsa').toISOString()).toBe(
        '2026-10-09T09:00:00.000Z'
      );
    });

    it('C1: calcularDiaLocalHito resta 5 días en el día LOCAL del corte (NY → 2026-11-01)', () => {
      expect(
        calcularDiaLocalHito(new Date('2026-11-07T04:59:59.999Z'), 'T_MINUS_5', 'America/New_York')
      ).toBe('2026-11-01');
    });

    it('C1: calcularTimestampHito da las 09:00 locales reales del día del hito (NY → 14:00Z)', () => {
      expect(
        calcularTimestampHito(
          new Date('2026-11-07T04:59:59.999Z'),
          'T_MINUS_5',
          'America/New_York'
        ).toISOString()
      ).toBe('2026-11-01T14:00:00.000Z');
    });
  });

  // ===========================================================================
  // C2 · Recordatorio del mismo día (F2)
  // ===========================================================================
  describe('C2 · Recordatorio del mismo día (F2): programarRecordatoriosCuota', () => {
    const CUOTA_ID = 'cuota-c2';
    let mockQueue: any;
    let scheduler: BillingSchedulerService;

    beforeEach(() => {
      mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-mock' }),
        remove: vi.fn().mockResolvedValue(1),
      };
      scheduler = new BillingSchedulerService(mockQueue);
    });

    it('C2: un hito del mismo día local se agenda con delay 0 aunque su hora (09:00) ya pasó', async () => {
      const corte = instanteCorteUtc('2026-10-14', 'Europe/Madrid');
      const ahora = new Date('2026-10-09T13:00:00.000Z'); // 15:00 en Madrid

      const programados = await scheduler.programarRecordatoriosCuota(
        { id: CUOTA_ID, fechaCorteUtc: corte, zonaHoraria: 'Europe/Madrid' },
        ahora
      );

      expect(programados).toEqual(['T_MINUS_5', 'T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);

      const llamadaT5 = mockQueue.add.mock.calls.find((c: any[]) => c[1].hito === 'T_MINUS_5');
      expect(llamadaT5).toBeDefined();
      expect(llamadaT5[2].delay).toBe(0);
      // El timestamp sigue siendo el 09:00 local REAL (07:00Z), no la hora de emisión.
      expect(llamadaT5[1].timestampHitoUtc).toBe('2026-10-09T07:00:00.000Z');

      for (const hito of ['T_MINUS_1', 'T_ZERO', 'T_PLUS_2']) {
        const llamada = mockQueue.add.mock.calls.find((c: any[]) => c[1].hito === hito);
        expect(llamada[2].delay).toBeGreaterThan(0);
      }
    });

    it('C2: si el T-5 cayó AYER en el día local, NO se agenda (devuelve los otros 3)', async () => {
      const corte = instanteCorteUtc('2026-10-14', 'Europe/Madrid');
      const ahora = new Date('2026-10-10T13:00:00.000Z'); // 15:00 del 10 en Madrid

      const programados = await scheduler.programarRecordatoriosCuota(
        { id: CUOTA_ID, fechaCorteUtc: corte, zonaHoraria: 'Europe/Madrid' },
        ahora
      );

      expect(programados).toEqual(['T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      expect(mockQueue.add.mock.calls.some((c: any[]) => c[1].hito === 'T_MINUS_5')).toBe(false);
    });

    it('C2: sin zona horaria se mantiene el comportamiento previo (un hito pasado se omite)', async () => {
      const corte = new Date('2026-10-14T23:59:59.000Z');
      const ahora = new Date('2026-10-10T12:00:00.000Z'); // el T-5 (09-oct 23:59Z) ya pasó

      const programados = await scheduler.programarRecordatoriosCuota({ id: CUOTA_ID, fechaCorteUtc: corte }, ahora);

      expect(programados).toEqual(['T_MINUS_1', 'T_ZERO', 'T_PLUS_2']);
      expect(mockQueue.add.mock.calls.some((c: any[]) => c[1].hito === 'T_MINUS_5')).toBe(false);
    });
  });

  // ===========================================================================
  // C3 · Redis caído (F1)
  // ===========================================================================
  describe('C3 · Redis caído (F1): la cola no responde', () => {
    const CUOTA_ID = 'cuota-c3';
    const AHORA = new Date('2026-10-01T00:00:00.000Z');
    const CORTE = new Date('2026-10-14T23:59:59.000Z');

    afterEach(() => {
      vi.useRealTimers();
    });

    it('C3: add que nunca resuelve → programar termina, devuelve [] y deja de intentar el resto', async () => {
      vi.useFakeTimers();
      const mockQueue = { add: vi.fn(() => new Promise(() => {})), remove: vi.fn() };
      const scheduler = new BillingSchedulerService(mockQueue as any);

      const promesa = scheduler.programarRecordatoriosCuota({ id: CUOTA_ID, fechaCorteUtc: CORTE }, AHORA);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      const programados = await promesa;

      expect(programados).toEqual([]);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('C3: add que rechaza en el segundo hito → devuelve solo el primero y no lanza', async () => {
      const mockQueue = {
        add: vi
          .fn()
          .mockResolvedValueOnce({ id: 'job-1' })
          .mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:6379')),
        remove: vi.fn(),
      };
      const scheduler = new BillingSchedulerService(mockQueue as any);

      const programados = await scheduler.programarRecordatoriosCuota({ id: CUOTA_ID, fechaCorteUtc: CORTE }, AHORA);

      expect(programados).toEqual(['T_MINUS_5']);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('C3: remove que nunca resuelve → cancelar termina, devuelve 0 y se llamó una sola vez', async () => {
      vi.useFakeTimers();
      const mockQueue = { add: vi.fn(), remove: vi.fn(() => new Promise(() => {})) };
      const scheduler = new BillingSchedulerService(mockQueue as any);

      const promesa = scheduler.cancelarRecordatoriosCuota(CUOTA_ID);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      const eliminados = await promesa;

      expect(eliminados).toBe(0);
      expect(mockQueue.remove).toHaveBeenCalledTimes(1);
    });

    it('C3: un remove que rechaza no corta la cancelación; solo el tiempo agotado la corta', async () => {
      const mockQueue = {
        add: vi.fn(),
        remove: vi
          .fn()
          .mockRejectedValueOnce(new Error('Job is active and cannot be removed'))
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
      };
      const scheduler = new BillingSchedulerService(mockQueue as any);

      const eliminados = await scheduler.cancelarRecordatoriosCuota(CUOTA_ID);

      expect(eliminados).toBe(3);
      expect(mockQueue.remove).toHaveBeenCalledTimes(4);
    });

    it('C3: con la cola colgada, el barrido diario termina, emite la cuota y ejecuta el barrido de estados', async () => {
      vi.useFakeTimers();
      suscribirAlumnoBase({ cicloAncla: '2026-10-10', proximoCorte: '2026-10-10' });

      const mockQueue = { add: vi.fn(() => new Promise(() => {})), remove: vi.fn() };
      const schedulerColgado = new BillingSchedulerService(mockQueue as any);
      const servicio = new FinanzasService(mockDb, undefined, undefined, schedulerColgado);
      const processor = new BillingReminderProcessor(
        mockDb,
        { emitAsync: vi.fn().mockResolvedValue([]) } as any,
        servicio,
        { add: vi.fn() } as any,
        ((_contexto: any, fn: any) => fn(mockDb)) as any
      );

      const ahora = new Date('2026-10-09T12:00:00.000Z');
      const promesa = processor.procesarBarridoDiario(ahora);
      await vi.advanceTimersByTimeAsync(TIEMPO_MAX_COLA_COBRANZA_MS + 1);
      const resultado = await promesa;

      // La emisión no se cuelga y el barrido de estados corre igualmente.
      expect(resultado.cuotasEmitidas).toBe(1);
      expect(resultado.evaluadas).toBe(1);
      expect(resultado.actualizadas).toBe(1);
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.POR_VENCER);
    });
  });

  // ===========================================================================
  // C4 · Solape al reasignar (decisión del dueño) + C5 · Mensaje del rango (F7)
  // ===========================================================================
  describe('C4/C5 · asignarSuscripcion: solape al reasignar y mensaje del rango de fechas', () => {
    const AHORA = new Date('2026-10-09T15:00:00.000Z'); // 11:00 del 09-10 en Caracas
    const MENSAJE_CUBIERTO_01_11 =
      'Este alumno ya tiene cubierto hasta el 01/11/2026. Elige esa fecha o una posterior, o cambia el plan sin quitarlo.';

    it('C4: con una cuota mensual vigente rechaza la fecha dentro de la cobertura y NO cambia el perfil', async () => {
      sembrarCuota({ fechaCorteUtc: new Date('2026-10-02T03:59:59.999Z') }); // vence el 01/10 local

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          ALUMNO_USER,
          { planId: PLAN, fechaInicio: '2026-10-20' },
          AHORA
        )
      ).rejects.toThrow(MENSAJE_CUBIERTO_01_11);

      expect(mockPerfilesAlumno[0].planSuscritoId).toBeNull();
      expect(mockPerfilesAlumno[0].cicloAncla).toBeNull();
      expect(mockCuotasMembresia).toHaveLength(1);
    });

    it('C4: la fecha exacta de fin de cobertura (2026-11-01) se acepta sin error', async () => {
      sembrarCuota({ fechaCorteUtc: new Date('2026-10-02T03:59:59.999Z') });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN, fechaInicio: '2026-11-01' },
        AHORA
      );

      expect(dto.fechaInicio).toBe('2026-11-01');
      expect(mockPerfilesAlumno[0].planSuscritoId).toBe(PLAN);
    });

    it('C4: una cuota ANULADA no bloquea el solape', async () => {
      sembrarCuota({ estado: EstadoCuota.ANULADA });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN, fechaInicio: '2026-10-20' },
        AHORA
      );

      expect(dto.fechaInicio).toBe('2026-10-20');
      expect(mockPerfilesAlumno[0].planSuscritoId).toBe(PLAN);
    });

    it('C4: un plan previo trimestral cubre hasta el 01/01/2027', async () => {
      sembrarCuota({
        planId: PLAN_TRIMESTRAL,
        fechaCorteUtc: new Date('2026-10-02T03:59:59.999Z'),
      });

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          ALUMNO_USER,
          { planId: PLAN, fechaInicio: '2026-12-01' },
          AHORA
        )
      ).rejects.toThrow(
        'Este alumno ya tiene cubierto hasta el 01/01/2027. Elige esa fecha o una posterior, o cambia el plan sin quitarlo.'
      );
    });

    it('C4: sin cuotas previas no hay restricción de solape (solo la del rango)', async () => {
      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN, fechaInicio: '2026-10-20' },
        AHORA
      );

      expect(dto.fechaInicio).toBe('2026-10-20');
      expect(mockCuotasMembresia).toHaveLength(0);
    });

    it('C4: un cambio de plan con suscripción vigente (sin fechaInicio) no pasa por la regla de solape', async () => {
      suscribirAlumnoBase({ cicloAncla: '2026-08-15', proximoCorte: '2026-12-15' });
      sembrarCuota({ fechaCorteUtc: new Date('2026-12-16T03:59:59.999Z') });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        ALUMNO_USER,
        { planId: PLAN_TRIMESTRAL },
        AHORA
      );

      expect(dto.planId).toBe(PLAN_TRIMESTRAL);
      expect(dto.fechaInicio).toBe('2026-08-15');
    });

    it('C5: fechaInicio fuera de la ventana usa el mensaje nuevo con fechas concretas', async () => {
      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          ALUMNO_USER,
          { planId: PLAN, fechaInicio: '2026-08-01' },
          AHORA
        )
      ).rejects.toThrow('Elige una fecha de inicio entre el 09/09/2026 y el 08/12/2026.');
    });
  });

  // ===========================================================================
  // C6 · Cobro en sala (F3/F9)
  // ===========================================================================
  describe('C6 · Cobro en sala: efectivo obligatorio, archivado, 23505, idempotencia y referencia', () => {
    const AHORA = new Date('2026-10-09T15:00:00.000Z');
    const DTO_EFECTIVO = {
      montoOriginal: '40.00',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.EFECTIVO_USD,
      fechaOperacion: '2026-10-09',
    };

    function interceptarInsercionDeCuota(error: unknown) {
      const insertOriginal = mockDb.insert.getMockImplementation()!;
      mockDb.insert.mockImplementation((tabla: any) => {
        if (getTableName(tabla) === 'cuotas_membresia') {
          return { values: () => ({ returning: () => Promise.reject(error) }) };
        }
        return insertOriginal(tabla);
      });
    }

    it('C6: un método no efectivo con alumno suscrito y sin cuota abierta falla ANTES de emitir', async () => {
      suscribirAlumnoBase();

      const capturado = await finanzasService
        .cobroDirectoInteligente(
          UUID_COACH,
          ALUMNO_USER,
          {
            ...DTO_EFECTIVO,
            metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
            referenciaBancaria: 'ref-1234',
          },
          undefined,
          AHORA
        )
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(BadRequestException);
      expect((capturado as Error).message).toBe(
        'El cobro en sala solo acepta efectivo (dólares o bolívares).'
      );
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockTransaccionesPago).toHaveLength(0);
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-10-20');
    });

    it('C6: un alumno archivado responde 404 con MENSAJE_ALUMNO_FUERA_DE_LISTA', async () => {
      mockPerfilesAlumno[0].deletedAtUtc = new Date();

      const capturado = await finanzasService
        .cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, AHORA)
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(NotFoundException);
      expect((capturado as Error).message).toBe('Este alumno no está en tu lista.');
    });

    it('C6: el 23505 de uq_cuota_cliente_plan_periodo se mapea a ConflictException (constraint_name)', async () => {
      suscribirAlumnoBase();
      interceptarInsercionDeCuota(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint_name: 'uq_cuota_cliente_plan_periodo',
        })
      );

      const capturado = await finanzasService
        .cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, AHORA)
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(ConflictException);
      expect((capturado as Error).message).toBe(
        'No pudimos preparar la próxima cuota de este alumno. Actualiza la pantalla e inténtalo de nuevo.'
      );
    });

    it('C6: el 23505 con `constraint` (pg) también se mapea a 409', async () => {
      suscribirAlumnoBase();
      interceptarInsercionDeCuota(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_cuota_cliente_plan_periodo',
        })
      );

      await expect(
        finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, AHORA)
      ).rejects.toThrow(ConflictException);
    });

    it('C6: el 23505 envuelto en `cause` también se mapea a 409', async () => {
      suscribirAlumnoBase();
      interceptarInsercionDeCuota(
        new Error('fallo al insertar cuota', {
          cause: Object.assign(new Error('unique violation'), {
            code: '23505',
            constraint: 'uq_cuota_cliente_plan_periodo',
          }),
        })
      );

      await expect(
        finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, AHORA)
      ).rejects.toThrow(ConflictException);
    });

    it('C6: otro 23505 (otro índice) se propaga tal cual, sin convertirse en 409', async () => {
      suscribirAlumnoBase();
      const errorAjeno = Object.assign(new Error('otro índice único'), {
        code: '23505',
        constraint_name: 'uq_otro_indice',
      });
      interceptarInsercionDeCuota(errorAjeno);

      const capturado = await finanzasService
        .cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, AHORA)
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(Error);
      expect(capturado).not.toBeInstanceOf(ConflictException);
      expect((capturado as Error).message).toBe('otro índice único');
    });

    it('C6: la MISMA clave de idempotencia produce un único cobro y una sola cuota adelantada', async () => {
      suscribirAlumnoBase();

      const primera = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        DTO_EFECTIVO,
        'clave-abc',
        AHORA
      );
      const segunda = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        DTO_EFECTIVO,
        'clave-abc',
        AHORA
      );

      expect(mockTransaccionesPago).toHaveLength(1);
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(segunda).toEqual(primera);
    });

    it('C6: claves distintas producen dos cobros', async () => {
      suscribirAlumnoBase();

      await finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, 'clave-1', AHORA);
      await finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, 'clave-2', AHORA);

      expect(mockTransaccionesPago).toHaveLength(2);
      expect(mockCuotasMembresia).toHaveLength(2);
    });

    it('C6: la misma clave con otro alumno u otro entrenador NO reutiliza la respuesta', async () => {
      suscribirAlumnoBase();
      sembrarAlumno({
        usuarioId: ALUMNO_2_USER,
        planSuscritoId: PLAN,
        cicloAncla: '2026-10-01',
        proximoCorte: '2026-10-20',
      });
      mockPerfilesEntrenador.push({
        id: 'perfil-coach-2',
        usuarioId: UUID_COACH_2,
        nombres: 'Otra',
        apellidos: 'Coach',
        tasaCambioGlobal: '60.0000',
      });
      mockPlanesMembresia.push({
        id: PLAN_COACH_2,
        entrenadorId: UUID_COACH_2,
        nombre: 'Plan de la coach 2',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '40.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
      sembrarAlumno({
        usuarioId: ALUMNO_3_USER,
        entrenadorId: UUID_COACH_2,
        planSuscritoId: PLAN_COACH_2,
        cicloAncla: '2026-10-01',
        proximoCorte: '2026-10-20',
      });

      await finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, 'clave-compartida', AHORA);
      await finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_2_USER, DTO_EFECTIVO, 'clave-compartida', AHORA);
      await finanzasService.cobroDirectoInteligente(UUID_COACH_2, ALUMNO_3_USER, DTO_EFECTIVO, 'clave-compartida', AHORA);

      expect(mockTransaccionesPago).toHaveLength(3);
      expect(mockTransaccionesPago[2].entrenadorId).toBe(UUID_COACH_2);
      expect(mockTransaccionesPago[2].clienteId).toBe(ALUMNO_3_USER);
    });

    it('C6: la cuota adelantada lleva fechaEmisionUtc igual al `ahora` inyectado', async () => {
      suscribirAlumnoBase();
      const ahoraFijo = new Date('2026-10-09T15:00:00.000Z');

      await finanzasService.cobroDirectoInteligente(UUID_COACH, ALUMNO_USER, DTO_EFECTIVO, undefined, ahoraFijo);

      expect(new Date(mockCuotasMembresia[0].fechaEmisionUtc).getTime()).toBe(ahoraFijo.getTime());
    });

    it('C6: cobroDirecto (y el inteligente) guarda referenciaBancaria null aunque el DTO la traiga', async () => {
      sembrarCuota({ id: 'cuota-abierta-c6' });

      const directo = await finanzasService.cobroDirecto('cuota-abierta-c6', UUID_COACH, {
        ...DTO_EFECTIVO,
        referenciaBancaria: 'ref-sala-999',
      });

      expect(directo.transaccion.referenciaBancaria).toBeNull();
      expect(mockTransaccionesPago[0].referenciaBancaria).toBeNull();

      suscribirAlumnoBase();
      const inteligente = await finanzasService.cobroDirectoInteligente(
        UUID_COACH,
        ALUMNO_USER,
        { ...DTO_EFECTIVO, referenciaBancaria: 'ref-sala-999' },
        undefined,
        AHORA
      );

      expect(inteligente.transaccion.referenciaBancaria).toBeNull();
      expect(mockTransaccionesPago[1].referenciaBancaria).toBeNull();
    });
  });

  // ===========================================================================
  // C7 · Controlador: x-idempotency-key
  // ===========================================================================
  describe('C7 · Controlador: POST /finanzas/clientes/:clienteId/cobro-directo-inteligente', () => {
    const UUID_ALUMNO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const req = { user: { sub: UUID_COACH, entrenadorId: UUID_COACH, rol: Rol.ENTRENADOR } };
    const BODY = {
      montoOriginal: '40.00',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.EFECTIVO_USD,
      fechaOperacion: '2026-10-09',
    };

    function crearControladorConEspia() {
      const servicio = { cobroDirectoInteligente: vi.fn().mockResolvedValue({ ok: true }) };
      return { servicio, controlador: new FinanzasController(servicio as any) };
    }

    it('C7: con x-idempotency-key delega el header como 4º argumento del servicio', async () => {
      const { servicio, controlador } = crearControladorConEspia();

      await (controlador as any).cobroDirectoInteligente(req, UUID_ALUMNO, 'abc', BODY);

      expect(servicio.cobroDirectoInteligente).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, BODY, 'abc');
    });

    it('C7: sin header, el 4º argumento es undefined', async () => {
      const { servicio, controlador } = crearControladorConEspia();

      await (controlador as any).cobroDirectoInteligente(req, UUID_ALUMNO, undefined, BODY);

      expect(servicio.cobroDirectoInteligente).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, BODY, undefined);
    });

    it('C7: la ruta conserva método POST, path y rol ENTRENADOR', () => {
      const handler = (FinanzasController.prototype as any).cobroDirectoInteligente;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        'clientes/:clienteId/cobro-directo-inteligente'
      );
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Rol.ENTRENADOR]);
    });
  });

  // ===========================================================================
  // C8 · Barrido revalida tras el bloqueo (F5)
  // ===========================================================================
  describe('C8 · emitirCuotasProgramadas revalida tras el bloqueo (F5)', () => {
    const AHORA = new Date('2026-10-09T12:00:00.000Z');

    /** El candidato sale de un espía; la relectura con bloqueo lee la fila REAL del store. */
    function interceptarLecturaDeCandidatos() {
      const perfil = mockPerfilesAlumno[0];
      const candidato = { id: perfil.id, entrenadorId: perfil.entrenadorId };
      mockDb.select.mockImplementationOnce(() => ({
        from: () => ({
          where: () => Promise.resolve([candidato]),
        }),
      }));
    }

    it('C8: control — el candidato interceptado con fila activa sí emite', async () => {
      suscribirAlumnoBase({ cicloAncla: '2026-10-10', proximoCorte: '2026-10-10' });
      interceptarLecturaDeCandidatos();

      const resultado = await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(resultado).toEqual({ evaluadas: 1, emitidas: 1, omitidas: 0 });
      expect(mockCuotasMembresia).toHaveLength(1);
    });

    it('C8: si al releer con bloqueo el perfil está PAUSADO no emite, no avanza y no es error', async () => {
      suscribirAlumnoBase({
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      });
      interceptarLecturaDeCandidatos();

      const resultado = await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(resultado).toEqual({ evaluadas: 1, emitidas: 0, omitidas: 0 });
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-10-10');
    });

    it('C8: si al releer con bloqueo el perfil tiene deletedAtUtc no emite, no avanza y no es error', async () => {
      suscribirAlumnoBase({
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
        deletedAtUtc: new Date(),
      });
      interceptarLecturaDeCandidatos();

      const resultado = await finanzasService.emitirCuotasProgramadas(AHORA);

      expect(resultado).toEqual({ evaluadas: 1, emitidas: 0, omitidas: 0 });
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-10-10');
    });
  });

  // ===========================================================================
  // C9 · quitarSuscripcion(entrenadorId, clienteId, ahora) (F8)
  // ===========================================================================
  describe('C9 · quitarSuscripcion sella updatedAtUtc con el ahora inyectado (F8)', () => {
    it('C9: updatedAtUtc del perfil queda igual al `ahora` inyectado', async () => {
      suscribirAlumnoBase();
      const ahora = new Date('2026-10-09T15:00:00.000Z');

      await finanzasService.quitarSuscripcion(UUID_COACH, ALUMNO_USER, ahora);

      expect(mockPerfilesAlumno[0].planSuscritoId).toBeNull();
      expect(new Date(mockPerfilesAlumno[0].updatedAtUtc).getTime()).toBe(ahora.getTime());
    });
  });
});
