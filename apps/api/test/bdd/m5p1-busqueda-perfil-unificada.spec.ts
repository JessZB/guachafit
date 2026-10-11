import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EstadoAlumno, MetodoPago, Moneda, Rol } from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import {
  MENSAJE_ALUMNO_FUERA_DE_LISTA,
  MENSAJE_ALUMNO_NO_ENCONTRADO,
} from '../../src/common/mensajes-acceso';

/**
 * M5 · lote P1 (contrato C): búsqueda del perfil UNIFICADA con el 404 de cartera
 * (RNF-003 §3.1).
 *
 * `cobroDirectoInteligente` y `obtenerHistorialCliente` (rol ENTRENADOR) resuelven el perfil
 * con la MISMA búsqueda que el resto del módulo (`buscarPerfilDeCartera`):
 * - otro entrenador OR inexistente → 404 `MENSAJE_ALUMNO_FUERA_DE_LISTA` (antes 403 / otro 404).
 * - archivado: en el COBRO se mantiene el 404; en el HISTORIAL el coach SÍ puede consultar
 *   los pagos de un alumno archivado.
 * - Para el rol ALUMNO no cambia nada: otro alumno sigue en 403 propio y el inexistente
 *   sigue en 404 `MENSAJE_ALUMNO_NO_ENCONTRADO`.
 *
 * En fase roja FALLA: dos caminos aún devuelven el comportamiento viejo (403 y el 404 con
 * texto de "no encontramos"). El archivado del cobro y los dos caminos del alumno ya
 * cumplen: quedan clavados como PASA.
 */
