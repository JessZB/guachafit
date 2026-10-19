/**
 * T1 (S1) — Contrato A · API `GET /alumnos`: directorio "Mis alumnos" (tests en rojo).
 *
 * Origen: `.external-agents/01-mis-alumnos-tests.md` §A (A1-A7) + `odd/tasks/mis-alumnos-tests.md` S1.
 * Patrón de arranque y datos: `apps/api/test/bdd/rf011-rf012-alumnos-edge-cases.spec.ts`
 * Lote 03 (`.external-agents/03-mis-alumnos-tests.md`): A2 (valor) y el valor de A7 pasan al
 * E2E (el mock no evalúa la subconsulta escalar de `expresionUltimaSesion()`). El mock conserva
 * A1, A3, la validación de A4, el aislamiento de A7 y una aserción de FORMA de
 * `ultimaSesionFecha` (propiedad presente, `null` o string; aquí da `null`).
 * El orden por valor (A4 por valor, A5, A6, `sin_entrenar` de A7) vive en
 * `mis-alumnos-directorio-orden.e2e.spec.ts` contra PostgreSQL real.
 * (mock drizzle `createMockDb` sin DB real/docker/env, sin TestModule; `AlumnosService` +
 * `AlumnosController` con `mockDb`/`mockCrypto`). `getTableArray` se extiende con
 * `sesiones_entrenamiento` (el archivo base no la tiene: 0 hits de sesion/racha).
 *
 * Producción actual (`apps/api/src/modules/alumnos/casos-alumnos/listar-alumnos.ts:51-164`):
 * ordena `createdAtUtc` desc + `id` asc, el select incluye `fichaSaludPrivada:121`, no expone
 * `ultimaSesionFecha`/`rachaDias` ni el parámetro `orden`. Estos tests deben fallar contra eso
 * por la razón esperada (falta el campo / el parámetro), nunca por importación o configuración.
 *
 * Mapa:
 * - A1: el listado no expone `fichaSaludPrivada` (ni con ficha guardada); `GET /:id` la conserva.
 * - A2: FORMA de `ultimaSesionFecha` (propiedad presente, `null` o string); el valor vive en el E2E.
 * - A3: `rachaDias` efectiva (hoy/ayer en día local de `zonaHoraria`, else 0) + passthrough YYYY-MM-DD.
 * - A4: parámetro `orden` (`OrdenDirectorioAlumnos` de `@guachafit/shared`, aún no existe).
 * - A5: paginación coherente por cada orden (limit=2 + offsets vs limit=100).
 * - A6: `orden` se combina con q, estado, modalidad, semaforoPago y soloArchivados.
 * - A7: aislamiento — sesiones de otro coach no alteran `ultimaSesionFecha` ni `sin_entrenar`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Rol,
  EstadoAlumno,
  TipoDocumento,
  Modalidad,
  EstadoSesion,
  FiltroDirectorioAlumnosSchema,
} from '@guachafit/shared';
import * as shared from '@guachafit/shared';
import { BadRequestException } from '@nestjs/common';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { getTableName } from '@guachafit/database';

// A4: el enum aún no existe en `@guachafit/shared`. Se lee por namespace (igual que el spec
// hermano de T2) para que el fallo sea por test ("falta el export") y no rompa la carga del archivo.
const OrdenDirectorioAlumnos = (
  shared as unknown as { OrdenDirectorioAlumnos?: Record<string, string> }
).OrdenDirectorioAlumnos;

describe('Contrato A · GET /alumnos — directorio "Mis alumnos"', () => {
  const COACH_A_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_B_ID = '22222222-2222-4222-8222-222222222222';

  const U_ZOE = 'aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa';
  const U_ANA = 'aaaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa';
  const U_MARTA = 'aaaaaaaa-0003-4aaa-8aaa-aaaaaaaaaaaa';
  const U_LUIS = 'aaaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa';
  const U_ROSA = 'aaaaaaaa-0005-4aaa-8aaa-aaaaaaaaaaaa';
  const U_RITA = 'aaaaaaaa-0006-4aaa-8aaa-aaaaaaaaaaaa';
  const U_BETO = 'bbbbbbbb-0001-4bbb-8bbb-bbbbbbbbbbbb';

  const P_ZOE = 'a4444444-4444-4444-8444-444444444444';
  const P_ANA = 'a1111111-1111-4111-8111-111111111111';
  const P_MARTA = 'a3333333-3333-4333-8333-333333333333';
  const P_LUIS = 'a2222222-2222-4222-8222-222222222222';
  const P_ROSA = 'b1111111-1111-4111-8111-111111111111';
  const P_RITA = 'b2222222-2222-4222-8222-222222222222';
  const P_BETO = 'c1111111-1111-4111-8111-111111111111';

  const ZONA = 'America/Caracas';

  // A2: hitos fijos en UTC para que el MAX sea determinista.
  const ISO_ZOE_MAX = '2026-03-15T12:00:00.000Z';
  const ISO_MARTA_MAX = '2026-01-20T12:00:00.000Z';
  const ISO_LUIS_MAX = '2026-02-01T12:00:00.000Z';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockPerfilesEntrenador: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];
  let mockSesiones: any[];

  let alumnosService: AlumnosService;
  let alumnosController: AlumnosController;

  // A3: hoy/ayer se calculan en el día local de la zona del alumno (runtime, no fecha fija).
  let HOY_LOCAL: string;
  let AYER_LOCAL: string;

  const mockCryptoService = {
    encryptHealthRecord: vi.fn((val: string) => `ENCRYPTED:${val}`),
    decryptHealthRecord: vi.fn((val: string) =>
      val.startsWith('ENCRYPTED:') ? val.replace('ENCRYPTED:', '') : val
    ),
    generateInvitationToken: vi.fn(() => ({
      rawToken: 'token-raw-1234567890abcdef',
      tokenHash: 'token-hash-1234567890abcdef',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    })),
    hashPassword: vi.fn(async (p: string) => `hash-${p}`),
  } as any;

  function fechaLocalYyyyMmDd(fecha: Date, zonaHoraria: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fecha);
  }

  function diaAnteriorYyyyMmDd(fechaYyyyMmDd: string): string {
    const [anio, mes, dia] = fechaYyyyMmDd.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia) - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  const ordenDe = (filtro: unknown): unknown => (filtro as { orden?: unknown }).orden;
  const parsear = (q: unknown) => FiltroDirectorioAlumnosSchema.parse(q);

  type OpCondicion = 'eq' | 'ne' | 'isNull' | 'isNotNull' | 'ilike' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte';

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; op?: OpCondicion }> {
    const conditions: Array<{ column: string; value: any; op?: OpCondicion }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          const opText = subsequent
            .map((c: any) =>
              typeof c === 'string'
                ? c
                : Array.isArray(c?.value)
                ? c.value.join('')
                : typeof c?.value === 'string'
                ? c.value
                : ''
            )
            .join(' ');
          const texto = opText.toLowerCase();
          const params: any[] = [];
          for (const c of subsequent) {
            // Los parámetros string se incrustan como strings crudos; el resto como { value }.
            if (typeof c === 'string') {
              params.push(c);
            } else if (
              c &&
              typeof c === 'object' &&
              'value' in c &&
              !Array.isArray(c.value) &&
              !c.queryChunks
            ) {
              params.push(c.value);
            } else if (Array.isArray(c)) {
              // WU25a: `inArray`/`notInArray` interpolan la lista como array de `Param`; se
              // aplana para que el filtro IN se evalúe de verdad (antes se ignoraba).
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
            }
          }

          if (texto.includes('is not null')) {
            conditions.push({ column: chunk.name, value: null, op: 'isNotNull' });
            continue;
          }
          if (texto.includes('is null')) {
            conditions.push({ column: chunk.name, value: null, op: 'isNull' });
            continue;
          }

          const esNotIn = /\snot\s+in\s/.test(texto);
          const esIn = !esNotIn && /\sin\s/.test(texto);
          const isIlike = texto.includes('ilike');
          const isNe = opText.includes('<>') || opText.includes('!=') || opText.includes('distinct');
          const operadorComparacion = opText.match(/>=|<=|>|</)?.[0];
          let op: OpCondicion = 'eq';
          if (isNe) op = 'ne';
          else if (esNotIn) op = 'notIn';
          else if (esIn) op = 'in';
          else if (isIlike) op = 'ilike';
          else if (operadorComparacion === '>=') op = 'gte';
          else if (operadorComparacion === '<=') op = 'lte';
          else if (operadorComparacion === '>') op = 'gt';
          else if (operadorComparacion === '<') op = 'lt';

          if (params.length > 0) {
            conditions.push({
              column: chunk.name,
              value: esIn || esNotIn ? params : params[0],
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
    return record[columna] !== undefined
      ? record[columna]
      : record[columna.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase())];
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

  function matchesField(record: any, condOrCol: any, valueParam?: any, opParam?: string): boolean {
    const col = typeof condOrCol === 'string' ? condOrCol : condOrCol?.column;
    const val = typeof condOrCol === 'string' ? valueParam : condOrCol?.value;
    const op = typeof condOrCol === 'string' ? opParam : condOrCol?.op;

    if (!col) return true;
    const recordVal = valorDeColumna(record, col);

    switch (op) {
      case 'isNull':
        return recordVal === null || recordVal === undefined;
      case 'isNotNull':
        return recordVal !== null && recordVal !== undefined;
      case 'ne':
        return recordVal !== val;
      case 'in':
        return Array.isArray(val) && val.includes(recordVal);
      case 'notIn':
        return Array.isArray(val) && !val.includes(recordVal);
      case 'gt':
        return compararValores(recordVal, val) > 0;
      case 'gte':
        return compararValores(recordVal, val) >= 0;
      case 'lt':
        return compararValores(recordVal, val) < 0;
      case 'lte':
        return compararValores(recordVal, val) <= 0;
      case 'ilike': {
        const patron = String(val ?? '')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/%/g, '.*')
          .replace(/_/g, '.');
        return new RegExp(`^${patron}$`, 'i').test(String(recordVal ?? ''));
      }
      default:
        return recordVal === val;
    }
  }

  function camelizar(columna: string): string {
    return columna.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase());
  }

  /** WU-H: ¿el chunk es un operador lógico de primer nivel (`and`/`or`)? */
  function esOperadorLogico(chunk: any): boolean {
    const valores = chunk?.value;
    return (
      Array.isArray(valores) &&
      valores.length === 1 &&
      typeof valores[0] === 'string' &&
      /^\s*(and|or)\s*$/i.test(valores[0])
    );
  }

  function esParentesisPuro(chunk: any): boolean {
    const valores = chunk?.value;
    return (
      Array.isArray(valores) &&
      valores.length === 1 &&
      typeof valores[0] === 'string' &&
      /^\s*[()]\s*$/.test(valores[0])
    );
  }

  /**
   * WU-H: evaluador recursivo del AST de drizzle que respeta la semántica de `and`/`or`
   * (antes TODAS las condiciones extraídas se combinaban con AND, lo que rompía cualquier
   * `or(...)` real como el semáforo por_vencer o la mora).
   */
  function evaluarPredicado(predicado: any, item: any): boolean {
    const chunks: any[] = predicado?.queryChunks ?? [];
    if (chunks.length === 0) return true;

    const partes: Array<{ op: string | null; sql: any }> = [];
    let opPendiente: string | null = null;
    for (const chunk of chunks) {
      if (esOperadorLogico(chunk)) {
        opPendiente = /or/i.test(chunk.value[0]) ? 'or' : 'and';
        continue;
      }
      if (!chunk || !Array.isArray(chunk.queryChunks) || esParentesisPuro(chunk)) continue;
      partes.push({ op: opPendiente, sql: chunk });
      opPendiente = null;
    }

    const tieneColumna = chunks.some((c: any) => c && typeof c.name === 'string');
    const tieneOperador = partes.some((parte) => parte.op !== null);

    // Sin columna propia en este nivel: es un contenedor (paréntesis/grupo lógico).
    if (!tieneColumna) {
      if (partes.length === 0) return true;
      if (!tieneOperador) return partes.every((parte) => evaluarPredicado(parte.sql, item));

      // Combinar partes respetando `and`/`or` (drizzle anida los grupos, por lo que un
      // recorrido secuencial con acumulación por AND y cierre por OR reproduce la semántica).
      let resultado = false;
      let grupoActual: boolean | null = null;
      for (const parte of partes) {
        const valor = evaluarPredicado(parte.sql, item);
        if (parte.op === 'or' || grupoActual === null) {
          if (grupoActual !== null) resultado = resultado || grupoActual;
          grupoActual = valor;
        } else {
          grupoActual = grupoActual && valor;
        }
      }
      return resultado || (grupoActual ?? true);
    }

    // Condición atómica (eq/ne/in/notIn/gt/gte/lt/lte/ilike/isNull...).
    const condiciones = extractConditions(predicado);
    return condiciones.every((cond) => matchesField(item, cond));
  }

  function esExpresionCount(expr: any): boolean {
    if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return false;
    return expr.queryChunks.some(
      (c: any) =>
        Array.isArray(c?.value) &&
        c.value.some((v: any) => typeof v === 'string' && v.toLowerCase().includes('count('))
    );
  }

  function esExpresionCountDistinct(expr: any): boolean {
    if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return false;
    return expr.queryChunks.some(
      (c: any) =>
        Array.isArray(c?.value) &&
        c.value.some((v: any) =>
          typeof v === 'string' && v.toLowerCase().includes('count(distinct')
        )
    );
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
        Object.values(seleccion).some((valor) => esExpresionCount(valor))
    );
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'planes_membresia') return mockPlanesMembresia;
    if (tableName === 'overrides_cliente_plan') return mockOverridesClientePlan;
    if (tableName === 'cuotas_membresia') return mockCuotasMembresia;
    if (tableName === 'transacciones_pago') return mockTransaccionesPago;
    if (tableName === 'tasas_cambio_referencia') return mockTasasCambioReferencia;
    if (tableName === 'perfiles_entrenador') return mockPerfilesEntrenador;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'usuarios') return mockUsuarios;
    // T1: el archivo base no cubre sesiones (grep 0 hits de sesion/racha); A2/A7 la necesitan.
    if (tableName === 'sesiones_entrenamiento') return mockSesiones;
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
          let columnasGrupo: string[] = [];

          const queryObj: any = {
            innerJoin: vi.fn((joinTable: any) => queryObj),
            leftJoin: vi.fn((joinTable: any) => queryObj),
            where: vi.fn((predicate: any) => {
              // WU-H: el evaluador respeta la semántica real de `and`/`or` del AST de drizzle
              // (la búsqueda `q` y el semáforo por_vencer dependen de `or(...)`).
              filtered = filtered.filter((item) => evaluarPredicado(predicate, item));
              return queryObj;
            }),
            orderBy: vi.fn(() => queryObj),
            groupBy: vi.fn((...cols: any[]) => {
              columnasGrupo = cols
                .map((col) => (col && typeof col.name === 'string' ? col.name : null))
                .filter((name): name is string => Boolean(name));
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
              // OFFSET/LIMIT se aplican al resolver, como en SQL (offset primero).
              const pagina =
                limiteAplicado === null
                  ? filtered.slice(desplazamientoAplicado)
                  : filtered.slice(desplazamientoAplicado, desplazamientoAplicado + limiteAplicado);

              // Selecciones agregadas (count/countDistinct): una fila por grupo (o una sola).
              if (esSeleccionAgregada(fieldsSelection)) {
                const grupos: Array<{ claves: Record<string, any>; filas: any[] }> = [];
                if (columnasGrupo.length > 0) {
                  const mapa = new Map<string, { claves: Record<string, any>; filas: any[] }>();
                  for (const fila of pagina) {
                    const claves: Record<string, any> = {};
                    for (const columna of columnasGrupo) {
                      claves[camelizar(columna)] = valorDeColumna(fila, columna);
                    }
                    const clave = JSON.stringify(claves);
                    if (!mapa.has(clave)) mapa.set(clave, { claves, filas: [] });
                    mapa.get(clave)!.filas.push(fila);
                  }
                  grupos.push(...mapa.values());
                } else {
                  grupos.push({ claves: {}, filas: pagina });
                }

                return resolve(
                  grupos.map(({ claves, filas }) => {
                    const resultado: Record<string, any> = { ...claves };
                    for (const [campo, expr] of Object.entries(
                      fieldsSelection as Record<string, any>
                    )) {
                      if (!esExpresionCount(expr)) continue;
                      const columna = buscarNombreColumna(expr);
                      resultado[campo] =
                        esExpresionCountDistinct(expr) && columna
                          ? new Set(filas.map((fila) => valorDeColumna(fila, columna))).size
                          : filas.length;
                    }
                    return resultado;
                  })
                );
              }

              if (tableName === 'perfiles_alumno' && fieldsSelection && typeof fieldsSelection === 'object') {
                const joined = pagina.map((p) => {
                  const u = mockUsuarios.find((user) => user.id === p.usuarioId);
                  return {
                    ...p,
                    email: u?.email || null,
                  };
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
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  const reqCoachA = () => ({
    user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID },
  });

  beforeEach(() => {
    HOY_LOCAL = fechaLocalYyyyMmDd(new Date(), ZONA);
    AYER_LOCAL = diaAnteriorYyyyMmDd(HOY_LOCAL);

    mockUsuarios = [
      { id: COACH_A_ID, email: 'coach.a@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: COACH_B_ID, email: 'coach.b@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: U_ZOE, email: 'zoe@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_ANA, email: 'ana@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_MARTA, email: 'marta@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_LUIS, email: 'luis@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_ROSA, email: 'rosa@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_RITA, email: 'rita@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: U_BETO, email: 'beto@guachafit.com', rol: Rol.ALUMNO, activo: true },
    ];

    mockPerfilesEntrenador = [
      { id: 'perfil-coach-a', usuarioId: COACH_A_ID, nombres: 'Carlos', apellidos: 'Coach A', tasaCambioGlobal: '65.0000' },
      { id: 'perfil-coach-b', usuarioId: COACH_B_ID, nombres: 'Bruno', apellidos: 'Coach B', tasaCambioGlobal: '65.0000' },
    ];

    // Inserción deliberada [ZOE, ANA, MARTA, LUIS]: no alfabética, no por alta, no por entreno.
    mockPerfilesAlumno = [
      {
        id: P_ZOE,
        usuarioId: U_ZOE,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000001',
        nombres: 'Zoe',
        apellidos: 'Zuluaga',
        fechaNacimiento: '1995-05-15',
        telefonoWhatsapp: '+584120000001',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: 'ENCRYPTED:Asma controlada',
        rachaDias: 5,
        rachaUltimaFecha: HOY_LOCAL,
        zonaHoraria: ZONA,
        deletedAtUtc: null,
        createdAtUtc: new Date('2026-01-03T10:00:00.000Z'),
      },
      {
        id: P_ANA,
        usuarioId: U_ANA,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000002',
        nombres: 'Ana',
        apellidos: 'Alvarez',
        fechaNacimiento: '1998-10-20',
        telefonoWhatsapp: '+584120000002',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        rachaDias: 9,
        rachaUltimaFecha: '2020-01-01',
        zonaHoraria: ZONA,
        deletedAtUtc: null,
        createdAtUtc: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: P_MARTA,
        usuarioId: U_MARTA,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000003',
        nombres: 'Marta',
        apellidos: 'Mendez',
        fechaNacimiento: '1990-03-03',
        telefonoWhatsapp: '+584120000003',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        fichaSaludPrivada: null,
        rachaDias: 3,
        rachaUltimaFecha: AYER_LOCAL,
        zonaHoraria: ZONA,
        deletedAtUtc: null,
        createdAtUtc: new Date('2026-01-02T10:00:00.000Z'),
      },
      {
        id: P_LUIS,
        usuarioId: U_LUIS,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000004',
        nombres: 'Luis',
        apellidos: 'Lopez',
        fechaNacimiento: '1997-07-07',
        telefonoWhatsapp: '+584120000004',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        rachaDias: 7,
        rachaUltimaFecha: null,
        zonaHoraria: ZONA,
        deletedAtUtc: null,
        createdAtUtc: new Date('2026-01-05T10:00:00.000Z'),
      },
      {
        id: P_ROSA,
        usuarioId: U_ROSA,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000005',
        nombres: 'Rosa',
        apellidos: 'Robles',
        fechaNacimiento: '1996-06-06',
        telefonoWhatsapp: '+584120000005',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        rachaDias: 4,
        rachaUltimaFecha: null,
        zonaHoraria: ZONA,
        deletedAtUtc: new Date('2026-02-01T12:00:00.000Z'),
        createdAtUtc: new Date('2026-01-04T10:00:00.000Z'),
      },
      {
        id: P_RITA,
        usuarioId: U_RITA,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '10000006',
        nombres: 'Rita',
        apellidos: 'Ramos',
        fechaNacimiento: '1999-09-09',
        telefonoWhatsapp: '+584120000006',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        rachaDias: 0,
        rachaUltimaFecha: null,
        zonaHoraria: ZONA,
        deletedAtUtc: new Date('2026-02-02T12:00:00.000Z'),
        createdAtUtc: new Date('2026-01-06T10:00:00.000Z'),
      },
      {
        id: P_BETO,
        usuarioId: U_BETO,
        entrenadorId: COACH_B_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '20000001',
        nombres: 'Beto',
        apellidos: 'Bravo',
        fechaNacimiento: '2000-01-01',
        telefonoWhatsapp: '+584120000007',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        rachaDias: 2,
        rachaUltimaFecha: HOY_LOCAL,
        zonaHoraria: ZONA,
        deletedAtUtc: null,
        createdAtUtc: new Date('2026-01-07T10:00:00.000Z'),
      },
    ];

    mockSesiones = [
      {
        id: 'sesion-zoe-1',
        alumnoId: U_ZOE,
        rutinaId: null,
        fechaProgramada: '2026-02-10',
        fechaInicioUtc: new Date('2026-02-10T11:00:00.000Z'),
        fechaFinUtc: new Date('2026-02-10T12:00:00.000Z'),
        timezoneCliente: ZONA,
        estado: EstadoSesion.COMPLETADA,
      },
      {
        id: 'sesion-zoe-2',
        alumnoId: U_ZOE,
        rutinaId: null,
        fechaProgramada: '2026-03-15',
        fechaInicioUtc: new Date('2026-03-15T11:00:00.000Z'),
        fechaFinUtc: new Date(ISO_ZOE_MAX),
        timezoneCliente: ZONA,
        estado: EstadoSesion.COMPLETADA,
      },
      {
        // OMITIDA posterior al MAX completado: no debe contar para A2.
        id: 'sesion-zoe-3',
        alumnoId: U_ZOE,
        rutinaId: null,
        fechaProgramada: '2026-04-01',
        fechaInicioUtc: new Date('2026-04-01T11:00:00.000Z'),
        fechaFinUtc: new Date('2026-04-01T12:00:00.000Z'),
        timezoneCliente: ZONA,
        estado: EstadoSesion.OMITIDA,
      },
      {
        id: 'sesion-marta-1',
        alumnoId: U_MARTA,
        rutinaId: null,
        fechaProgramada: '2026-01-20',
        fechaInicioUtc: new Date('2026-01-20T11:00:00.000Z'),
        fechaFinUtc: new Date(ISO_MARTA_MAX),
        timezoneCliente: ZONA,
        estado: EstadoSesion.COMPLETADA,
      },
      {
        id: 'sesion-luis-1',
        alumnoId: U_LUIS,
        rutinaId: null,
        fechaProgramada: '2026-02-01',
        fechaInicioUtc: new Date('2026-02-01T11:00:00.000Z'),
        fechaFinUtc: new Date(ISO_LUIS_MAX),
        timezoneCliente: ZONA,
        estado: EstadoSesion.COMPLETADA,
      },
      {
        // Otro coach: A7 exige que no altere a Coach A.
        id: 'sesion-beto-1',
        alumnoId: U_BETO,
        rutinaId: null,
        fechaProgramada: '2026-05-01',
        fechaInicioUtc: new Date('2026-05-01T11:00:00.000Z'),
        fechaFinUtc: new Date('2026-05-01T12:00:00.000Z'),
        timezoneCliente: ZONA,
        estado: EstadoSesion.COMPLETADA,
      },
    ];

    mockPlanesMembresia = [];
    mockOverridesClientePlan = [];
    mockCuotasMembresia = [];
    mockTransaccionesPago = [];
    mockTasasCambioReferencia = [];

    const mockDb = createMockDb();
    alumnosService = new AlumnosService(mockDb, mockCryptoService);
    alumnosController = new AlumnosController(alumnosService);
  });

  // ===========================================================================
  // A1 · Sin ficha de salud en el listado (privacidad del directorio)
  // ===========================================================================
  describe('A1 · el listado no expone fichaSaludPrivada', () => {
    it('ningún item del listado tiene la propiedad, aun con ficha guardada', async () => {
      const res = await alumnosController.listarAlumnos(reqCoachA(), {});

      expect(res.items.length).toBeGreaterThan(0);
      for (const item of res.items) {
        expect(
          'fichaSaludPrivada' in (item as Record<string, unknown>),
          `el item ${item.id} no debe exponer fichaSaludPrivada`
        ).toBe(false);
      }
    });

    it('PRESERVE · GET /alumnos/:id del mismo coach la sigue devolviendo', async () => {
      const detalle = await alumnosController.obtenerPorId(reqCoachA(), P_ZOE);

      expect(detalle.fichaSaludPrivada).toBe('Asma controlada');
    });
  });

  // ===========================================================================
  // A2 · forma de ultimaSesionFecha (el valor vive en el E2E: el mock no evalúa SQL,
  // solo agregados `count`; aquí la expresión escalar da `null`)
  // ===========================================================================
  describe('A2 · forma de ultimaSesionFecha', () => {
    it('cada item tiene la propiedad y su valor es null o un string', async () => {
      const res = await alumnosController.listarAlumnos(reqCoachA(), { limit: 100, offset: 0 });

      expect(res.items.length).toBeGreaterThan(0);
      for (const item of res.items) {
        expect('ultimaSesionFecha' in (item as Record<string, unknown>)).toBe(true);
        const valor = (item as unknown as { ultimaSesionFecha: unknown }).ultimaSesionFecha;
        expect(valor === null || typeof valor === 'string').toBe(true);
      }
    });
  });

  // ===========================================================================
  // A3 · rachaDias efectiva + passthrough de rachaUltimaFecha
  // ===========================================================================
  describe('A3 · rachaDias efectiva', () => {
    it('vale racha_dias si racha_ultima_fecha es hoy o ayer (día local), else 0', async () => {
      const res = await alumnosController.listarAlumnos(reqCoachA(), { limit: 100, offset: 0 });
      const porId = new Map(res.items.map((item) => [item.id, item]));

      // Zoe: última fecha hoy → racha intacta (5).
      expect(porId.get(P_ZOE)?.rachaDias).toBe(5);
      // Marta: última fecha ayer → racha intacta (3).
      expect(porId.get(P_MARTA)?.rachaDias).toBe(3);
      // Ana: última fecha 2020-01-01 (vencida) → 0 aunque guarde 9.
      expect(porId.get(P_ANA)?.rachaDias).toBe(0);
      // Luis: sin última fecha → 0 aunque guarde 7.
      expect(porId.get(P_LUIS)?.rachaDias).toBe(0);
    });

    it('rachaUltimaFecha se devuelve tal cual (YYYY-MM-DD o null)', async () => {
      const res = await alumnosController.listarAlumnos(reqCoachA(), { limit: 100, offset: 0 });
      const porId = new Map(res.items.map((item) => [item.id, item]));

      expect(porId.get(P_ZOE)?.rachaUltimaFecha).toBe(HOY_LOCAL);
      expect(porId.get(P_MARTA)?.rachaUltimaFecha).toBe(AYER_LOCAL);
      expect(porId.get(P_ANA)?.rachaUltimaFecha).toBe('2020-01-01');
      expect(porId.get(P_LUIS)?.rachaUltimaFecha).toBeNull();
    });
  });

  // ===========================================================================
  // A4 · parámetro `orden`
  // ===========================================================================
  describe('A4 · parámetro orden (solo validación; el orden por valor vive en el E2E)', () => {
    it("sin enviar orden, el filtro trae 'alta_reciente' por defecto", () => {
      expect(ordenDe(parsear({}))).toBe('alta_reciente');
    });

    it('orden=foo devuelve 400', async () => {
      await expect(alumnosController.listarAlumnos(reqCoachA(), { orden: 'foo' })).rejects.toThrow(
        BadRequestException
      );
    });
  });

  // A5 vive en el E2E (`mis-alumnos-directorio-orden.e2e.spec.ts`): el mock ignora `orderBy`
  // y aplica `limit`/`offset` en inserción, así que paginar por orden solo pasa si producción
  // ordenara en JS después de paginar (prohibido por ADR-013).

  // A6 vive en el E2E (`mis-alumnos-directorio-orden.e2e.spec.ts`): misma razón que A5.

  // ===========================================================================
  // A7 · Aislamiento: sesiones de otro coach no contaminan
  // ===========================================================================
  describe('A7 · aislamiento por coach', () => {
    it('la sesión del otro coach no altera ultimaSesionFecha', async () => {
      const res = await alumnosController.listarAlumnos(reqCoachA(), { limit: 100, offset: 0 });

      // Beto (Coach B) entrenó el 2026-05-01, posterior a todo lo de Coach A.
      // El valor de `ultimaSesionFecha` vive en el E2E (el mock no evalúa SQL).
      expect(res.items.some((item) => item.id === P_BETO)).toBe(false);
    });

    // El orden `sin_entrenar` de A7 vive en el E2E: misma razón que A5.
  });
});
