import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Rol,
  EstadoAlumno,
  TipoDocumento,
  Modalidad,
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
  CobroDirectoInteligenteSchema,
  CobroDirectoSchema,
} from '@guachafit/shared';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { getTableName } from '@guachafit/database';

describe('Hardening QA: Alumnos, Expediente 360° y Cobro Directo Inteligente (Edge Cases & Resilience)', () => {
  // UUIDs válidos para los tests
  const COACH_A_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_B_ID = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_A1_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A1_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';
  const ALUMNO_A2_USER_ID = 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A2_PERFIL_ID = 'a2222222-2222-4222-8222-222222222222';
  const ALUMNO_B1_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ALUMNO_B1_PERFIL_ID = 'b1111111-1111-4111-8111-111111111111';
  const PLAN_COACH_A_ID = '99999999-9999-4999-8999-999999999999';
  const NON_EXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockPerfilesEntrenador: any[];
  let mockPlanesMembresia: any[];
  let mockOverridesClientePlan: any[];
  let mockCuotasMembresia: any[];
  let mockTransaccionesPago: any[];
  let mockTasasCambioReferencia: any[];

  let alumnosService: AlumnosService;
  let alumnosController: AlumnosController;
  let finanzasService: FinanzasService;
  let finanzasController: FinanzasController;

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
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                // WU24: las búsquedas `ilike` viajan dentro de un `or(...)` entre columnas
                // (nombre/apellido/correo/documento): son ALTERNATIVAS, no un AND. El resto de
                // filtros (eq/in/null/rango) se mantienen combinados con AND.
                const ilike = conditions.filter((cond) => cond.op === 'ilike');
                const resto = conditions.filter((cond) => cond.op !== 'ilike');
                filtered = filtered.filter(
                  (item) =>
                    resto.every((cond) => matchesField(item, cond)) &&
                    (ilike.length === 0 || ilike.some((cond) => matchesField(item, cond)))
                );
              }
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

  beforeEach(() => {
    mockUsuarios = [
      { id: COACH_A_ID, email: 'coach.a@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: COACH_B_ID, email: 'coach.b@guachafit.com', rol: Rol.ENTRENADOR, activo: true },
      { id: ALUMNO_A1_USER_ID, email: 'alumno.a1@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: ALUMNO_A2_USER_ID, email: 'alumno.a2@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: ALUMNO_B1_USER_ID, email: 'alumno.b1@guachafit.com', rol: Rol.ALUMNO, activo: true },
    ];

    mockPerfilesEntrenador = [
      { id: 'perfil-coach-a', usuarioId: COACH_A_ID, nombres: 'Carlos', apellidos: 'Coach A', tasaCambioGlobal: '65.0000' },
      { id: 'perfil-coach-b', usuarioId: COACH_B_ID, nombres: 'Bruno', apellidos: 'Coach B', tasaCambioGlobal: '65.0000' },
    ];

    mockPerfilesAlumno = [
      {
        id: ALUMNO_A1_PERFIL_ID,
        usuarioId: ALUMNO_A1_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '11111111',
        nombres: 'Alejandro',
        apellidos: 'Alvarez',
        fechaNacimiento: '1995-05-15',
        telefonoWhatsapp: '+584121111111',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: 'ENCRYPTED:Asma controlada',
        deletedAtUtc: null,
      },
      {
        id: ALUMNO_A2_PERFIL_ID,
        usuarioId: ALUMNO_A2_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '22222222',
        nombres: 'Andrea',
        apellidos: 'Acosta',
        fechaNacimiento: '1998-10-20',
        telefonoWhatsapp: '+584122222222',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        fichaSaludPrivada: null,
        deletedAtUtc: '2026-01-10T12:00:00.000Z',
      },
      {
        id: ALUMNO_B1_PERFIL_ID,
        usuarioId: ALUMNO_B1_USER_ID,
        entrenadorId: COACH_B_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '33333333',
        nombres: 'Beatriz',
        apellidos: 'Blanco',
        fechaNacimiento: '2000-01-01',
        telefonoWhatsapp: '+584123333333',
        modalidad: Modalidad.HIBRIDO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        deletedAtUtc: null,
      },
    ];

    mockPlanesMembresia = [
      {
        id: PLAN_COACH_A_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Plan Full Presencial',
        precioBaseUsd: '45.00',
        duracionMeses: 1,
        activo: true,
      },
    ];

    mockOverridesClientePlan = [];
    mockCuotasMembresia = [];
    mockTransaccionesPago = [];
    mockTasasCambioReferencia = [];

    const mockDb = createMockDb();
    alumnosService = new AlumnosService(mockDb, mockCryptoService);
    alumnosController = new AlumnosController(alumnosService);

    const mockNotificaciones = { despacharEvento: vi.fn().mockResolvedValue(undefined) } as any;
    const mockR2 = { getPresignedGetUrl: vi.fn().mockResolvedValue('https://r2.mock.url') } as any;
    finanzasService = new FinanzasService(mockDb, mockNotificaciones, mockR2);
    finanzasController = new FinanzasController(finanzasService);
  });

  // ===========================================================================
  // SECCIÓN 1: Directorio y Búsqueda de Alumnos (GET /alumnos)
  // ===========================================================================
  describe('1. Directorio y Búsqueda de Alumnos (GET /alumnos & FiltroDirectorioAlumnosSchema)', () => {
    it('1.1 debe rechazar búsquedas con longitudes extremas (>200 caracteres) con error 400 Zod', () => {
      const longQuery = 'A'.repeat(501);
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ busqueda: longQuery })
      ).toThrow();
    });

    it('1.2 debe procesar cadenas con inyección SQL o XSS sin romper ni ejecutar scripts', async () => {
      const maliciousSearch = "<script>alert('xss')</script>' OR '1'='1";
      const parsed = FiltroDirectorioAlumnosSchema.parse({ busqueda: maliciousSearch });
      expect(parsed.busqueda).toBe(maliciousSearch);

      // Ejecutar en el servicio: debe filtrar sin excepción 500 y retornar 0 resultados
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const resultados = await alumnosController.listarAlumnos(req, parsed);
      expect(Array.isArray(resultados.items)).toBe(true);
      expect(resultados.items.length).toBe(0);
    });

    it('1.3 debe rechazar filtros de estado inválidos (ej. estado=HACKER) con error de validación', () => {
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ estado: 'HACKER' })
      ).toThrow();
    });

    it('1.4 debe rechazar filtros de modalidad inválidos (ej. modalidad=TELEPATICO)', () => {
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ modalidad: 'TELEPATICO' })
      ).toThrow();
    });

    it('1.5 debe coercer correctamente incluirArchivados válidos y rechazar valores no booleanos', () => {
      // Coerción válida
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: true }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'true' }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: '1' }).incluirArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: false }).incluirArchivados).toBe(false);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'false' }).incluirArchivados).toBe(false);
      expect(FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: '0' }).incluirArchivados).toBe(false);

      // Valores basura deben fallar Zod
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'not_a_boolean' })
      ).toThrow();
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'hacker' })
      ).toThrow();
    });

    it('1.6 debe validar límites y offsets numéricos (rechazar negativos y disparatados)', () => {
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: -5 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: 0 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ limit: 500 })).toThrow();
      expect(() => FiltroDirectorioAlumnosSchema.parse({ offset: -1 })).toThrow();

      // Válidos coercidos
      const valid = FiltroDirectorioAlumnosSchema.parse({ limit: '20', offset: '5' });
      expect(valid.limit).toBe(20);
      expect(valid.offset).toBe(5);
    });

    it('1.7 Aislamiento Multi-inquilino: Entrenador A jamás debe ver los alumnos del Entrenador B', async () => {
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const reqCoachB = { user: { sub: COACH_B_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_B_ID } };

      const alumnosCoachA = await alumnosController.listarAlumnos(reqCoachA, {});
      const alumnosCoachB = await alumnosController.listarAlumnos(reqCoachB, {});

      // Coach A ve únicamente a Alejandro (y no a Andrea que está archivada por defecto)
      expect(alumnosCoachA.items.every((a) => a.entrenadorId === COACH_A_ID)).toBe(true);
      expect(alumnosCoachA.items.some((a) => a.id === ALUMNO_B1_PERFIL_ID)).toBe(false);

      // Coach B ve únicamente a Beatriz
      expect(alumnosCoachB.items.every((a) => a.entrenadorId === COACH_B_ID)).toBe(true);
      expect(alumnosCoachB.items.some((a) => a.id === ALUMNO_A1_PERFIL_ID)).toBe(false);
    });

    it('1.8 WU19: devuelve { items, total, limit, offset, resumen } con la cartera completa', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const filtro = FiltroDirectorioAlumnosSchema.parse({
        incluirArchivados: 'true',
        limit: '100',
        offset: '0',
      });

      const res = await alumnosController.listarAlumnos(req, filtro);

      expect(res.limit).toBe(100);
      expect(res.offset).toBe(0);
      // Cartera completa: Alejandro (vigente, presencial) + Andrea (archivada, pausada, remota).
      expect(res.total).toBe(2);
      expect(res.items.map((a) => a.id).sort()).toEqual(
        [ALUMNO_A1_PERFIL_ID, ALUMNO_A2_PERFIL_ID].sort()
      );
      expect(res.resumen).toEqual({
        total: 2,
        activos: 1,
        // Andrea está archivada: no suma a pausados/remotos (igual que los KPIs de la UI).
        pausados: 0,
        morosos: 0,
        presenciales: 1,
        remotos: 0,
        archivados: 1,
      });
    });

    it('1.9 WU19: pagina con offset/limit y el total refleja la consulta completa', async () => {
      for (let i = 0; i < 3; i++) {
        mockPerfilesAlumno.push({
          id: `perfil-extra-${i}`,
          usuarioId: `usuario-extra-${i}`,
          entrenadorId: COACH_A_ID,
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: `9000000${i}`,
          nombres: `Extra${i}`,
          apellidos: 'Paginado',
          fechaNacimiento: '1990-01-01',
          telefonoWhatsapp: `+58412000000${i}`,
          modalidad: Modalidad.PRESENCIAL,
          estadoActivacion: EstadoAlumno.ACTIVO,
          fichaSaludPrivada: null,
          deletedAtUtc: null,
        });
      }

      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const pagina1 = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ limit: '2', offset: '1' })
      );
      const pagina2 = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ limit: '2', offset: '3' })
      );

      // 4 vigentes (Alejandro + 3 extra); Andrea queda fuera por archivada.
      expect(pagina1.total).toBe(4);
      expect(pagina1.limit).toBe(2);
      expect(pagina1.offset).toBe(1);
      expect(pagina1.items).toHaveLength(2);

      expect(pagina2.total).toBe(4);
      expect(pagina2.offset).toBe(3);
      expect(pagina2.items).toHaveLength(1);

      // Sin solapes entre páginas y sin perder filas.
      const idsPagina1 = pagina1.items.map((a) => a.id);
      const idsPagina2 = pagina2.items.map((a) => a.id);
      expect(idsPagina1.filter((id) => idsPagina2.includes(id))).toEqual([]);
      expect(new Set([...idsPagina1, ...idsPagina2]).size).toBe(3);
    });

    it('1.10 WU19: resumen cuenta morosos con cuota vencida (misma regla del dashboard)', async () => {
      mockCuotasMembresia.push(
        {
          id: 'cuota-vencida-a1',
          clienteId: ALUMNO_A1_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-08',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '45.00',
          fechaEmisionUtc: new Date('2026-08-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-08-31T00:00:00Z'),
          estado: EstadoCuota.VENCIDA,
        },
        {
          id: 'cuota-al-dia-b1',
          clienteId: ALUMNO_B1_USER_ID,
          entrenadorId: COACH_B_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-09',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '45.00',
          saldoPendienteUsd: '0.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(),
          estado: EstadoCuota.AL_DIA,
        }
      );

      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ incluirArchivados: 'true' })
      );

      // Solo la cuota vencida del alumno de Coach A cuenta; la de otro coach y la AL_DIA no.
      expect(res.resumen.morosos).toBe(1);
    });

    it('1.11 WU23: hidrata semaforoPago por fila (moroso / al día / sin cuota) y coincide con el KPI', async () => {
      // Alumno extra al día: cuota vigente, corte futuro y sin saldo pendiente.
      const ALUMNO_A3_USER_ID = 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa';
      const ALUMNO_A3_PERFIL_ID = 'a3333333-3333-4333-8333-333333333333';
      mockUsuarios.push({
        id: ALUMNO_A3_USER_ID,
        email: 'alumno.a3@guachafit.com',
        rol: Rol.ALUMNO,
        activo: true,
      });
      mockPerfilesAlumno.push({
        id: ALUMNO_A3_PERFIL_ID,
        usuarioId: ALUMNO_A3_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '44444444',
        nombres: 'Alba',
        apellidos: 'AlDía',
        fechaNacimiento: '1996-03-03',
        telefonoWhatsapp: '+584124444444',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        deletedAtUtc: null,
      });

      // Alumno extra sin cuota: no tiene ningún registro en cuotas_membresia.
      const ALUMNO_A4_USER_ID = 'aaaaaaaa-dddd-4aaa-8aaa-aaaaaaaaaaaa';
      const ALUMNO_A4_PERFIL_ID = 'a4444444-4444-4444-8444-444444444444';
      mockUsuarios.push({
        id: ALUMNO_A4_USER_ID,
        email: 'alumno.a4@guachafit.com',
        rol: Rol.ALUMNO,
        activo: true,
      });
      mockPerfilesAlumno.push({
        id: ALUMNO_A4_PERFIL_ID,
        usuarioId: ALUMNO_A4_USER_ID,
        entrenadorId: COACH_A_ID,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '55555555',
        nombres: 'Sina',
        apellidos: 'SinCuota',
        fechaNacimiento: '1997-07-07',
        telefonoWhatsapp: '+584125555555',
        modalidad: Modalidad.REMOTO,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada: null,
        deletedAtUtc: null,
      });

      mockCuotasMembresia.push(
        {
          id: 'cuota-vencida-a1-wu23',
          clienteId: ALUMNO_A1_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-08',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '45.00',
          fechaEmisionUtc: new Date('2026-08-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-08-31T00:00:00Z'),
          estado: EstadoCuota.VENCIDA,
        },
        {
          id: 'cuota-vigente-a3-wu23',
          clienteId: ALUMNO_A3_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-10',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '45.00',
          saldoPendienteUsd: '0.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          estado: EstadoCuota.PENDIENTE,
        }
      );

      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ limit: '100' })
      );

      const semaforoPorPerfil = new Map(res.items.map((a) => [a.id, a.semaforoPago]));
      expect(semaforoPorPerfil.get(ALUMNO_A1_PERFIL_ID)).toBe('moroso');
      expect(semaforoPorPerfil.get(ALUMNO_A3_PERFIL_ID)).toBe('al_dia');
      expect(semaforoPorPerfil.get(ALUMNO_A4_PERFIL_ID)).toBe('sin_cuota');
      // Andrea (archivada) queda fuera por el filtro por defecto, pero su perfil no aporta mora.
      expect(semaforoPorPerfil.has(ALUMNO_A2_PERFIL_ID)).toBe(false);

      // La pestaña "En Mora" (filtro cliente por semáforo) y el KPI del servidor cuentan lo mismo.
      expect(res.resumen.morosos).toBe(1);
      expect(res.items.filter((a) => a.semaforoPago === 'moroso')).toHaveLength(
        res.resumen.morosos
      );
    });

    it('1.12 WU24: q busca server-side por nombre/apellido con ILIKE y ajusta el total', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: 'alejandro' })
      );

      expect(res.total).toBe(1);
      expect(res.items.map((a) => a.id)).toEqual([ALUMNO_A1_PERFIL_ID]);
      // La búsqueda NO altera el resumen de la cartera completa.
      expect(res.resumen.total).toBe(2);
      expect(res.resumen.archivados).toBe(1);
    });

    it('1.13 WU24: q busca por número de documento y sin coincidencias devuelve total 0', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

      const porDocumento = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: '11111111' })
      );
      expect(porDocumento.total).toBe(1);
      expect(porDocumento.items[0].id).toBe(ALUMNO_A1_PERFIL_ID);

      const sinCoincidencias = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: 'zzz-no-existe' })
      );
      expect(sinCoincidencias.total).toBe(0);
      expect(sinCoincidencias.items).toEqual([]);
    });

    it('1.14 WU24: q vacío o en blanco equivale a sin filtro (mismo total que la consulta base)', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

      const base = await alumnosController.listarAlumnos(req, {});
      const qVacio = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: '' })
      );
      const qEspacios = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: '   ' })
      );

      expect(qVacio.total).toBe(base.total);
      expect(qEspacios.total).toBe(base.total);
      expect(qVacio.items.map((a) => a.id).sort()).toEqual(base.items.map((a) => a.id).sort());
    });

    it('1.15 WU24: q tiene prioridad sobre el alias legado busqueda y respeta el máximo de 200', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

      const res = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: 'Alejandro', busqueda: 'Beatriz' })
      );
      expect(res.items.map((a) => a.id)).toEqual([ALUMNO_A1_PERFIL_ID]);

      expect(() => FiltroDirectorioAlumnosSchema.parse({ q: 'A'.repeat(201) })).toThrow();
      // El escape de `%`/`_`/`\` trata el texto como literal: `%` no funciona como comodín.
      const comodinLiteral = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ q: '%' })
      );
      expect(comodinLiteral.total).toBe(0);
    });

    it('1.16 WU25a: soloArchivados devuelve SOLO las bajas lógicas y no altera el resumen', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

      const res = await alumnosController.listarAlumnos(
        req,
        FiltroDirectorioAlumnosSchema.parse({ soloArchivados: 'true' })
      );

      expect(res.total).toBe(1);
      expect(res.items.map((a) => a.id)).toEqual([ALUMNO_A2_PERFIL_ID]);
      expect(res.items[0].deletedAtUtc).not.toBeNull();
      // El resumen sigue describiendo la cartera completa.
      expect(res.resumen.total).toBe(2);
      expect(res.resumen.archivados).toBe(1);
      expect(res.resumen.activos).toBe(1);
    });

    it('1.17 WU25a: semaforoPago filtra server-side con la misma regla del resumen (moroso/al_dia/sin_cuota)', async () => {
      // Alumno A3 con cuota vigente (al día) y A4 sin ninguna cuota.
      const ALUMNO_A3_USER_ID = 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa';
      const ALUMNO_A3_PERFIL_ID = 'a3333333-3333-4333-8333-333333333333';
      const ALUMNO_A4_USER_ID = 'aaaaaaaa-dddd-4aaa-8aaa-aaaaaaaaaaaa';
      const ALUMNO_A4_PERFIL_ID = 'a4444444-4444-4444-8444-444444444444';

      for (const [userId, perfilId, nombres] of [
        [ALUMNO_A3_USER_ID, ALUMNO_A3_PERFIL_ID, 'Alba'],
        [ALUMNO_A4_USER_ID, ALUMNO_A4_PERFIL_ID, 'Sina'],
      ] as const) {
        mockUsuarios.push({ id: userId, email: `${nombres.toLowerCase()}@guachafit.com`, rol: Rol.ALUMNO, activo: true });
        mockPerfilesAlumno.push({
          id: perfilId,
          usuarioId: userId,
          entrenadorId: COACH_A_ID,
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: `7777777${nombres.length}`,
          nombres,
          apellidos: 'Prueba',
          fechaNacimiento: '1995-01-01',
          telefonoWhatsapp: '+584127777777',
          modalidad: Modalidad.PRESENCIAL,
          estadoActivacion: EstadoAlumno.ACTIVO,
          fichaSaludPrivada: null,
          deletedAtUtc: null,
        });
      }

      mockCuotasMembresia.push(
        {
          id: 'cuota-vencida-wu25a',
          clienteId: ALUMNO_A1_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-08',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '45.00',
          fechaEmisionUtc: new Date('2026-08-01T00:00:00Z'),
          fechaCorteUtc: new Date('2026-08-31T00:00:00Z'),
          estado: EstadoCuota.VENCIDA,
        },
        {
          id: 'cuota-vigente-wu25a',
          clienteId: ALUMNO_A3_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-10',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '45.00',
          saldoPendienteUsd: '0.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          estado: EstadoCuota.PENDIENTE,
        }
      );

      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const listar = (semaforoPago: 'moroso' | 'al_dia' | 'sin_cuota') =>
        alumnosController.listarAlumnos(req, FiltroDirectorioAlumnosSchema.parse({ semaforoPago }));

      const morosos = await listar('moroso');
      expect(morosos.items.map((a) => a.id)).toEqual([ALUMNO_A1_PERFIL_ID]);
      expect(morosos.total).toBe(morosos.resumen.morosos); // la pestaña y el KPI cuentan igual
      expect(morosos.items[0].semaforoPago).toBe('moroso');

      const alDia = await listar('al_dia');
      expect(alDia.items.map((a) => a.id)).toEqual([ALUMNO_A3_PERFIL_ID]);
      expect(alDia.items[0].semaforoPago).toBe('al_dia');

      const sinCuota = await listar('sin_cuota');
      expect(sinCuota.items.map((a) => a.id)).toEqual([ALUMNO_A4_PERFIL_ID]);
      expect(sinCuota.items[0].semaforoPago).toBe('sin_cuota');
    });

    it('1.18 WU25a: el schema valida los filtros nuevos (soloArchivados coercible, semaforoPago sin por_vencer)', () => {
      expect(FiltroDirectorioAlumnosSchema.parse({ soloArchivados: '1' }).soloArchivados).toBe(true);
      expect(FiltroDirectorioAlumnosSchema.parse({ soloArchivados: 'false' }).soloArchivados).toBe(false);
      expect(() =>
        FiltroDirectorioAlumnosSchema.parse({ soloArchivados: 'quizas' })
      ).toThrow();

      // `por_vencer` no se acepta: el servidor nunca lo produce al hidratar el semáforo.
      expect(FiltroDirectorioAlumnosSchema.parse({ semaforoPago: 'moroso' }).semaforoPago).toBe('moroso');
      expect(() => FiltroDirectorioAlumnosSchema.parse({ semaforoPago: 'por_vencer' })).toThrow();
    });

    it('1.19 WU25a: semaforoPago sin coincidencias devuelve total 0 sin romper la consulta', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const listar = (semaforoPago: 'moroso' | 'sin_cuota') =>
        alumnosController.listarAlumnos(req, FiltroDirectorioAlumnosSchema.parse({ semaforoPago }));

      // Nadie tiene cuotas registradas: no hay morosos (el `IN` sin candidatos no rompe el SQL).
      const sinMorosos = await listar('moroso');
      expect(sinMorosos.total).toBe(0);
      expect(sinMorosos.items).toEqual([]);
      expect(sinMorosos.resumen.total).toBe(2); // el resumen sigue siendo de la cartera completa

      // Sin ninguna cuota en el tenant, todos los vigentes quedan "sin cuota".
      const sinCuota = await listar('sin_cuota');
      expect(sinCuota.items.map((a) => a.id)).toEqual([ALUMNO_A1_PERFIL_ID]);
      expect(sinCuota.items[0].semaforoPago).toBe('sin_cuota');
    });
  });

  // ===========================================================================
  // SECCIÓN 2: Ciclo de Vida y Restauración (PATCH /alumnos/:id/restaurar)
  // ===========================================================================
  describe('2. Ciclo de Vida y Restauración (PATCH /alumnos/:id/restaurar & RestaurarAlumnoSchema)', () => {
    it('2.1 debe arrojar BadRequestException (400) ante un ID malformado (no UUID)', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(req, '123-abc-no-uuid', {})
      ).rejects.toThrow(BadRequestException);
    });

    it('2.2 debe arrojar NotFoundException (404) ante un UUID inexistente', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(req, NON_EXISTENT_UUID, {})
      ).rejects.toThrow(NotFoundException);
    });

    it('2.3 debe arrojar ForbiddenException (403) si un entrenador intenta restaurar un alumno ajeno', async () => {
      // Coach A intenta restaurar a Beatriz (pertenece a Coach B)
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.restaurarAlumno(reqCoachA, ALUMNO_B1_PERFIL_ID, {})
      ).rejects.toThrow(ForbiddenException);
    });

    it('2.4 debe ser idempotente al restaurar un alumno que ya está activo', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.restaurarAlumno(req, ALUMNO_A1_PERFIL_ID, {
        motivo: 'Intento de restauración duplicada',
      });

      expect(res.id).toBe(ALUMNO_A1_PERFIL_ID);
      expect(res.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(res.mensaje).toContain('ya se encuentra activo');
    });

    it('2.5 debe restaurar exitosamente un alumno archivado y limpiar deletedAtUtc', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const res = await alumnosController.restaurarAlumno(req, ALUMNO_A2_PERFIL_ID, {
        motivo: 'Regreso de viaje de estudios',
      });

      expect(res.id).toBe(ALUMNO_A2_PERFIL_ID);
      expect(res.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(res.deletedAtUtc).toBeNull();
      expect(res.mensaje).toContain('restaurado exitosamente');
    });

    it('2.6 debe validar RestaurarAlumnoSchema: motivos vacíos aceptados, motivos gigantescos (5000+ chars) rechazados', () => {
      // Vacío o undefined es válido
      expect(RestaurarAlumnoSchema.parse({}).motivo).toBeUndefined();
      expect(RestaurarAlumnoSchema.parse({ motivo: '' }).motivo).toBe('');
      expect(RestaurarAlumnoSchema.parse({ motivo: '  Regreso  ' }).motivo).toBe('Regreso');

      // 5000+ caracteres rechazado con ZodError
      expect(() =>
        RestaurarAlumnoSchema.parse({ motivo: 'X'.repeat(5001) })
      ).toThrow();
    });
  });

  // ===========================================================================
  // SECCIÓN 3: Expediente 360° y Consulta de Alumno (GET /alumnos/:id)
  // ===========================================================================
  describe('3. Expediente 360° y Consulta de Alumno (GET /alumnos/:id)', () => {
    it('3.1 debe rechazar IDs no UUID con BadRequestException (400)', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(req, 'not-a-uuid')
      ).rejects.toThrow(BadRequestException);
    });

    it('3.2 debe arrojar NotFoundException ante un UUID que no existe', async () => {
      const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(req, NON_EXISTENT_UUID)
      ).rejects.toThrow(NotFoundException);
    });

    it('3.3 Aislamiento Tenant: Entrenador no puede consultar el expediente de un alumno ajeno', async () => {
      const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      await expect(
        alumnosController.obtenerPorId(reqCoachA, ALUMNO_B1_PERFIL_ID)
      ).rejects.toThrow(ForbiddenException);
    });

    it('3.4 Protección de Ficha Médica: Alumno no puede ver la ficha de salud privada pero el coach sí', async () => {
      const reqCoach = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };
      const reqAlumno = { user: { sub: ALUMNO_A1_USER_ID, rol: Rol.ALUMNO, entrenadorId: COACH_A_ID } };

      const perfilParaCoach = await alumnosController.obtenerPorId(reqCoach, ALUMNO_A1_PERFIL_ID);
      expect(perfilParaCoach.fichaSaludPrivada).toBe('Asma controlada');

      const perfilParaAlumno = await alumnosController.obtenerPorId(reqAlumno, ALUMNO_A1_PERFIL_ID);
      expect(perfilParaAlumno.fichaSaludPrivada).toBeNull();
    });
  });

  // ===========================================================================
  // SECCIÓN 4: Cobro Directo Inteligente e Historial Financiero
  // ===========================================================================
  describe('4. Cobro Directo Inteligente e Historial Financiero', () => {
    describe('4.1 Validación de Esquema CobroDirectoInteligenteSchema', () => {
      it('debe rechazar montos negativos (-20.00)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '-20.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos en cero (0.00)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '0.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos no numéricos ("gratis")', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: 'gratis',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar montos disparatados (>100,000)', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '999999.00',
            monedaOriginal: Moneda.USD,
          })
        ).toThrow();
      });

      it('debe rechazar métodos de pago inexistentes ("BITCOIN_FALSO")', () => {
        expect(() =>
          CobroDirectoInteligenteSchema.parse({
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
            metodoPago: 'BITCOIN_FALSO',
          })
        ).toThrow();
      });

      it('debe aceptar payload válido con valores por defecto', () => {
        const parsed = CobroDirectoInteligenteSchema.parse({
          montoOriginal: '50.00',
          monedaOriginal: Moneda.USD,
        });
        expect(parsed.montoOriginal).toBe('50.00');
        expect(parsed.metodoPago).toBe(MetodoPago.EFECTIVO_USD);
        expect(parsed.fechaOperacion).toBeDefined();
      });
    });

    describe('4.2 Endpoints Financieros: Edge Cases & Seguridad', () => {
      beforeEach(() => {
        mockOverridesClientePlan = [];
        mockCuotasMembresia = [];
        mockTransaccionesPago = [];
      });

      it('debe arrojar BadRequestException (400) si el clienteId en el endpoint es no-UUID', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.obtenerHistorialCliente(req, 'invalido-no-uuid')
        ).rejects.toThrow(BadRequestException);

        await expect(
          finanzasController.cobroDirectoInteligente(req, 'invalido-no-uuid', {
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('debe arrojar NotFoundException (404) si el alumno no existe', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.obtenerHistorialCliente(req, NON_EXISTENT_UUID)
        ).rejects.toThrow(NotFoundException);

        await expect(
          finanzasController.cobroDirectoInteligente(req, NON_EXISTENT_UUID, {
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(NotFoundException);
      });

      it('Aislamiento Multi-inquilino: Entrenador no puede consultar ni cobrar a alumno de otro entrenador', async () => {
        const reqCoachA = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        // Coach A intentando acceder a Beatriz (Coach B)
        await expect(
          finanzasController.obtenerHistorialCliente(reqCoachA, ALUMNO_B1_PERFIL_ID)
        ).rejects.toThrow(ForbiddenException);

        await expect(
          finanzasController.cobroDirectoInteligente(reqCoachA, ALUMNO_B1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(ForbiddenException);
      });

      it('debe arrojar BadRequestException (400) si el alumno no tiene cuota abierta previa ni plan asignado', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        // Alejandro no tiene cuotas emitidas ni override en overridesClientePlan
        await expect(
          finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('debe rechazar métodos no en efectivo en cobro directo en sala', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        await expect(
          finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
            montoOriginal: '45.00',
            monedaOriginal: Moneda.USD,
            metodoPago: MetodoPago.PAGO_MOVIL,
          })
        ).rejects.toThrow(BadRequestException);
      });

      it('Historial de cliente nuevo sin transacciones debe retornar arrays vacíos estructurados sin romper', async () => {
        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const historial = await finanzasController.obtenerHistorialCliente(req, ALUMNO_A1_PERFIL_ID);

        expect(historial.alumnoId).toBe(ALUMNO_A1_PERFIL_ID);
        expect(historial.usuarioId).toBe(ALUMNO_A1_USER_ID);
        expect(historial.saldoPendienteTotalUsd).toBe('0.00');
        expect(historial.totalPagadoHistoricoUsd).toBe('0.00');
        expect(historial.totalPagadoMesActualUsd).toBe('0.00');
        expect(historial.cuotaMesActual).toBeNull();
        expect(Array.isArray(historial.transacciones)).toBe(true);
        expect(historial.transacciones.length).toBe(0);
      });

      it('debe ejecutar exitosamente el cobro directo inteligente cuando el alumno tiene un plan asignado (override)', async () => {
        // Asignar plan al alumno mediante override
        mockOverridesClientePlan.push({
          id: 'override-1',
          planId: PLAN_COACH_A_ID,
          clienteId: ALUMNO_A1_USER_ID,
          precioAcordadoUsd: '45.00',
        });

        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const resultado = await finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
          montoOriginal: '45.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
          notas: 'Cobro directo presencial primer mes',
        });

        expect(resultado.transaccion).toBeDefined();
        expect(resultado.transaccion.montoOriginal).toBe('45.00');
        expect(resultado.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
        expect(resultado.cuota).toBeDefined();
        expect(resultado.cuota.estado).toBe(EstadoCuota.AL_DIA);
        expect(resultado.cuota.saldoPendienteUsd).toBe('0.00');
      });

      it('debe liquidar directamente una cuota abierta existente cuando el alumno ya tiene deuda pendiente', async () => {
        // Crear una cuota emitida existente para Alejandro
        const cuotaExistenteId = 'cuota-existente-1';
        mockCuotasMembresia.push({
          id: cuotaExistenteId,
          clienteId: ALUMNO_A1_USER_ID,
          entrenadorId: COACH_A_ID,
          planId: PLAN_COACH_A_ID,
          periodo: '2026-09',
          montoTotalUsd: '45.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '45.00',
          fechaEmisionUtc: new Date(),
          fechaCorteUtc: new Date(Date.now() + 15 * 24 * 3600 * 1000),
          estado: EstadoCuota.EMITIDA,
        });

        const req = { user: { sub: COACH_A_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_A_ID } };

        const resultado = await finanzasController.cobroDirectoInteligente(req, ALUMNO_A1_PERFIL_ID, {
          montoOriginal: '45.00',
          monedaOriginal: Moneda.USD,
          metodoPago: MetodoPago.EFECTIVO_USD,
        });

        expect(resultado.cuota.id).toBe(cuotaExistenteId);
        expect(resultado.cuota.estado).toBe(EstadoCuota.AL_DIA);
        expect(resultado.cuota.saldoPendienteUsd).toBe('0.00');
        expect(resultado.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      });
    });
  });
});