describe('M5 P1 · búsqueda del perfil unificada 404 (contrato C, RNF-003 §3.1)', () => {
  const UUID_COACH_A = '11111111-1111-4111-8111-111111111111';
  const UUID_COACH_B = '22222222-2222-4222-8222-222222222222';
  const UUID_ALUMNO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const UUID_ALUMNO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const UUID_OTRO_ALUMNO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
  const UUID_PLAN = '99999999-9999-4999-8999-999999999999';

  const DTO_EFECTIVO = {
    montoOriginal: '40.00',
    monedaOriginal: Moneda.USD,
    metodoPago: MetodoPago.EFECTIVO_USD,
    fechaOperacion: '2026-10-09',
  };

  let finanzasService: FinanzasService;
  let mockDb: any;

  let mockPerfilesAlumno: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];

  // ===========================================================================
  // BD simulada en memoria (mismo patrón que rf005-rf009-m5l1-correcciones.spec.ts).
  // ===========================================================================
  let mockUsuarios: any[];
  let mockPerfilesEntrenador: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
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

  function getTableArray(tableName: string): any[] {
    return getTablaCruda(tableName).map(normalizeRecord);
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          let filtered = getTableArray(tableName);
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
            for: vi.fn(() => queryObj),
            groupBy: vi.fn(() => queryObj),
            having: vi.fn(() => queryObj),
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
          const targetArray = getTablaCruda(getTableName(table));
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
      { id: UUID_COACH_A, email: 'coach-a@guachafit.com', rol: Rol.ENTRENADOR },
      { id: UUID_COACH_B, email: 'coach-b@guachafit.com', rol: Rol.ENTRENADOR },
      { id: UUID_ALUMNO_A, email: 'alumno-a@guachafit.com', rol: Rol.ALUMNO },
      { id: UUID_OTRO_ALUMNO, email: 'otro@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesEntrenador = [
      {
        id: 'perfil-coach-a',
        usuarioId: UUID_COACH_A,
        nombres: 'Coach',
        apellidos: 'A',
        tasaCambioGlobal: null,
      },
      {
        id: 'perfil-coach-b',
        usuarioId: UUID_COACH_B,
        nombres: 'Coach',
        apellidos: 'B',
        tasaCambioGlobal: null,
      },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-a',
        usuarioId: UUID_ALUMNO_A,
        entrenadorId: UUID_COACH_A,
        nombres: 'Alumno',
        apellidos: 'De A',
        tasaFijadaOverride: null,
        zonaHoraria: 'America/Caracas',
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-01',
        proximoCorte: '2026-11-01',
        deletedAtUtc: null,
      },
      {
        id: 'perfil-alumno-b',
        usuarioId: UUID_ALUMNO_B,
        entrenadorId: UUID_COACH_B,
        nombres: 'Alumno',
        apellidos: 'De B',
        tasaFijadaOverride: null,
        zonaHoraria: 'America/Caracas',
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: UUID_PLAN,
        cicloAncla: '2026-10-01',
        proximoCorte: '2026-11-01',
        deletedAtUtc: null,
      },
      {
        id: 'perfil-alumno-archivado',
        usuarioId: UUID_OTRO_ALUMNO,
        entrenadorId: UUID_COACH_A,
        nombres: 'Alumno',
        apellidos: 'Archivado',
        tasaFijadaOverride: null,
        zonaHoraria: 'America/Caracas',
        estadoActivacion: EstadoAlumno.ACTIVO,
        planSuscritoId: null,
        cicloAncla: null,
        proximoCorte: null,
        deletedAtUtc: new Date('2026-09-15T12:00:00.000Z'),
      },
    ];

    mockPlanesMembresia = [
      {
        id: UUID_PLAN,
        entrenadorId: UUID_COACH_A,
        nombre: 'Plan Mensual Estándar',
        descripcion: null,
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
    mockTasasCambioReferencia = [];

    mockDb = createMockDb();
    finanzasService = new FinanzasService(mockDb);
  });

  async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
    return await Promise.resolve(promesa).then(
      () => null,
      (error: unknown) => error
    );
  }

  // ===========================================================================
  // C1 · cobroDirectoInteligente (rol ENTRENADOR)
  // ===========================================================================
  describe('C1 · cobroDirectoInteligente responde el 404 de cartera', () => {
    it('C1: un alumno de OTRO entrenador → NotFoundException MENSAJE_ALUMNO_FUERA_DE_LISTA (antes 403)', async () => {
      const error = await capturarError(
        finanzasService.cobroDirectoInteligente(UUID_COACH_A, UUID_ALUMNO_B, DTO_EFECTIVO)
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    });

    it('C1: un id inexistente → NotFoundException MENSAJE_ALUMNO_FUERA_DE_LISTA (texto unificado)', async () => {
      const error = await capturarError(
        finanzasService.cobroDirectoInteligente(UUID_COACH_A, UUID_INEXISTENTE, DTO_EFECTIVO)
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    });

    it('C1: un alumno archivado sigue respondiendo 404 MENSAJE_ALUMNO_FUERA_DE_LISTA', async () => {
      const error = await capturarError(
        finanzasService.cobroDirectoInteligente(UUID_COACH_A, UUID_OTRO_ALUMNO, DTO_EFECTIVO)
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    });
  });

  // ===========================================================================
  // C2 · obtenerHistorialCliente (rol ENTRENADOR)
  // ===========================================================================
  describe('C2 · obtenerHistorialCliente del coach responde el 404 de cartera', () => {
    it('C2: un alumno de otro entrenador → NotFoundException MENSAJE_ALUMNO_FUERA_DE_LISTA (antes 403)', async () => {
      const error = await capturarError(
        finanzasService.obtenerHistorialCliente(
          UUID_COACH_A,
          UUID_ALUMNO_B,
          UUID_COACH_A,
          Rol.ENTRENADOR
        )
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    });

    it('C2: un id inexistente → NotFoundException MENSAJE_ALUMNO_FUERA_DE_LISTA (texto unificado)', async () => {
      const error = await capturarError(
        finanzasService.obtenerHistorialCliente(
          UUID_COACH_A,
          UUID_INEXISTENTE,
          UUID_COACH_A,
          Rol.ENTRENADOR
        )
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    });

    it('C2: un alumno ARCHIVADO SÍ devuelve el historial (el coach consulta sus pagos)', async () => {
      const historial = await finanzasService.obtenerHistorialCliente(
        UUID_COACH_A,
        UUID_OTRO_ALUMNO,
        UUID_COACH_A,
        Rol.ENTRENADOR
      );

      expect(historial.alumnoId).toBe('perfil-alumno-archivado');
      expect(historial.usuarioId).toBe(UUID_OTRO_ALUMNO);
      expect(Array.isArray(historial.transacciones)).toBe(true);
    });
  });

  // ===========================================================================
  // C3 · obtenerHistorialCliente (rol ALUMNO): sin cambios
  // ===========================================================================
  describe('C3 · obtenerHistorialCliente del alumno no cambia', () => {
    it('C3: otro alumno → 403 "Solo puedes ver tus propios pagos."', async () => {
      const error = await capturarError(
        finanzasService.obtenerHistorialCliente(
          UUID_COACH_A,
          UUID_ALUMNO_A,
          UUID_OTRO_ALUMNO,
          Rol.ALUMNO
        )
      );

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as Error).message).toBe('Solo puedes ver tus propios pagos.');
    });

    it('C3: un id inexistente → 404 MENSAJE_ALUMNO_NO_ENCONTRADO', async () => {
      const error = await capturarError(
        finanzasService.obtenerHistorialCliente(
          UUID_COACH_A,
          UUID_INEXISTENTE,
          UUID_ALUMNO_A,
          Rol.ALUMNO
        )
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(MENSAJE_ALUMNO_NO_ENCONTRADO);
    });
  });
});
