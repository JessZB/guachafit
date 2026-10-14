import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Rol, EstadoAlumno, EstadoCuota } from '@guachafit/shared';
import * as shared from '@guachafit/shared';
import type { SuscripcionAlumnoDTO } from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * M5-L1 (RF-005 / RF-008): suscripción de plan por alumno, emisión automática de cuotas y rutas.
 *
 * Reutiliza el patrón de BD simulada en memoria de `finanzas-service.spec.ts` (drizzle mock).
 * En fase roja este spec FALLA porque los métodos `asignarSuscripcion`, `quitarSuscripcion`,
 * `obtenerSuscripcion` y `emitirCuotasProgramadas` de `FinanzasService`, las rutas de
 * `FinanzasController` y el esquema `AsignarSuscripcionSchema` todavía no existen.
 *
 * §C (contrato compartido) · §E (servicio y barrido) · §F (controlador) · §G4 (hidratación del
 * plan activo de AlumnosService).
 */
describe('M5-L1: suscripción, emisión automática y rutas (RF-005 / RF-008)', () => {
  let finanzasService: FinanzasService;
  let mockScheduler: any;
  let mockDb: any;

  // Store en memoria para la BD simulada (mismo patrón que finanzas-service.spec.ts).
  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPerfilesAlumno: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  const UUID_COACH = '11111111-1111-4111-8111-111111111111';
  const UUID_ALUMNO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const UUID_PLAN = '99999999-9999-4999-8999-999999999999';
  const AHORA_CARACAS = new Date('2026-10-09T12:00:00.000Z'); // 2026-10-09 08:00 en Caracas

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
          // M5-L1: `<>`/`!=` antes que los comparadores simples (el '<' de '<>' no es 'lt').
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

  /** Columnas de una condición SQL (nombre + tabla); drizzle expone `.table` en cada columna. */
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

  /** Evalúa la condición de un `innerJoin` (p. ej. `planes.id = cuotas.plan_id`). */
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
          let isJoinedSelection = false;

          if (fieldsSelection && typeof fieldsSelection === 'object' && fieldsSelection.tx && fieldsSelection.alumno) {
            isJoinedSelection = true;
          }

          const tablasUnidas: Array<{ tabla: any; condicion: any }> = [];
          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
            // M5-L1 correcciones: `calcularCoberturaVigente` usa innerJoin y lee `duracionMeses`
            // del plan; el mock resuelve la condición de join contra el store real.
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
          // M5-L1: se inserta sobre el store REAL (no sobre una copia) para que los barridos
          // idempotentes puedan re-leer lo insertado por una llamada anterior.
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
      clienteId: 'alumno-uuid-1',
      entrenadorId: UUID_COACH,
      planId: UUID_PLAN,
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      fechaEmisionUtc: new Date(),
      fechaCorteUtc: new Date('2026-11-01T03:59:59.999Z'),
      estado: EstadoCuota.EMITIDA,
      ...overrides,
    });
    return mockCuotasMembresia[mockCuotasMembresia.length - 1];
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: UUID_COACH, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: 'alumno-uuid-1', email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
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
        usuarioId: 'alumno-uuid-1',
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
        id: UUID_PLAN,
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
  // §C. CONTRATOS COMPARTIDOS (packages/shared)
  // ===========================================================================
  describe('§C: contrato compartido de la suscripción (RF-005)', () => {
    const AsignarSuscripcionSchema = (shared as unknown as { AsignarSuscripcionSchema?: any })
      .AsignarSuscripcionSchema;

    it('AsignarSuscripcionSchema acepta planId uuid con fechaInicio opcional YYYY-MM-DD', () => {
      expect(AsignarSuscripcionSchema, 'AsignarSuscripcionSchema debe existir en @guachafit/shared').toBeDefined();

      const conFecha = AsignarSuscripcionSchema.safeParse({
        planId: UUID_PLAN,
        fechaInicio: '2026-10-09',
      });
      expect(conFecha.success).toBe(true);

      const sinFecha = AsignarSuscripcionSchema.safeParse({ planId: UUID_PLAN });
      expect(sinFecha.success).toBe(true);
      expect(sinFecha.data.fechaInicio).toBeUndefined();
    });

    it('AsignarSuscripcionSchema rechaza un planId que no es UUID', () => {
      expect(AsignarSuscripcionSchema, 'AsignarSuscripcionSchema debe existir en @guachafit/shared').toBeDefined();

      const resultado = AsignarSuscripcionSchema.safeParse({ planId: 'no-es-uuid' });
      expect(resultado.success).toBe(false);
    });

    it('AsignarSuscripcionSchema rechaza una fechaInicio con formato inválido', () => {
      expect(AsignarSuscripcionSchema, 'AsignarSuscripcionSchema debe existir en @guachafit/shared').toBeDefined();

      const resultado = AsignarSuscripcionSchema.safeParse({
        planId: UUID_PLAN,
        fechaInicio: '09/10/2026',
      });
      expect(resultado.success).toBe(false);
    });

    it('AsignarSuscripcionSchema rechaza fechas inexistentes en el calendario (2026-02-30)', () => {
      expect(AsignarSuscripcionSchema, 'AsignarSuscripcionSchema debe existir en @guachafit/shared').toBeDefined();

      const resultado = AsignarSuscripcionSchema.safeParse({
        planId: UUID_PLAN,
        fechaInicio: '2026-02-30',
      });
      expect(resultado.success).toBe(false);
    });

    it('SuscripcionAlumnoDTO declara los 7 campos del contrato en shared/src/types/', () => {
      const dirTipos = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/shared/src/types'
      );
      const fuente = fs
        .readdirSync(dirTipos)
        .filter((nombre) => nombre.endsWith('.ts'))
        .sort()
        .map((nombre) => fs.readFileSync(path.join(dirTipos, nombre), 'utf8'))
        .join('\n');
      const bloque =
        fuente.match(/export interface SuscripcionAlumnoDTO\s*\{([\s\S]*?)\}/)?.[1] ?? '';

      expect(bloque).toContain('clienteId: string');
      expect(bloque).toContain('planId: string');
      expect(bloque).toContain('planNombre: string');
      expect(bloque).toContain('duracionMeses: number');
      expect(bloque).toContain('fechaInicio: string');
      expect(bloque).toContain('proximoCorte: string');
      expect(bloque).toContain('cuotaEmitidaId: string | null');

      // Verificación de tipos en compilación (el runtime de vitest no tipa): el DTO del contrato.
      const dto: SuscripcionAlumnoDTO = {
        clienteId: 'alumno-uuid-1',
        planId: UUID_PLAN,
        planNombre: 'Plan Mensual Estándar',
        duracionMeses: 1,
        fechaInicio: '2026-10-09',
        proximoCorte: '2026-11-09',
        cuotaEmitidaId: null,
      };
      expect(dto.duracionMeses).toBe(1);
    });
  });

  // ===========================================================================
  // §E. FinanzasService — suscripción y emisión automática
  // ===========================================================================
  describe('§E: FinanzasService — suscripción y emisión automática (RF-005 / RF-008)', () => {
    it('§E1: asigna el plan, emite la cuota del corte vigente y avanza proximoCorte', async () => {
      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
        AHORA_CARACAS
      );

      expect(dto.clienteId).toBe('alumno-uuid-1');
      expect(dto.planId).toBe(UUID_PLAN);
      expect(dto.planNombre).toBe('Plan Mensual Estándar');
      expect(dto.duracionMeses).toBe(1);
      expect(dto.fechaInicio).toBe('2026-10-09');
      expect(dto.proximoCorte).toBe('2026-11-09');

      expect(mockCuotasMembresia).toHaveLength(1);
      const cuota = mockCuotasMembresia[0];
      expect(dto.cuotaEmitidaId).toBe(cuota.id);
      expect(cuota.periodo).toBe('2026-10');
      expect(cuota.montoTotalUsd).toBe('40.00');
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);
      expect(new Date(cuota.fechaCorteUtc).toISOString()).toBe('2026-10-10T03:59:59.999Z');
      expect(new Date(cuota.fechaEmisionUtc).getTime()).toBe(AHORA_CARACAS.getTime());

      const perfil = mockPerfilesAlumno[0];
      expect(perfil.planSuscritoId).toBe(UUID_PLAN);
      expect(perfil.cicloAncla).toBe('2026-10-09');
      expect(perfil.proximoCorte).toBe('2026-11-09');

      // §E1: tras el commit agenda los recordatorios pasando la zona horaria del alumno.
      expect(mockScheduler.programarRecordatoriosCuota).toHaveBeenCalledWith(
        expect.objectContaining({
          id: cuota.id,
          fechaCorteUtc: expect.any(Date),
          zonaHoraria: 'America/Caracas',
        })
      );
    });

    it('§E1: una fechaInicio lejana (2026-10-30) no emite cuota y deja proximoCorte en la fecha de inicio', async () => {
      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-30' },
        AHORA_CARACAS
      );

      expect(dto.cuotaEmitidaId).toBeNull();
      expect(dto.proximoCorte).toBe('2026-10-30');
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
    });

    it('§E1: sin fechaInicio en una suscripción nueva exige elegir la fecha', async () => {
      await expect(
        finanzasService.asignarSuscripcion(UUID_COACH, 'alumno-uuid-1', { planId: UUID_PLAN }, AHORA_CARACAS)
      ).rejects.toThrow('Elige la fecha de inicio del plan.');
    });

    it('§E1: fechaInicio fuera de la ventana [hoy-30, hoy+60] se rechaza (bordes inclusive)', async () => {
      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-09-08' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Elige una fecha de inicio entre el 09/09/2026 y el 08/12/2026.');

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-12-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Elige una fecha de inicio entre el 09/09/2026 y el 08/12/2026.');

      // El borde inferior exacto (hace 30 días) SÍ es válido.
      const borde = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-09-09' },
        AHORA_CARACAS
      );
      expect(borde.fechaInicio).toBe('2026-09-09');
    });

    it('§E1: alumno ajeno, inexistente o eliminado lógicamente → 404 de cartera', async () => {
      await expect(
        finanzasService.asignarSuscripcion(
          'coach-uuid-ajeno',
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Este alumno no está en tu lista.');

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          '00000000-0000-4000-8000-000000000000',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Este alumno no está en tu lista.');

      mockPerfilesAlumno[0].deletedAtUtc = new Date();
      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Este alumno no está en tu lista.');
    });

    it('§E1: plan ajeno → 404 de catálogo; plan desactivado → 400 explícito', async () => {
      mockPlanesMembresia.push({
        id: 'plan-uuid-ajeno',
        entrenadorId: 'coach-uuid-ajeno',
        nombre: 'Plan de otro coach',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '20.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: 'plan-uuid-ajeno', fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Ese plan no está en tu catálogo. Actualiza la pantalla.');

      mockPlanesMembresia[0].activo = false;
      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow('Ese plan está desactivado. Actívalo en Ajustes o elige otro.');
    });

    it('§E1 RN-03: el precio acordado del alumno gana sobre el precio base del plan', async () => {
      mockOverridesClientePlan.push({
        id: 'override-1',
        planId: UUID_PLAN,
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '35.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
        AHORA_CARACAS
      );

      expect(mockCuotasMembresia[0].montoTotalUsd).toBe('35.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
    });

    it('§E1 becado: un override de 0.00 emite al_dia sin recordatorios de cobro', async () => {
      mockOverridesClientePlan.push({
        id: 'override-beca',
        planId: UUID_PLAN,
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '0.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: 'Beca',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
        AHORA_CARACAS
      );

      expect(dto.cuotaEmitidaId).not.toBeNull();
      expect(mockCuotasMembresia[0].montoTotalUsd).toBe('0.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.AL_DIA);
      expect(mockScheduler.programarRecordatoriosCuota).not.toHaveBeenCalled();
    });

    // M5 P1 (A4 · migración): las reglas del POST retirado `POST /finanzas/cuotas/emitir`
    // que no tenían cobertura en la emisión por suscripción se recolocan aquí:
    // 1) la cuota nace con saldo igual al total y sin abonos (invariante al emitir);
    // 2) un plan con precio 0 sin override de precio NO emite cuota (nunca se inventa un monto).
    it('§E1: la cuota nace con saldo igual al total y sin abonos', async () => {
      await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
        AHORA_CARACAS
      );

      const cuota = mockCuotasMembresia[0];
      expect(cuota.montoTotalUsd).toBe('40.00');
      expect(cuota.montoAbonadoUsd).toBe('0.00');
      expect(cuota.saldoPendienteUsd).toBe('40.00');
      expect(cuota.estado).toBe(EstadoCuota.EMITIDA);
    });

    it('§E1: un plan con precio 0 sin override de precio NO emite cuota (no se inventa el monto)', async () => {
      mockPlanesMembresia[0].precioBaseUsd = '0.00';

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow(/no tiene un precio base mayor a 0.00/i);
      expect(mockCuotasMembresia).toHaveLength(0);
    });

    it('§E1: con suscripción activa no se puede volver a elegir fechaInicio', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-08-15';
      mockPerfilesAlumno[0].proximoCorte = '2026-12-15';

      await expect(
        finanzasService.asignarSuscripcion(
          UUID_COACH,
          'alumno-uuid-1',
          { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
          AHORA_CARACAS
        )
      ).rejects.toThrow(
        'La fecha de inicio solo se elige al asignar el plan por primera vez. Quita el plan para empezar un ciclo nuevo.'
      );
    });

    it('§E1: con suscripción activa, sin fechaInicio solo cambia el plan (ancla y corte intactos)', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-08-15';
      mockPerfilesAlumno[0].proximoCorte = '2026-12-15';
      mockPlanesMembresia.push({
        id: 'plan-uuid-2',
        entrenadorId: UUID_COACH,
        nombre: 'Plan Trimestral',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '100.00',
        duracionMeses: 3,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: 'plan-uuid-2' },
        AHORA_CARACAS
      );

      expect(dto.planId).toBe('plan-uuid-2');
      expect(dto.planNombre).toBe('Plan Trimestral');
      expect(dto.fechaInicio).toBe('2026-08-15');
      expect(dto.proximoCorte).toBe('2026-12-15');
      expect(dto.cuotaEmitidaId).toBeNull();
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockPerfilesAlumno[0].cicloAncla).toBe('2026-08-15');
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-12-15');
    });

    it('§E1: el barrido no duplica la cuota de un periodo ya emitido y avanza proximoCorte', async () => {
      // Alumno ya suscrito al plan mensual: ancla 14/09, corte 14/10 (dentro de la ventana T-5).
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-09-14';
      mockPerfilesAlumno[0].proximoCorte = '2026-10-14';
      // La cuota del periodo 2026-10 ya fue emitida con su corte del 14/10 local (Caracas, UTC-4).
      sembrarCuota({
        clienteId: 'alumno-uuid-1',
        planId: UUID_PLAN,
        periodo: '2026-10',
        fechaCorteUtc: new Date('2026-10-15T03:59:59.999Z'),
      });

      const resultado = await finanzasService.emitirCuotasProgramadas(
        new Date('2026-10-09T15:00:00.000Z')
      );

      expect(resultado).toEqual({ evaluadas: 1, emitidas: 0, omitidas: 0 });
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0].periodo).toBe('2026-10');
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-11-14');
    });

    it('§E1: un fallo del scheduler no revierte la asignación ni la emisión', async () => {
      mockScheduler.programarRecordatoriosCuota.mockRejectedValueOnce(
        new Error('ECONNREFUSED 127.0.0.1:6379')
      );

      const dto = await finanzasService.asignarSuscripcion(
        UUID_COACH,
        'alumno-uuid-1',
        { planId: UUID_PLAN, fechaInicio: '2026-10-09' },
        AHORA_CARACAS
      );

      expect(dto.cuotaEmitidaId).not.toBeNull();
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockPerfilesAlumno[0].planSuscritoId).toBe(UUID_PLAN);
    });

    it('§E2: quitarSuscripcion limpia las 3 columnas y no toca las cuotas existentes', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-09';
      mockPerfilesAlumno[0].proximoCorte = '2026-11-09';
      const cuota = sembrarCuota({ estado: EstadoCuota.VENCIDA });

      const resultado = await finanzasService.quitarSuscripcion(UUID_COACH, 'alumno-uuid-1');

      expect(resultado).toEqual({ desactivada: true });
      expect(mockPerfilesAlumno[0].planSuscritoId).toBeNull();
      expect(mockPerfilesAlumno[0].cicloAncla).toBeNull();
      expect(mockPerfilesAlumno[0].proximoCorte).toBeNull();
      // Las cuotas existentes NO cambian.
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0]).toBe(cuota);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.VENCIDA);
    });

    it('§E2: quitarSuscripcion sin suscripción → 404 honesto', async () => {
      await expect(finanzasService.quitarSuscripcion(UUID_COACH, 'alumno-uuid-1')).rejects.toThrow(
        'Este alumno no tiene un plan asignado.'
      );
    });

    it('§E3: obtenerSuscripcion devuelve null sin suscripción y cuotaEmitidaId siempre null', async () => {
      expect(await finanzasService.obtenerSuscripcion(UUID_COACH, 'alumno-uuid-1')).toBeNull();

      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-09';
      mockPerfilesAlumno[0].proximoCorte = '2026-11-09';
      sembrarCuota();

      const dto = await finanzasService.obtenerSuscripcion(UUID_COACH, 'alumno-uuid-1');
      expect(dto).not.toBeNull();
      expect(dto!.clienteId).toBe('alumno-uuid-1');
      expect(dto!.planId).toBe(UUID_PLAN);
      expect(dto!.planNombre).toBe('Plan Mensual Estándar');
      expect(dto!.duracionMeses).toBe(1);
      expect(dto!.fechaInicio).toBe('2026-10-09');
      expect(dto!.proximoCorte).toBe('2026-11-09');
      expect(dto!.cuotaEmitidaId).toBeNull();
    });

    it('§E4: emite una cuota por alumno activo que cumple debeEmitirCuota y omite inactivos/sin plan/eliminados', async () => {
      sembrarAlumno({
        usuarioId: 'alumno-2-uuid',
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarAlumno({
        usuarioId: 'alumno-3-uuid',
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarAlumno({
        usuarioId: 'alumno-4-uuid',
        estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO,
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarAlumno({
        usuarioId: 'alumno-5-uuid',
        deletedAtUtc: new Date(),
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarAlumno({ usuarioId: 'alumno-6-uuid' });

      // El alumno 1 (fixture base) también tiene suscripción activa y corte en ventana.
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-10';
      mockPerfilesAlumno[0].proximoCorte = '2026-10-10';

      const resultado = await finanzasService.emitirCuotasProgramadas(AHORA_CARACAS);

      expect(resultado).toEqual({ evaluadas: 2, emitidas: 2, omitidas: 0 });
      expect(mockCuotasMembresia).toHaveLength(2);
      for (const cuota of mockCuotasMembresia) {
        expect(cuota.periodo).toBe('2026-10');
        expect(cuota.montoTotalUsd).toBe('40.00');
      }
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-11-10');
    });

    it('§E4: el error de un alumno cuenta en omitidas y NO detiene a los demás', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-10';
      mockPerfilesAlumno[0].proximoCorte = '2026-10-10';
      sembrarAlumno({
        usuarioId: 'alumno-2-uuid',
        planSuscritoId: '00000000-0000-4000-8000-00000000dead',
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });
      sembrarAlumno({
        usuarioId: 'alumno-3-uuid',
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-10',
        proximoCorte: '2026-10-10',
      });

      const resultado = await finanzasService.emitirCuotasProgramadas(AHORA_CARACAS);

      expect(resultado).toEqual({ evaluadas: 3, emitidas: 2, omitidas: 1 });
      expect(mockCuotasMembresia).toHaveLength(2);
    });

    it('§E4: llamarlo dos veces el mismo día no duplica cuotas', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-10';
      mockPerfilesAlumno[0].proximoCorte = '2026-10-10';

      const primera = await finanzasService.emitirCuotasProgramadas(AHORA_CARACAS);
      const segunda = await finanzasService.emitirCuotasProgramadas(AHORA_CARACAS);

      expect(primera.emitidas).toBe(1);
      expect(segunda.emitidas).toBe(0);
      expect(mockCuotasMembresia).toHaveLength(1);
    });

    it('§E4: un alumno que vuelve 3 ciclos atrasado emite SOLO el corte vigente', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-01-10';
      mockPerfilesAlumno[0].proximoCorte = '2026-02-10';
      const ahoraCorte = new Date('2026-05-07T12:00:00.000Z'); // 2026-05-07 08:00 Caracas

      const resultado = await finanzasService.emitirCuotasProgramadas(ahoraCorte);

      expect(resultado.emitidas).toBe(1);
      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0].periodo).toBe('2026-05');
      expect(new Date(mockCuotasMembresia[0].fechaCorteUtc).toISOString()).toBe(
        '2026-05-11T03:59:59.999Z'
      );
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2026-06-10');
    });

    it('§E4: el barrido es ruta de sistema y lee con bypass explícito isSuperadmin', async () => {
      const withTenantEspia = vi.fn(async (_contexto: any, fn: any) => fn(mockDb));
      const servicioSistema = new FinanzasService(
        mockDb,
        undefined,
        undefined,
        mockScheduler,
        withTenantEspia as any
      );
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-10';
      mockPerfilesAlumno[0].proximoCorte = '2026-10-10';

      await servicioSistema.emitirCuotasProgramadas(AHORA_CARACAS);

      expect(withTenantEspia).toHaveBeenCalledWith({ isSuperadmin: true }, expect.any(Function));
    });
  });

  // ===========================================================================
  // §F. FinanzasController — rutas de suscripciones
  // ===========================================================================
  describe('§F: FinanzasController — rutas de suscripciones (rol ENTRENADOR)', () => {
    const DTO_SUSCRIPCION = {
      clienteId: UUID_ALUMNO,
      planId: UUID_PLAN,
      planNombre: 'Plan Mensual Estándar',
      duracionMeses: 1,
      fechaInicio: '2026-10-09',
      proximoCorte: '2026-11-09',
      cuotaEmitidaId: null,
    };

    function crearControladorConEspias() {
      const servicio = {
        obtenerSuscripcion: vi.fn().mockResolvedValue(DTO_SUSCRIPCION),
        asignarSuscripcion: vi.fn().mockResolvedValue(DTO_SUSCRIPCION),
        quitarSuscripcion: vi.fn().mockResolvedValue({ desactivada: true }),
      };
      return { servicio, controlador: new FinanzasController(servicio as any) };
    }

    const reqConEntrenadorId = {
      user: { sub: UUID_COACH, entrenadorId: UUID_COACH, rol: Rol.ENTRENADOR },
    };

    it('§F: GET /finanzas/suscripciones/:clienteId delega con el entrenador del token', async () => {
      const { servicio, controlador } = crearControladorConEspias();

      const resultado = await (controlador as any).obtenerSuscripcion(reqConEntrenadorId, UUID_ALUMNO);

      expect(servicio.obtenerSuscripcion).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO);
      expect(resultado).toEqual(DTO_SUSCRIPCION);
    });

    it('§F: PUT /finanzas/suscripciones/:clienteId valida con AsignarSuscripcionSchema y delega', async () => {
      const { servicio, controlador } = crearControladorConEspias();

      await (controlador as any).asignarSuscripcion(reqConEntrenadorId, UUID_ALUMNO, {
        planId: UUID_PLAN,
        fechaInicio: '2026-10-09',
      });

      expect(servicio.asignarSuscripcion).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO, {
        planId: UUID_PLAN,
        fechaInicio: '2026-10-09',
      });
    });

    it('§F: DELETE /finanzas/suscripciones/:clienteId delega en quitarSuscripcion', async () => {
      const { servicio, controlador } = crearControladorConEspias();

      const resultado = await (controlador as any).quitarSuscripcion(reqConEntrenadorId, UUID_ALUMNO);

      expect(servicio.quitarSuscripcion).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO);
      expect(resultado).toEqual({ desactivada: true });
    });

    it('§F: usa req.user.sub cuando el token no trae entrenadorId', async () => {
      const { servicio, controlador } = crearControladorConEspias();
      const reqSinEntrenadorId = { user: { sub: UUID_COACH, rol: Rol.ENTRENADOR } };

      await (controlador as any).obtenerSuscripcion(reqSinEntrenadorId, UUID_ALUMNO);

      expect(servicio.obtenerSuscripcion).toHaveBeenCalledWith(UUID_COACH, UUID_ALUMNO);
    });

    it('§F: clienteId no UUID → 400 sin tocar el servicio', async () => {
      const { servicio, controlador } = crearControladorConEspias();

      await expect(
        (controlador as any).obtenerSuscripcion(reqConEntrenadorId, 'no-es-uuid')
      ).rejects.toThrow('No encontramos a este alumno.');
      await expect(
        (controlador as any).asignarSuscripcion(reqConEntrenadorId, 'no-es-uuid', {
          planId: UUID_PLAN,
        })
      ).rejects.toThrow('No encontramos a este alumno.');
      await expect(
        (controlador as any).quitarSuscripcion(reqConEntrenadorId, 'no-es-uuid')
      ).rejects.toThrow('No encontramos a este alumno.');

      expect(servicio.obtenerSuscripcion).not.toHaveBeenCalled();
      expect(servicio.asignarSuscripcion).not.toHaveBeenCalled();
      expect(servicio.quitarSuscripcion).not.toHaveBeenCalled();
    });

    it('§F: las tres rutas declaran ruta, método HTTP y rol ENTRENADOR', () => {
      const prototipo: any = FinanzasController.prototype;
      const casos = [
        {
          nombre: 'obtenerSuscripcion',
          ruta: 'suscripciones/:clienteId',
          metodo: RequestMethod.GET,
        },
        {
          nombre: 'asignarSuscripcion',
          ruta: 'suscripciones/:clienteId',
          metodo: RequestMethod.PUT,
        },
        {
          nombre: 'quitarSuscripcion',
          ruta: 'suscripciones/:clienteId',
          metodo: RequestMethod.DELETE,
        },
      ];

      for (const caso of casos) {
        const handler = prototipo[caso.nombre];
        expect(typeof handler, `El handler ${caso.nombre} debe existir`).toBe('function');
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(caso.ruta);
        expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(caso.metodo);
        expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Rol.ENTRENADOR]);
      }
    });
  });

  // ===========================================================================
  // §G4. AlumnosService — hidratación del plan activo desde la suscripción
  // ===========================================================================
  describe('§G4: hidratarPlanActivo — planSuscritoId gana sobre override y última cuota', () => {
    let alumnosService: AlumnosService;

    beforeEach(() => {
      alumnosService = new AlumnosService(mockDb, {} as any);
      mockPlanesMembresia.push({
        id: 'plan-uuid-2',
        entrenadorId: UUID_COACH,
        nombre: 'Plan Bimestral',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '70.00',
        duracionMeses: 2,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
    });

    it('§G4: con planSuscritoId del coach, ese plan gana sobre un override de OTRO plan', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      // Override más reciente sobre otro plan del coach + última cuota de ese otro plan.
      mockOverridesClientePlan.push({
        id: 'override-otro-plan',
        planId: 'plan-uuid-2',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '30.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(Date.now() + 1000),
      });
      sembrarCuota({ planId: 'plan-uuid-2', createdAtUtc: new Date() });

      const mapa = await (alumnosService as any).hidratarPlanActivo(mockDb, UUID_COACH, [
        'alumno-uuid-1',
      ]);

      expect(mapa.get('alumno-uuid-1')).toEqual({
        planActivoId: UUID_PLAN,
        planActivoNombre: 'Plan Mensual Estándar',
        precioAcordadoOverride: null,
      });
    });

    it('§G4: el precio acordado sale del override de ESE plan suscrito cuando existe', async () => {
      mockPerfilesAlumno[0].planSuscritoId = UUID_PLAN;
      mockOverridesClientePlan.push({
        id: 'override-mismo-plan',
        planId: UUID_PLAN,
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '35.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const mapa = await (alumnosService as any).hidratarPlanActivo(mockDb, UUID_COACH, [
        'alumno-uuid-1',
      ]);

      expect(mapa.get('alumno-uuid-1')).toEqual({
        planActivoId: UUID_PLAN,
        planActivoNombre: 'Plan Mensual Estándar',
        precioAcordadoOverride: '35.00',
      });
    });

    it('§G4: sin planSuscritoId se mantiene la precedencia previa (override > última cuota)', async () => {
      mockOverridesClientePlan.push({
        id: 'override-previo',
        planId: 'plan-uuid-2',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '30.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const mapa = await (alumnosService as any).hidratarPlanActivo(mockDb, UUID_COACH, [
        'alumno-uuid-1',
      ]);

      expect(mapa.get('alumno-uuid-1')).toEqual({
        planActivoId: 'plan-uuid-2',
        planActivoNombre: 'Plan Bimestral',
        precioAcordadoOverride: '30.00',
      });
    });
  });
});
