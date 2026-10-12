import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  CobroDirectoInteligenteSchema,
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
  Rol,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  calcularRecaudadoMesUsd,
  calcularVentanaMesUtc,
} from '../../src/common/cartera.util';

/**
 * RF-009/RF-007 · pagos con fecha anterior (contratos 3–5 del prompt 01).
 *
 * Fase ROJA:
 * - contrato 3: `cobroDirecto`, `cobroDirectoInteligente` y `reportarPago` todavía aceptan fechas
 *   futuras (hoy la API no valida);
 * - contrato 4: es una regresión del comportamiento actual (un cobro con fecha anterior se
 *   registra con esa fecha y cuenta en el mes de REGISTRO): se espera verde desde ya;
 * - contrato 5: sin `fechaOperacion`, el cobro inteligente todavía no usa el día local del alumno
 *   (el schema la rellena con el día UTC y el servicio no la sustituye).
 *
 * Mock de BD: réplica del de `finanzas-service.spec.ts` (drizzle mock en memoria), con el INSERT
 * persistente del bloque §G (el mock histórico no escribía en el store y §G lo envuelve para
 * poder releer la cuota emitida). El mock no simula bloqueos ni la ventana SQL del mes.
 */
describe('RF-009/RF-007 · pagos con fecha anterior (contratos 3–5)', () => {
  // ===========================================================================
  // Infraestructura compartida: BD simulada en memoria (drizzle mock).
  // ===========================================================================
  let finanzasService: FinanzasService;
  let mockDb: any;

  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPerfilesAlumno: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  const COACH = 'coach-uuid-1';
  const ALUMNO = 'alumno-uuid-1';
  const PERFIL = 'perfil-alumno-1';
  const PLAN = 'plan-uuid-1';

  const MENSAJE = 'La fecha del pago no puede ser posterior a hoy.';
  /** Futuro lejano: siempre posterior a "hoy" en cualquier zona. */
  const FECHA_FUTURA = '2099-01-01';
  /** El escenario del contrato: una fecha de hace 20 días (siempre en el pasado). */
  const FECHA_HACE_20_DIAS = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
  /** 20 días antes del día 1 del mes UTC en curso: cae SIEMPRE en el mes calendario anterior. */
  const ahora = new Date();
  const FECHA_MES_ANTERIOR = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1) - 20 * 86400000
  )
    .toISOString()
    .slice(0, 10);

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

  /** Acceso a la MISMA referencia del store (los INSERT/UPDATE de esta suite lo necesitan). */
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
      // INSERT persistente (patrón §G de `finanzas-service.spec.ts`): la cuota emitida y la
      // transacción insertada deben poder releerse y contarse en los agregados.
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

  /** Cuota del alumno con los valores por defecto del mock; `parcial` los sobreescribe. */
  function crearCuota(parcial: Record<string, any> = {}): any {
    return {
      clienteId: ALUMNO,
      entrenadorId: COACH,
      planId: PLAN,
      periodo: '2026-10',
      montoTotalUsd: '40.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      fechaEmisionUtc: new Date('2026-09-01T00:00:00Z'),
      fechaCorteUtc: new Date('2026-10-01T03:59:59.999Z'),
      estado: EstadoCuota.EMITIDA,
      createdAtUtc: new Date('2026-09-01T00:00:00Z'),
      updatedAtUtc: new Date('2026-09-01T00:00:00Z'),
      ...parcial,
    };
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: COACH, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
      { id: ALUMNO, email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesEntrenador = [
      {
        id: 'perfil-coach-1',
        usuarioId: COACH,
        nombres: 'Carlos',
        apellidos: 'Coach',
        tasaCambioGlobal: '60.0000',
      },
    ];

    mockPerfilesAlumno = [
      {
        id: PERFIL,
        usuarioId: ALUMNO,
        entrenadorId: COACH,
        nombres: 'Pedro',
        apellidos: 'Pérez',
        tasaFijadaOverride: null,
        saldoAFavorUsd: '0.00',
        // Contrato 5: el día local del alumno se resuelve con SU zona horaria.
        zonaHoraria: 'America/Caracas',
      },
    ];

    mockPlanesMembresia = [
      {
        id: PLAN,
        entrenadorId: COACH,
        nombre: 'Plan Mensual Estándar',
        descripcion: 'Acceso total',
        beneficios: ['Rutina', 'Guía nutricional'],
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
        entrenadorId: COACH,
        tasaOficialBcv: '60.0000',
        tasaParalelo: '65.0000',
        tasaActivaEntrenador: '60.0000',
        fuente: 'manual',
        fechaActualizacionUtc: new Date(),
      },
    ];

    mockDb = createMockDb();
    finanzasService = new FinanzasService(mockDb);
  });

  // ===========================================================================
  // Contrato 3 · rechazo de fechas futuras
  // ===========================================================================
  describe('contrato 3 · rechazo de fechas futuras', () => {
    it('3a · cobroDirecto con fecha futura → 400 con el mensaje y sin transacción ni cambios en la cuota', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-futuro' })];

      const capturado = await finanzasService
        .cobroDirecto('cuota-futuro', COACH, {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: FECHA_FUTURA,
        })
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(BadRequestException);
      expect((capturado as Error).message).toBe(MENSAJE);
      expect(mockTransaccionesPago).toHaveLength(0);
      expect(mockCuotasMembresia[0].saldoPendienteUsd).toBe('40.00');
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
    });

    it('3b · cobroDirectoInteligente con fecha futura → 400 sin emitir la cuota adelantada ni cobrar', async () => {
      mockPerfilesAlumno[0].planSuscritoId = PLAN;
      mockPerfilesAlumno[0].cicloAncla = '2026-10-01';
      mockPerfilesAlumno[0].proximoCorte = '2026-12-01';
      mockCuotasMembresia = [];

      const capturado = await finanzasService
        .cobroDirectoInteligente(COACH, ALUMNO, {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          fechaOperacion: FECHA_FUTURA,
        })
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(BadRequestException);
      expect((capturado as Error).message).toBe(MENSAJE);
      expect(mockCuotasMembresia).toHaveLength(0);
      expect(mockTransaccionesPago).toHaveLength(0);
    });

    it('3c · reportarPago (alumno) con fecha futura → 400 y la cuota no pasa a revisión', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-reporte' })];

      const capturado = await finanzasService
        .reportarPago(
          'cuota-reporte',
          ALUMNO,
          {
            montoOriginal: '1200.00',
            monedaOriginal: Moneda.VES,
            metodoPago: MetodoPago.PAGO_MOVIL,
            referenciaBancaria: '984521',
            fechaOperacion: FECHA_FUTURA,
          },
          'clave-fecha-futura'
        )
        .then(
          () => null,
          (error: unknown) => error
        );

      expect(capturado).toBeInstanceOf(BadRequestException);
      expect((capturado as Error).message).toBe(MENSAJE);
      expect(mockTransaccionesPago).toHaveLength(0);
      expect(mockCuotasMembresia[0].estado).toBe(EstadoCuota.EMITIDA);
    });
  });

  // ===========================================================================
  // Contrato 4 · fecha anterior (regresión: mismo comportamiento que hoy)
  // ===========================================================================
  describe('contrato 4 · fecha anterior', () => {
    it('4a · un cobro con fecha de hace 20 días se registra con esa fechaOperacion', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-anterior' })];

      const res = await finanzasService.cobroDirecto('cuota-anterior', COACH, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: FECHA_HACE_20_DIAS,
      });

      expect(res.transaccion.fechaOperacion).toBe(FECHA_HACE_20_DIAS);
      expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
    });

    it('4b · la fecha anterior se aplica a la cuota abierta MÁS ANTIGUA, como hoy', async () => {
      mockCuotasMembresia = [
        crearCuota({
          id: 'cuota-reciente',
          periodo: '2026-10',
          fechaCorteUtc: new Date('2026-10-01T03:59:59.999Z'),
          createdAtUtc: new Date('2026-09-01T00:00:00Z'),
        }),
        crearCuota({
          id: 'cuota-antigua',
          periodo: '2026-08',
          estado: EstadoCuota.VENCIDA,
          fechaCorteUtc: new Date('2026-09-01T03:59:59.999Z'),
          createdAtUtc: new Date('2026-08-01T00:00:00Z'),
        }),
      ];

      const res = await finanzasService.cobroDirectoInteligente(COACH, ALUMNO, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: FECHA_HACE_20_DIAS,
      });

      expect(res.cuota.id).toBe('cuota-antigua');
      expect(res.transaccion.cuotaId).toBe('cuota-antigua');
      expect(res.transaccion.fechaOperacion).toBe(FECHA_HACE_20_DIAS);
    });

    it('4c · en VES la fecha anterior usa la tasa vigente al registrar (60.0000)', async () => {
      mockCuotasMembresia = [
        crearCuota({ id: 'cuota-ves', montoTotalUsd: '200.00', saldoPendienteUsd: '200.00' }),
      ];

      const res = await finanzasService.cobroDirecto('cuota-ves', COACH, {
        montoOriginal: '6000.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.EFECTIVO_VES,
        fechaOperacion: FECHA_HACE_20_DIAS,
      });

      expect(res.transaccion.tasaCambioFijada).toBe('60.0000');
      expect(res.transaccion.montoEquivalenteUsd).toBe('100.00');
      expect(res.transaccion.fechaOperacion).toBe(FECHA_HACE_20_DIAS);
    });

    it('4d · cuenta en el recaudado del mes de REGISTRO (KPI-01 y totalPagadoMesActualUsd)', async () => {
      // FECHA_MES_ANTERIOR cae SIEMPRE en el mes calendario anterior: si algún agregado contara
      // por fecha de pago, este cobro quedaría fuera del mes en curso.
      mockCuotasMembresia = [crearCuota({ id: 'cuota-mes-anterior' })];

      const res = await finanzasService.cobroDirecto('cuota-mes-anterior', COACH, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
        fechaOperacion: FECHA_MES_ANTERIOR,
      });
      expect(res.transaccion.fechaOperacion).toBe(FECHA_MES_ANTERIOR);

      // KPI-01: el helper real del resumen de cartera, con la ventana del mes UTC en curso.
      const ventana = calcularVentanaMesUtc(new Date());
      const recaudadoMesUsd = await calcularRecaudadoMesUsd(mockDb, COACH, ventana);
      expect(recaudadoMesUsd).toBe('40.00');

      // `totalPagadoMesActualUsd` del historial del alumno (mismo criterio: mes de registro).
      const resumen = await finanzasService.obtenerHistorialCliente(
        COACH,
        PERFIL,
        COACH,
        Rol.ENTRENADOR
      );
      expect(resumen.totalPagadoMesActualUsd).toBe('40.00');
    });
  });

  // ===========================================================================
  // Contrato 5 · sin fecha: día local del alumno
  // ===========================================================================
  describe('contrato 5 · sin fecha: día local del alumno', () => {
    it('5a · el ejemplo del contrato: alumno en Caracas y 2026-10-11T23:30Z → 2026-10-11', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-sin-fecha' })];

      const res = await finanzasService.cobroDirectoInteligente(
        COACH,
        ALUMNO,
        {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
        },
        undefined,
        new Date('2026-10-11T23:30:00.000Z')
      );

      expect(res.transaccion.fechaOperacion).toBe('2026-10-11');
    });

    it('5b · sin fecha: a las 22:00 de Caracas (02:00Z del día siguiente) NO usa el día UTC', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-sin-fecha-utc' })];

      const res = await finanzasService.cobroDirectoInteligente(
        COACH,
        ALUMNO,
        {
          montoOriginal: '40.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
        },
        undefined,
        // En UTC ya es 2026-10-12; en America/Caracas sigue siendo 2026-10-11.
        new Date('2026-10-12T02:00:00.000Z')
      );

      expect(res.transaccion.fechaOperacion).toBe('2026-10-11');
    });

    it('5c · CobroDirectoInteligenteSchema: la fecha queda opcional y sin valor por defecto', () => {
      const parseado = CobroDirectoInteligenteSchema.parse({
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.EFECTIVO_USD,
      });

      expect(parseado.fechaOperacion).toBeUndefined();
    });
  });

  // ===========================================================================
  // Contrato 2 (hallazgo 2 del reporte 04) · la guarda futura vive dentro de la idempotencia
  // ===========================================================================
  describe('contrato 2 · reportarPago: reintento con la misma clave tras el corte', () => {
    function dtoReporte(fechaOperacion: string) {
      return {
        montoOriginal: '1200.00',
        monedaOriginal: Moneda.VES,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: '984521',
        fechaOperacion,
      };
    }

    it('2b-i · reintento con la misma clave y cuerpo futuro devuelve el éxito guardado (2xx, duplicado, sin otro pago)', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-reintento' })];

      const primero = await finanzasService.reportarPago(
        'cuota-reintento',
        ALUMNO,
        dtoReporte(FECHA_HACE_20_DIAS),
        'clave-reintento-futuro'
      );
      expect(primero.esDuplicadoIdempotente).toBe(false);
      expect(mockTransaccionesPago).toHaveLength(1);

      // El reintento trae la misma clave pero una fecha que hoy sería futura: con la guarda
      // dentro de `idempotencia.ejecutar` la caché responde antes de validar (con la guarda
      // fuera, este reintento daría 400 sobre un pago que sí existe).
      const reintento = await finanzasService.reportarPago(
        'cuota-reintento',
        ALUMNO,
        dtoReporte(FECHA_FUTURA),
        'clave-reintento-futuro'
      );

      expect(reintento.esDuplicadoIdempotente).toBe(true);
      expect(reintento.transaccion.fechaOperacion).toBe(FECHA_HACE_20_DIAS);
      expect(mockTransaccionesPago).toHaveLength(1);
    });

    it('2b-ii · un 400 por fecha futura no se cachea: reintento válido con la misma clave tiene éxito', async () => {
      mockCuotasMembresia = [crearCuota({ id: 'cuota-reintento-valido' })];

      const fallido = await finanzasService
        .reportarPago(
          'cuota-reintento-valido',
          ALUMNO,
          dtoReporte(FECHA_FUTURA),
          'clave-fallo-no-cacheado'
        )
        .then(
          () => null,
          (error: unknown) => error
        );
      expect(fallido).toBeInstanceOf(BadRequestException);
      expect((fallido as Error).message).toBe(MENSAJE);
      expect(mockTransaccionesPago).toHaveLength(0);

      const reintento = await finanzasService.reportarPago(
        'cuota-reintento-valido',
        ALUMNO,
        dtoReporte(FECHA_HACE_20_DIAS),
        'clave-fallo-no-cacheado'
      );

      expect(reintento.esDuplicadoIdempotente).toBe(false);
      expect(reintento.transaccion.fechaOperacion).toBe(FECHA_HACE_20_DIAS);
      expect(mockTransaccionesPago).toHaveLength(1);
    });
  });
});
