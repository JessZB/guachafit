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
  CrearOverridePlanSchema,
} from '@guachafit/shared';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  CobroDirectoRegistradoEvent,
  PagoAprobadoEvent,
  PagoRechazadoEvent,
  PagoReportadoEvent,
} from '../../src/modules/notificaciones/events/eventos-notificacion';

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
          // Operador: texto SQL entre la columna y el primer parámetro (incluye `in`/`is null`).
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

          // WU-J: `inArray`/`notInArray` (drizzle) parametrizan la lista como array de Params.
          const esNotIn = /\snot\s+in\s/.test(texto);
          const esIn = !esNotIn && /\sin\s/.test(texto);
          const comparador = texto.match(/>=|<=|>|</)?.[0];
          let op: OpCondicion = 'eq';
          if (texto.includes('is not null')) op = 'isNotNull';
          else if (texto.includes('is null')) op = 'isNull';
          else if (esNotIn) op = 'notIn';
          else if (esIn) op = 'in';
          // M5-L1: `<>`/`!=` se evalúan ANTES que los comparadores simples (el '<' de '<>'
          // no debe interpretarse como 'lt': bug latente que vaciaba el filtro `ne`).
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

  /** WU24b: extrae columna y dirección de una expresión `asc(col)`/`desc(col)` de Drizzle. */
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

  /** WU-J: acceso a la MISMA referencia del store (los `delete` deben mutar el arreglo real). */
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

          let limiteAplicado: number | null = null;
          let desplazamientoAplicado = 0;

          const queryObj: any = {
            leftJoin: vi.fn(() => queryObj),
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
              // WU24b: selecciones agregadas (COUNT/SUM) se resuelven sobre el filtro completo,
              // ignorando LIMIT/OFFSET, como en SQL.
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
                    // postgres devuelve numeric como string; el servicio lo parsea con toCents.
                    resultado[campo] = suma.toFixed(2);
                  }
                }
                return resolve([resultado]);
              }

              // OFFSET/LIMIT se aplican al resolver (offset primero), como en SQL.
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
              return resolve([...pagina]);
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
      // WU-J (RF-005): soporte de DELETE para `eliminarOverride` (borra sobre el store real).
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
  // ===========================================================================
  // M5 P1 (A4): el describe histórico "5. Emisión de Cuotas Periódicas" se retiró con la
  // ruta `POST /finanzas/cuotas/emitir` (única forma de emitir: la suscripción, RF-005/RF-008).
  // La regla "la cuota nace con saldo igual al total y estado EMITIDA" quedó cubierta por la
  // emisión por suscripción en `rf005-rf008-suscripcion-servicio.spec.ts` (§E1).
  // ===========================================================================

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

    it('dos reportes simultáneos con la misma idempotencyKey registran UN solo pago', async () => {
      // Sin referencia bancaria no hay índice único que frene el duplicado: solo la idempotencia.
      const payload = {
        montoOriginal: '10.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-09-06',
      };
      // El mock no persiste inserciones: se cuentan las llamadas a insert sobre la tabla.
      const insercionesPago = () =>
        mockDb.insert.mock.calls.filter(([tabla]: any[]) => getTableName(tabla) === 'transacciones_pago')
          .length;

      const [a, b] = await Promise.all([
        finanzasService.reportarPago('cuota-test-1', 'alumno-uuid-1', payload, 'clave-simultanea'),
        finanzasService.reportarPago('cuota-test-1', 'alumno-uuid-1', payload, 'clave-simultanea'),
      ]);

      expect(insercionesPago()).toBe(1);
      expect(b.transaccion.id).toBe(a.transaccion.id);
      expect([a.esDuplicadoIdempotente, b.esDuplicadoIdempotente].sort()).toEqual([false, true]);
    });

    it('un reporte que falla no se recuerda: el reintento con la misma clave vuelve a intentarlo', async () => {
      const payload = {
        montoOriginal: '10.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-09-06',
      };

      await expect(
        finanzasService.reportarPago('cuota-inexistente', 'alumno-uuid-1', payload, 'clave-fallo')
      ).rejects.toThrow(NotFoundException);

      const reintento = await finanzasService.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        payload,
        'clave-fallo'
      );
      expect(reintento.esDuplicadoIdempotente).toBe(false);
    });

    it('no expone la respuesta cacheada a otro solicitante que reutilice la misma idempotencyKey', async () => {
      const payload = {
        montoOriginal: '1500.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-idem-tenant',
        fechaOperacion: '2026-09-06',
      };

      await finanzasService.reportarPago(
        'cuota-test-1',
        'alumno-uuid-1',
        payload,
        'unique-key-tenant'
      );

      // La key es la misma, pero el solicitante no es el titular: la caché por solicitante
      // debe fallar y ganar el control de titularidad (403), nunca devolver la transacción ajena.
      await expect(
        finanzasService.reportarPago(
          'cuota-test-1',
          'otro-alumno-hacker',
          payload,
          'unique-key-tenant'
        )
      ).rejects.toThrow(ForbiddenException);
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

    it('debe publicar el evento de dominio PAGO_REPORTADO al entrenador si el bus está configurado', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const serviceConNotif = new FinanzasService(mockDb, { emitAsync } as any);

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

      expect(emitAsync).toHaveBeenCalledWith(
        PagoReportadoEvent.NOMBRE,
        expect.objectContaining({
          payload: expect.objectContaining({
            tipoEvento: 'PAGO_REPORTADO',
            destinatarioUserId: 'coach-uuid-1',
            categoria: 'FINANZAS',
            esCriticoSeguridad: false,
            referenciaId: expect.any(String),
          }),
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

    it('cobro directo emite el evento con destinatario y montos correctos', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const serviceConNotif = new FinanzasService(mockDb, { emitAsync } as any);

      const res = await serviceConNotif.cobroDirecto('cuota-cobro-directo', 'coach-uuid-1', {
        montoOriginal: '30.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-09-06',
      });

      expect(emitAsync).toHaveBeenCalledWith(
        CobroDirectoRegistradoEvent.NOMBRE,
        expect.objectContaining({
          payload: expect.objectContaining({
            tipoEvento: 'COBRO_DIRECTO_REGISTRADO',
            destinatarioUserId: 'alumno-uuid-1',
            entrenadorId: 'coach-uuid-1',
            categoria: 'FINANZAS',
            linkAccion: '/app/pagos',
            esCriticoSeguridad: false,
            referenciaId: res.transaccion.id,
            cuerpo: expect.stringContaining('30.00'),
          }),
        })
      );
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

    it('debe publicar el evento PAGO_APROBADO con esCriticoSeguridad=true al conciliar exitosamente', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const serviceConNotif = new FinanzasService(mockDb, { emitAsync } as any);

      await serviceConNotif.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'aprobar' }
      );

      expect(emitAsync).toHaveBeenCalledWith(
        PagoAprobadoEvent.NOMBRE,
        expect.objectContaining({
          payload: expect.objectContaining({
            tipoEvento: 'PAGO_APROBADO',
            destinatarioUserId: 'alumno-uuid-1',
            categoria: 'FINANZAS',
            esCriticoSeguridad: true,
            referenciaId: expect.any(String),
          }),
        })
      );
    });

    it('debe publicar el evento PAGO_RECHAZADO al rechazar un pago', async () => {
      const emitAsync = vi.fn().mockResolvedValue([]);
      const serviceConNotif = new FinanzasService(mockDb, { emitAsync } as any);

      await serviceConNotif.conciliarTransaccion(
        'tx-conciliar-1',
        'coach-uuid-1',
        { accion: 'rechazar', motivoRechazo: 'Comprobante ilegible' }
      );

      expect(emitAsync).toHaveBeenCalledWith(
        PagoRechazadoEvent.NOMBRE,
        expect.objectContaining({
          payload: expect.objectContaining({
            tipoEvento: 'PAGO_RECHAZADO',
            destinatarioUserId: 'alumno-uuid-1',
            categoria: 'FINANZAS',
            esCriticoSeguridad: false,
          }),
        })
      );
    });
  });

  // ===========================================================================
  // H.2 WU-H: RECORDATORIOS DE COBRANZA (RF-008 / ADR-008)
  // ===========================================================================
  describe('8b. WU-H: programación y cancelación de recordatorios de cobranza', () => {
    let mockScheduler: any;
    let servicioConScheduler: FinanzasService;

    function crearTxPendiente(id: string, cuotaId: string, montoUsd: string) {
      return {
        id,
        cuotaId,
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: montoUsd,
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: montoUsd,
        metodoPago: MetodoPago.ZELLE,
        referenciaBancaria: `ref-${id}`,
        fechaOperacion: '2026-09-06',
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        fechaReporteUtc: new Date(),
        fechaConciliacionUtc: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      };
    }

    beforeEach(() => {
      mockScheduler = {
        programarRecordatoriosCuota: vi.fn().mockResolvedValue(['T_MINUS_5']),
        cancelarRecordatoriosCuota: vi.fn().mockResolvedValue(4),
      };
      servicioConScheduler = new FinanzasService(mockDb, undefined, undefined, mockScheduler);
    });

    // M5 P1 (A4): los tests "programa los recordatorios ... al emitir una cuota" y
    // "la emisión NO se cae si Redis falla al agendar" vivían en `emitirCuota` (ruta retirada).
    // Sus reglas quedan cubiertas por la emisión por suscripción en
    // `rf005-rf008-suscripcion-servicio.spec.ts`: recordatorios agendados con zona (§E1,
    // expect de `programarRecordatoriosCuota`) y "un fallo del scheduler no revierte la
    // asignación ni la emisión" (§E1).

    it('cancela los recordatorios al aprobar el pago que deja la cuota en $0.00', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-liquidada-wuh',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-09',
          montoTotalUsd: '30.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '30.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
          estado: EstadoCuota.PENDIENTE_REVISION,
        },
      ];
      mockTransaccionesPago = [crearTxPendiente('tx-liquidada-wuh', 'cuota-liquidada-wuh', '30.00')];

      const res = await servicioConScheduler.conciliarTransaccion(
        'tx-liquidada-wuh',
        'coach-uuid-1',
        { accion: 'aprobar' }
      );

      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(mockScheduler.cancelarRecordatoriosCuota).toHaveBeenCalledWith('cuota-liquidada-wuh');
    });

    it('NO cancela recordatorios cuando la aprobación deja saldo pendiente (abono parcial)', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-parcial-wuh',
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
      mockTransaccionesPago = [crearTxPendiente('tx-parcial-wuh', 'cuota-parcial-wuh', '20.00')];

      const res = await servicioConScheduler.conciliarTransaccion(
        'tx-parcial-wuh',
        'coach-uuid-1',
        { accion: 'aprobar' }
      );

      expect(res.cuota.saldoPendienteUsd).toBe('40.00');
      expect(mockScheduler.cancelarRecordatoriosCuota).not.toHaveBeenCalled();
    });

    it('cancela los recordatorios cuando el cobro directo liquida la cuota', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-cobro-directo-wuh',
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

      const res = await servicioConScheduler.cobroDirecto(
        'cuota-cobro-directo-wuh',
        'coach-uuid-1',
        {
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-09-06',
        }
      );

      expect(res.cuota.saldoPendienteUsd).toBe('0.00');
      expect(mockScheduler.cancelarRecordatoriosCuota).toHaveBeenCalledWith(
        'cuota-cobro-directo-wuh'
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
      expect(bandeja.items).toHaveLength(1);
      expect(bandeja.total).toBe(1);
      expect(bandeja.limit).toBe(25);
      expect(bandeja.offset).toBe(0);
      expect(bandeja.items[0].estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);
      expect(bandeja.items[0].referenciaBancaria).toBe('ref-1');
      expect(bandeja.items[0].clienteNombre).toBe('Pedro Pérez');
    });
  });

  // ===========================================================================
  // I.2 WU24b: PAGINACIÓN SERVER-SIDE (BANDEJA FIFO + HISTORIAL DEL ALUMNO)
  // ===========================================================================
  describe('9b. WU24b: Paginación server-side de finanzas', () => {
    function crearTx(
      id: string,
      fechaReporteUtc: Date,
      montoUsd: string,
      estado: EstadoConciliacion = EstadoConciliacion.PENDIENTE
    ) {
      return {
        id,
        cuotaId: 'cuota-1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: montoUsd,
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: montoUsd,
        metodoPago: MetodoPago.EFECTIVO_USD,
        referenciaBancaria: `ref-${id}`,
        fechaOperacion: '2026-09-01',
        estadoConciliacion: estado,
        fechaReporteUtc,
        createdAtUtc: fechaReporteUtc,
        updatedAtUtc: fechaReporteUtc,
      };
    }

    it('bandeja: envelope con total real (solo PENDIENTES) y orden FIFO estable', async () => {
      mockTransaccionesPago = [
        crearTx('tx-b', new Date('2026-09-02T10:00:00Z'), '20.00'),
        crearTx('tx-a', new Date('2026-09-01T10:00:00Z'), '10.00'),
        crearTx('tx-c', new Date('2026-09-03T10:00:00Z'), '30.00'),
        crearTx('tx-aprobada', new Date('2026-08-01T10:00:00Z'), '99.00', EstadoConciliacion.APROBADO),
      ];

      const bandeja = await finanzasService.listarBandejaConciliacion('coach-uuid-1', 2, 0);

      expect(bandeja.total).toBe(3);
      expect(bandeja.limit).toBe(2);
      expect(bandeja.offset).toBe(0);
      expect(bandeja.items.map((t) => t.id)).toEqual(['tx-a', 'tx-b']);
    });

    it('bandeja: paginar con offset no repite ni salta filas y conserva la cola FIFO', async () => {
      mockTransaccionesPago = [
        crearTx('tx-5', new Date('2026-09-05T10:00:00Z'), '50.00'),
        crearTx('tx-1', new Date('2026-09-01T10:00:00Z'), '10.00'),
        crearTx('tx-3', new Date('2026-09-03T10:00:00Z'), '30.00'),
        crearTx('tx-2', new Date('2026-09-02T10:00:00Z'), '20.00'),
        crearTx('tx-4', new Date('2026-09-04T10:00:00Z'), '40.00'),
      ];

      const pagina1 = await finanzasService.listarBandejaConciliacion('coach-uuid-1', 2, 0);
      const pagina2 = await finanzasService.listarBandejaConciliacion('coach-uuid-1', 2, 2);
      const pagina3 = await finanzasService.listarBandejaConciliacion('coach-uuid-1', 2, 4);

      const ids = [...pagina1.items, ...pagina2.items, ...pagina3.items].map((t) => t.id);
      expect(ids).toEqual(['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5']);
      expect(new Set(ids).size).toBe(5);
      expect(pagina3.items).toHaveLength(1);
      expect(pagina1.total).toBe(5);
      expect(pagina2.total).toBe(5);
      expect(pagina3.total).toBe(5);
    });

    it('historial: sin txLimit/txOffset devuelve TODAS las transacciones y transaccionesTotal', async () => {
      const ahora = new Date();
      const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 15);
      mockTransaccionesPago = [
        crearTx('tx-mes', ahora, '10.00', EstadoConciliacion.APROBADO),
        crearTx('tx-mes-anterior', mesAnterior, '20.00', EstadoConciliacion.APROBADO),
        crearTx('tx-vieja', new Date(2026, 0, 15), '30.00', EstadoConciliacion.APROBADO),
        crearTx('tx-pendiente', new Date(2026, 0, 16), '99.00'),
      ];

      const resumen = await finanzasService.obtenerHistorialCliente(
        'coach-uuid-1',
        'perfil-alumno-1',
        'coach-uuid-1',
        Rol.ENTRENADOR
      );

      expect(resumen.transaccionesTotal).toBe(4);
      expect(resumen.transacciones).toHaveLength(4);
      expect(resumen.totalPagadoHistoricoUsd).toBe('60.00');
      expect(resumen.totalPagadoMesActualUsd).toBe('10.00');
    });

    it('historial: txLimit/txOffset devuelven el slice y el resumen sigue siendo del total', async () => {
      const base = new Date('2026-06-10T10:00:00Z').getTime();
      mockTransaccionesPago = [
        crearTx('tx-1', new Date(base + 5 * 86400000), '10.00', EstadoConciliacion.APROBADO),
        crearTx('tx-2', new Date(base + 4 * 86400000), '20.00', EstadoConciliacion.APROBADO),
        crearTx('tx-3', new Date(base + 3 * 86400000), '30.00', EstadoConciliacion.APROBADO),
        crearTx('tx-4', new Date(base + 2 * 86400000), '40.00', EstadoConciliacion.APROBADO),
        crearTx('tx-5', new Date(base + 1 * 86400000), '50.00', EstadoConciliacion.APROBADO),
      ];

      const resumen = await finanzasService.obtenerHistorialCliente(
        'coach-uuid-1',
        'perfil-alumno-1',
        'coach-uuid-1',
        Rol.ENTRENADOR,
        2,
        1
      );

      expect(resumen.transaccionesTotal).toBe(5);
      expect(resumen.transacciones.map((t) => t.id)).toEqual(['tx-2', 'tx-3']);
      // El resumen no se recorta con la página: suma las 5 aprobadas.
      expect(resumen.totalPagadoHistoricoUsd).toBe('150.00');
    });

    it('historial: mantiene el aislamiento de tenant para entrenador y alumno', async () => {
      mockTransaccionesPago = [];

      // M5 P1 (C4, ajuste autorizado): el coach con un alumno ajeno responde el 404 UNIFICADO
      // de cartera (antes 403 MENSAJE_SIN_ACCESO_ALUMNO — RNF-003 §3.1).
      await expect(
        finanzasService.obtenerHistorialCliente(
          'coach-ajeno',
          'perfil-alumno-1',
          'coach-ajeno',
          Rol.ENTRENADOR
        )
      ).rejects.toThrow(NotFoundException);

      await expect(
        finanzasService.obtenerHistorialCliente(
          'coach-uuid-1',
          'perfil-alumno-1',
          'alumno-ajeno',
          Rol.ALUMNO
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('controller: la bandeja aplica el techo de limit (100) y normaliza offset inválido a 0', async () => {
      mockTransaccionesPago = [];
      const req = {
        user: { sub: 'coach-uuid-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-uuid-1' },
      };

      const bandeja = await finanzasController.listarBandejaConciliacion(req, '500', '-7');

      expect(bandeja.total).toBe(0);
      expect(bandeja.limit).toBe(100);
      expect(bandeja.offset).toBe(0);
    });

    it('controller: el historial aplica el techo de txLimit y conserva "todas" con valor no numérico', async () => {
      const perfilUuid = 'a1111111-1111-4111-8111-111111111111';
      mockPerfilesAlumno[0].id = perfilUuid;
      const ahora = new Date();
      mockTransaccionesPago = [
        crearTx('tx-1', ahora, '10.00', EstadoConciliacion.APROBADO),
        crearTx('tx-2', ahora, '20.00', EstadoConciliacion.APROBADO),
      ];
      const req = {
        user: { sub: 'coach-uuid-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-uuid-1' },
      };

      const conTecho = await finanzasController.obtenerHistorialCliente(
        req,
        perfilUuid,
        '500',
        undefined
      );
      expect(conTecho.transaccionesTotal).toBe(2);
      expect(conTecho.transacciones).toHaveLength(2);

      const noNumerico = await finanzasController.obtenerHistorialCliente(
        req,
        perfilUuid,
        'no-es-numero',
        undefined
      );
      expect(noNumerico.transaccionesTotal).toBe(2);
      expect(noNumerico.transacciones).toHaveLength(2);
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

  // ===========================================================================
  // J. HONESTIDAD DE TASA (RF-006): SIN TASA CONFIGURADA NO HAY VALOR INVENTADO
  // ===========================================================================
  describe('10. Sin tasa configurada: null y errores de negocio (nunca 65.0000)', () => {
    beforeEach(() => {
      // Ausencia REAL de configuración: sin histórico de tasas y sin tasa global en el perfil.
      mockTasasCambioReferencia = [];
      mockPerfilesEntrenador[0].tasaCambioGlobal = null;
    });

    function crearCuotaAbierta(id: string) {
      mockCuotasMembresia = [
        {
          id,
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
    }

    it('resolverTasa devuelve null con fuente "sin_configurar" y conserva el override si existe', () => {
      const sinTasa = finanzasService.resolverTasa(null, null);
      expect(sinTasa.tasaEfectiva).toBeNull();
      expect(sinTasa.esTasaOverride).toBe(false);
      expect(sinTasa.fuenteTasa).toBe('sin_configurar');

      const conOverride = finanzasService.resolverTasa(null, '58.0000');
      expect(conOverride.tasaEfectiva).toBe('58.0000');
      expect(conOverride.fuenteTasa).toBe('override_cliente');
    });

    it('obtenerTasaVigente no fabrica 65.0000: nulls, fuente "sin_configurar" y fecha null', async () => {
      const tasa = await finanzasService.obtenerTasaVigente('coach-uuid-1');
      expect(tasa.tasaEfectiva).toBeNull();
      expect(tasa.tasaOficialBcv).toBeNull();
      expect(tasa.tasaActivaEntrenador).toBeNull();
      expect(tasa.fuente).toBe('sin_configurar');
      expect(tasa.fechaActualizacionUtc).toBeNull();
    });

    it('calcularConversion USD→VES sin tasa falla con error de negocio claro', async () => {
      await expect(
        finanzasService.calcularConversion(
          { monto: '50.00', monedaOrigen: Moneda.USD, monedaDestino: Moneda.VES },
          'coach-uuid-1'
        )
      ).rejects.toThrow(/aún no ha configurado la tasa de cambio/i);
    });

    it('calcularConversion USD→USD (identidad) no requiere tasa vigente', async () => {
      const res = await finanzasService.calcularConversion(
        { monto: '50.00', monedaOrigen: Moneda.USD, monedaDestino: Moneda.USD },
        'coach-uuid-1'
      );
      expect(res.montoConvertido).toBe('50.00');
      expect(res.tasaAplicada).toBe('1.0000');
      expect(res.fuenteTasa).toBe('sin_configurar');
    });

    // M5 P1 (A4): "emitirCuota sin tasa omite saldoPendienteVes" se retiró con la ruta.
    // La regla (no inventar proyección sin tasa) sigue cubierta aquí abajo por los caminos
    // vivos: reportarPago en VES sin tasa (rechazo) y el cobro en sala; la emisión por
    // suscripción ya no expone proyección en su DTO.

    it('reportarPago en VES sin tasa se rechaza; en USD se registra con tasa 1.0000', async () => {
      crearCuotaAbierta('cuota-sin-tasa');

      await expect(
        finanzasService.reportarPago('cuota-sin-tasa', 'alumno-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-sin-tasa',
          fechaOperacion: '2026-09-06',
        })
      ).rejects.toThrow(/aún no ha configurado la tasa de cambio/i);

      const res = await finanzasService.reportarPago('cuota-sin-tasa', 'alumno-uuid-1', {
        montoOriginal: '30.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-09-06',
      });
      expect(res.transaccion.tasaCambioFijada).toBe('1.0000');
      expect(res.transaccion.montoEquivalenteUsd).toBe('30.00');
      expect(res.cuota.saldoPendienteVes).toBeUndefined();
    });

    it('cobroDirecto en VES sin tasa se rechaza sin liquidar la cuota', async () => {
      crearCuotaAbierta('cuota-cobro-sin-tasa');

      await expect(
        finanzasService.cobroDirecto('cuota-cobro-sin-tasa', 'coach-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.EFECTIVO_VES,
          fechaOperacion: '2026-09-06',
        })
      ).rejects.toThrow(/no has configurado la tasa de cambio/i);

      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('50.00');
      expect(mockTransaccionesPago).toHaveLength(0);
    });

    it('cobroDirectoInteligente en VES sin tasa falla ANTES de emitir una cuota colateral', async () => {
      mockCuotasMembresia = [];

      await expect(
        finanzasService.cobroDirectoInteligente('coach-uuid-1', 'alumno-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.EFECTIVO_VES,
          fechaOperacion: '2026-09-06',
        })
      ).rejects.toThrow(/no has configurado la tasa de cambio/i);

      expect(mockCuotasMembresia).toHaveLength(0);
    });
  });

  // ===========================================================================
  // G. WU-J (RF-005): OVERRIDE COMPLETO Y PRECEDENCIA AL EMITIR CUOTA
  // ===========================================================================
  describe('7. WU-J (RF-005): contrato de override, precedencia RN-03 y becado $0', () => {
    const UUID_COACH = '11111111-1111-4111-8111-111111111111';
    const UUID_ALUMNO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const UUID_PLAN = '99999999-9999-4999-8999-999999999999';
    const UUID_PLAN_AJENO = '88888888-8888-4888-8888-888888888888';
    const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

    function sembrarOverride(precioAcordadoUsd: string | null, tasaFijadaOverride: string | null = null) {
      mockOverridesClientePlan.push({
        id: 'override-1',
        planId: 'plan-uuid-1',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd,
        tasaFijadaOverride,
        beneficiosPersonalizados: null,
        motivoOverride: 'Descuento fidelidad 1 año',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
    }

    // ===========================================================================
    // M5 P1 (A4): los tests de precedencia RN-03 / becado que vivían en `emitirCuota`
    // (ruta retirada) se migraron a la emisión por SUSCRIPCIÓN, donde viven ya cubiertos en
    // `rf005-rf008-suscripcion-servicio.spec.ts`:
    //   · RN-03 (override > catálogo) …………… §E1 RN-03 (override 35.00 → cuota 35.00)
    //     y §G4 (precio acordado sale del override del plan suscrito).
    //   · Sin override → precio base del plan … §E1 (cuota con montoTotalUsd del plan base).
    //   · Becado 0.00 → al_dia, sin recordatorios … §E1 becado.
    //   · "Plan precio 0 sin override NO emite" y "la cuota nace con saldo igual al total"
    //     se añadieron como tests nuevos de migración en ese mismo spec (§E1).
    // El DTO legado con `montoTotalUsd` y el esquema `EmitirCuotaSchema` desaparecen con la ruta.
    // ===========================================================================

    it('listarOverrides hidrata plan y alumno, y filtra por clienteId con 404 si no es de su cartera', async () => {
      sembrarOverride('45.00', '58.0000');

      const todos = await finanzasService.listarOverrides('coach-uuid-1');
      expect(todos).toHaveLength(1);
      expect(todos[0].planId).toBe('plan-uuid-1');
      expect(todos[0].planNombre).toBe('Plan Mensual Estándar');
      expect(todos[0].planPrecioBaseUsd).toBe('50.00');
      expect(todos[0].clienteNombre).toBe('Pedro Pérez');
      expect(todos[0].precioAcordadoUsd).toBe('45.00');
      expect(todos[0].tasaFijadaOverride).toBe('58.0000');
      expect(todos[0].motivoOverride).toBe('Descuento fidelidad 1 año');

      const delAlumno = await finanzasService.listarOverrides('coach-uuid-1', 'alumno-uuid-1');
      expect(delAlumno).toHaveLength(1);

      await expect(
        finanzasService.listarOverrides('coach-uuid-1', 'usuario-ajeno-a-la-cartera')
      ).rejects.toThrow(NotFoundException);
    });

    it('tenancy: un override cuyo plan no pertenece al coach no aparece en el listado', async () => {
      mockOverridesClientePlan.push({
        id: 'override-ajeno',
        planId: 'plan-de-otro-coach',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '10.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const overrides = await finanzasService.listarOverrides('coach-uuid-1');
      expect(overrides).toHaveLength(0);
    });

    it('eliminarOverride borra el override y limpia la tasa global del alumno cuando venía de él', async () => {
      sembrarOverride('45.00', '58.0000');
      mockPerfilesAlumno[0].tasaFijadaOverride = '58.0000';

      const res = await finanzasService.eliminarOverride('coach-uuid-1', 'override-1');

      expect(res.eliminado).toBe(true);
      expect(res.mensaje).toMatch(/vuelve a los valores del catálogo/i);
      expect(mockOverridesClientePlan).toHaveLength(0);
      expect(mockPerfilesAlumno[0].tasaFijadaOverride).toBeNull();
    });

    it('eliminarOverride conserva una tasa fijada manualmente distinta a la del override', async () => {
      sembrarOverride('45.00', '58.0000');
      mockPerfilesAlumno[0].tasaFijadaOverride = '62.0000';

      await finanzasService.eliminarOverride('coach-uuid-1', 'override-1');

      expect(mockOverridesClientePlan).toHaveLength(0);
      expect(mockPerfilesAlumno[0].tasaFijadaOverride).toBe('62.0000');
    });

    it('eliminarOverride rechaza overrides inexistentes (404) y de otro entrenador (403)', async () => {
      await expect(
        finanzasService.eliminarOverride('coach-uuid-1', 'override-inexistente')
      ).rejects.toThrow(NotFoundException);

      mockPlanesMembresia.push({
        id: 'plan-ajeno',
        entrenadorId: 'coach-uuid-2',
        nombre: 'Plan de otro coach',
        descripcion: null,
        beneficios: [],
        precioBaseUsd: '20.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
      mockOverridesClientePlan.push({
        id: 'override-ajeno',
        planId: 'plan-ajeno',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '10.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      await expect(
        finanzasService.eliminarOverride('coach-uuid-1', 'override-ajeno')
      ).rejects.toThrow(ForbiddenException);
      // El override ajeno sigue intacto.
      expect(mockOverridesClientePlan).toHaveLength(1);
    });

    it('CrearOverridePlanSchema acepta 0.00 (becado) y null explícito para limpiar valores', () => {
      const conCero = CrearOverridePlanSchema.parse({
        planId: UUID_PLAN,
        clienteId: UUID_ALUMNO,
        precioAcordadoUsd: '0.00',
      });
      expect(conCero.precioAcordadoUsd).toBe('0.00');

      const limpiar = CrearOverridePlanSchema.parse({
        planId: UUID_PLAN,
        clienteId: UUID_ALUMNO,
        precioAcordadoUsd: null,
        tasaFijadaOverride: null,
      });
      expect(limpiar.precioAcordadoUsd).toBeNull();
      expect(limpiar.tasaFijadaOverride).toBeNull();

      expect(() =>
        CrearOverridePlanSchema.parse({
          planId: UUID_PLAN,
          clienteId: UUID_ALUMNO,
          precioAcordadoUsd: '-1.00',
        })
      ).toThrow();
    });

    // M5 P1 (A4/A3): `EmitirCuotaSchema` ya no existe en @guachafit/shared (contrato retirado
    // con la ruta); la validación del contrato de suscripción viva está en
    // `rf005-rf008-suscripcion-servicio.spec.ts` §C (AsignarSuscripcionSchema).

    it('GET/DELETE de overrides validan UUID y delegan', async () => {
      // Fixtures con UUIDs reales (migrado del test del POST retirado de cuotas/emitir).
      mockUsuarios.push({ id: UUID_COACH, email: 'coach.uuid@guachafit.com', rol: Rol.ENTRENADOR });
      mockPerfilesAlumno.push({
        id: 'perfil-uuid-alumno',
        usuarioId: UUID_ALUMNO,
        entrenadorId: UUID_COACH,
        nombres: 'Ana',
        apellidos: 'Gómez',
        tasaFijadaOverride: null,
      });
      mockPlanesMembresia.push({
        id: UUID_PLAN,
        entrenadorId: UUID_COACH,
        nombre: 'Asesoría Online Full',
        descripcion: null,
        beneficios: ['Rutina interactiva'],
        precioBaseUsd: '40.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
      mockOverridesClientePlan.push({
        id: '11111111-2222-4333-8444-555555555555',
        planId: UUID_PLAN,
        clienteId: UUID_ALUMNO,
        precioAcordadoUsd: '35.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: 'Acuerdo especial',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const req = { user: { sub: UUID_COACH, entrenadorId: UUID_COACH, rol: Rol.ENTRENADOR } };

      await expect(
        finanzasController.listarOverrides(req, 'no-es-uuid')
      ).rejects.toThrow(BadRequestException);

      const listado = await finanzasController.listarOverrides(req, UUID_ALUMNO);
      expect(listado).toHaveLength(1);
      expect(listado[0].planNombre).toBe('Asesoría Online Full');
      expect(listado[0].clienteNombre).toBe('Ana Gómez');

      await expect(
        finanzasController.eliminarOverride(req, 'no-es-uuid')
      ).rejects.toThrow(BadRequestException);

      const eliminado = await finanzasController.eliminarOverride(
        req,
        '11111111-2222-4333-8444-555555555555'
      );
      expect(eliminado.eliminado).toBe(true);
    });
  });

  // ===========================================================================
  // M5-L1 §G: CORRECCIONES DE COMPORTAMIENTO (RF-005 / RF-007 / RNF-002)
  // ===========================================================================
  describe('11. M5-L1 §G: cobro directo, referencias duplicadas y cobro inteligente', () => {
    // El mock histórico NO persiste los INSERT (sus tests solo miran el retorno). §G1 y §G3
    // necesitan que la transacción/cuota emitida pueda RE-LEERSE en la misma llamada: se envuelve
    // `insert` para escribirlo también en el store real.
    beforeEach(() => {
      mockDb.insert.mockImplementation((tabla: any) => ({
        values: (vals: any) => {
          const registro = {
            id: vals.id || `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };
          getTablaCruda(getTableName(tabla)).push(registro);
          return {
            returning: vi.fn().mockResolvedValue([registro]),
            then: (resolve: any) => resolve([registro]),
          };
        },
      }));
    });

    function cuotaAbierta(overrides: Record<string, any> = {}) {
      mockCuotasMembresia = [
        {
          id: 'cuota-m5l1',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-10',
          montoTotalUsd: '40.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date('2026-11-01T03:59:59.999Z'),
          estado: EstadoCuota.EMITIDA,
          createdAtUtc: new Date('2026-10-01T00:00:00Z'),
          ...overrides,
        },
      ];
    }

    function txConReferencia(overrides: Record<string, any> = {}) {
      return {
        id: `tx-m5l1-${Math.random().toString(36).slice(2, 8)}`,
        cuotaId: 'cuota-m5l1',
        clienteId: 'alumno-uuid-1',
        entrenadorId: 'coach-uuid-1',
        registradoPor: 'alumno-uuid-1',
        montoOriginal: '1500.00',
        monedaOriginal: Moneda.VES,
        tasaCambioFijada: '60.0000',
        montoEquivalenteUsd: '25.00',
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-m5l1',
        fechaOperacion: '2026-10-05',
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        motivoRechazo: null,
        fechaReporteUtc: new Date(),
        fechaConciliacionUtc: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
        ...overrides,
      };
    }

    it('§G1: cobroDirecto sin referencia persiste null (nunca COBRO_DIRECTO_SALA)', async () => {
      cuotaAbierta();

      const res = await finanzasService.cobroDirecto('cuota-m5l1', 'coach-uuid-1', {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      expect(res.transaccion.referenciaBancaria).toBeNull();
      expect(mockTransaccionesPago[0].referenciaBancaria).toBeNull();
    });

    it('§G2: una referencia idéntica de OTRO entrenador no bloquea el reporte', async () => {
      cuotaAbierta();
      mockTransaccionesPago = [
        txConReferencia({
          id: 'tx-otro-coach',
          entrenadorId: 'coach-uuid-2',
          clienteId: 'alumno-ajeno',
        }),
      ];

      const res = await finanzasService.reportarPago('cuota-m5l1', 'alumno-uuid-1', {
        montoOriginal: '1500.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-m5l1',
        fechaOperacion: '2026-10-05',
      });

      expect(res.esDuplicadoIdempotente).toBe(false);
      expect(res.transaccion.referenciaBancaria).toBe('ref-m5l1');
    });

    it('§G2: un pago RECHAZADO con la misma referencia puede reenviarse', async () => {
      cuotaAbierta();
      mockTransaccionesPago = [
        txConReferencia({
          estadoConciliacion: EstadoConciliacion.RECHAZADO,
          motivoRechazo: 'Fondos no recibidos',
        }),
      ];

      const res = await finanzasService.reportarPago('cuota-m5l1', 'alumno-uuid-1', {
        montoOriginal: '1500.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'ref-m5l1',
        fechaOperacion: '2026-10-05',
      });

      expect(res.esDuplicadoIdempotente).toBe(false);
    });

    it('§G2: el 23505 de uq_transaccion_referencia_entrenador se mapea a ConflictException', async () => {
      cuotaAbierta();
      const error23505 = Object.assign(
        new Error(
          'duplicate key value violates unique constraint "uq_transaccion_referencia_entrenador"'
        ),
        { code: '23505', constraint_name: 'uq_transaccion_referencia_entrenador' }
      );
      const insertOriginal = mockDb.insert.getMockImplementation()!;
      mockDb.insert.mockImplementation((tabla: any) => {
        if (getTableName(tabla) === 'transacciones_pago') {
          return { values: () => ({ returning: () => Promise.reject(error23505) }) };
        }
        return insertOriginal(tabla);
      });

      await expect(
        finanzasService.reportarPago('cuota-m5l1', 'alumno-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-nueva-m5l1',
          fechaOperacion: '2026-10-05',
        })
      ).rejects.toThrow(
        'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.'
      );
    });

    it('§G2: el 23505 anidado en `cause` (constraint) también se mapea', async () => {
      cuotaAbierta();
      const errorEnvuelto = new Error('fallo al insertar transacción', {
        cause: Object.assign(new Error('unique violation'), {
          code: '23505',
          constraint: 'uq_transaccion_referencia_entrenador',
        }),
      });
      const insertOriginal = mockDb.insert.getMockImplementation()!;
      mockDb.insert.mockImplementation((tabla: any) => {
        if (getTableName(tabla) === 'transacciones_pago') {
          return { values: () => ({ returning: () => Promise.reject(errorEnvuelto) }) };
        }
        return insertOriginal(tabla);
      });

      await expect(
        finanzasService.reportarPago('cuota-m5l1', 'alumno-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-nueva-m5l1',
          fechaOperacion: '2026-10-05',
        })
      ).rejects.toThrow(
        'Esta referencia ya ha sido registrada previamente para este método y fecha de operación.'
      );
    });

    it('§G2: cualquier otro error de inserción se propaga sin cambios', async () => {
      cuotaAbierta();
      const errorGenerico = new Error('fallo de red de base de datos');
      const insertOriginal = mockDb.insert.getMockImplementation()!;
      mockDb.insert.mockImplementation((tabla: any) => {
        if (getTableName(tabla) === 'transacciones_pago') {
          return { values: () => ({ returning: () => Promise.reject(errorGenerico) }) };
        }
        return insertOriginal(tabla);
      });

      const capturado = await finanzasService
        .reportarPago('cuota-m5l1', 'alumno-uuid-1', {
          montoOriginal: '1500.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: 'ref-nueva-m5l1',
          fechaOperacion: '2026-10-05',
        })
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(Error);
      expect(capturado).not.toBeInstanceOf(ConflictException);
      expect((capturado as Error).message).toBe('fallo de red de base de datos');
    });

    it('§G3: cobroDirectoInteligente usa la cuota abierta MÁS ANTIGUA por fecha de corte', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-reciente',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-10',
          montoTotalUsd: '40.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaEmisionUtc: new Date('2026-09-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-10-01T03:59:59.999Z'),
          estado: EstadoCuota.EMITIDA,
          createdAtUtc: new Date('2026-09-01T00:00:00Z'),
        },
        {
          id: 'cuota-antigua',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-08',
          montoTotalUsd: '40.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaEmisionUtc: new Date('2026-08-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-09-01T03:59:59.999Z'),
          estado: EstadoCuota.VENCIDA,
          createdAtUtc: new Date('2026-08-01T00:00:00Z'),
        },
      ];

      const res = await finanzasService.cobroDirectoInteligente('coach-uuid-1', 'alumno-uuid-1', {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      expect(res.cuota.id).toBe('cuota-antigua');
    });

    it('§G3: cobroDirectoInteligente ignora las cuotas ANULADA al elegir la abierta', async () => {
      mockCuotasMembresia = [
        {
          id: 'cuota-anulada',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-10',
          montoTotalUsd: '40.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaEmisionUtc: new Date('2026-09-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-10-01T03:59:59.999Z'),
          estado: EstadoCuota.ANULADA,
          createdAtUtc: new Date('2026-09-10T00:00:00Z'),
        },
        {
          id: 'cuota-emitida',
          clienteId: 'alumno-uuid-1',
          entrenadorId: 'coach-uuid-1',
          planId: 'plan-uuid-1',
          periodo: '2026-08',
          montoTotalUsd: '40.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          fechaEmisionUtc: new Date('2026-08-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-09-01T03:59:59.999Z'),
          estado: EstadoCuota.EMITIDA,
          createdAtUtc: new Date('2026-08-01T00:00:00Z'),
        },
      ];

      const res = await finanzasService.cobroDirectoInteligente('coach-uuid-1', 'alumno-uuid-1', {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      expect(res.cuota.id).toBe('cuota-emitida');
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('§G3: sin cuota abierta y CON suscripción emite por adelantado la cuota de proximoCorte', async () => {
      mockPerfilesAlumno[0].planSuscritoId = 'plan-uuid-1';
      mockPerfilesAlumno[0].cicloAncla = '2026-10-01';
      mockPerfilesAlumno[0].proximoCorte = '2026-12-01';
      mockCuotasMembresia = [];

      const res = await finanzasService.cobroDirectoInteligente('coach-uuid-1', 'alumno-uuid-1', {
        montoOriginal: '50.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: '2026-10-09',
      });

      expect(mockCuotasMembresia).toHaveLength(1);
      expect(mockCuotasMembresia[0].periodo).toBe('2026-12');
      expect(new Date(mockCuotasMembresia[0].fechaCorteUtc).toISOString()).toBe(
        '2026-12-02T03:59:59.999Z'
      );
      expect(mockPerfilesAlumno[0].proximoCorte).toBe('2027-01-01');
      expect(res.cuota.id).toBe(mockCuotasMembresia[0].id);
      expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
    });

    it('§G3: sin cuota abierta y SIN suscripción → 400 con el mensaje nuevo (camino viejo eliminado)', async () => {
      mockOverridesClientePlan.push({
        id: 'override-camino-viejo',
        planId: 'plan-uuid-1',
        clienteId: 'alumno-uuid-1',
        precioAcordadoUsd: '40.00',
        tasaFijadaOverride: null,
        beneficiosPersonalizados: null,
        motivoOverride: null,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
      mockCuotasMembresia = [];

      await expect(
        finanzasService.cobroDirectoInteligente('coach-uuid-1', 'alumno-uuid-1', {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: '2026-10-09',
        })
      ).rejects.toThrow(
        'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
      );

      expect(mockCuotasMembresia).toHaveLength(0);
    });
  });
});
