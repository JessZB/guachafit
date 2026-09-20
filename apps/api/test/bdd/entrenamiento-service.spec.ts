import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  EntrenamientoService,
  evaluarAdherenciaSemanal,
  calcularDuracionMinutos,
  evaluarCumplimientoRachaPorVolumen,
  calcularRachaEfectiva,
  actualizarRacha,
  calcularVentanaSemana,
} from '../../src/modules/entrenamiento/entrenamiento.service';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import {
  Rol,
  EstadoSesion,
  SemaforoAdherencia,
  EstadoAlumno,
} from '@guachafit/shared';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';

describe('Módulo 3: Sesiones de Entrenamiento (EntrenamientoService & EntrenamientoController)', () => {
  let entrenamientoService: EntrenamientoService;
  let entrenamientoController: EntrenamientoController;
  let mockDb: any;
  let mockDispatcher: any;
  /**
   * RNF-003/ADR-009: `rutinas` tiene RLS; el envoltorio transaccional se inyecta.
   * En tests es passthrough: ejecuta el callback con el mismo mock in-memory.
   */
  let withTenantMock: any;

  // In-memory data store for the mock database
  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockEjerciciosCatalogo: any[];
  let mockSesionesEntrenamiento: any[];
  let mockEjerciciosSesion: any[];
  let mockSeriesRegistro: any[];
  let mockRutinas: any[];

  function isSqlSyntaxChunk(c: any): boolean {
    if (!c || !('value' in c)) return true;
    if (Array.isArray(c.value) && typeof c.value[0] === 'string') {
      const val = c.value[0].toLowerCase().trim();
      if (val === '') return true;
      if (
        /^[=><\s,()]+$/.test(val) ||
        val.includes('in') ||
        val.includes('and') ||
        val.includes('or') ||
        val.includes('null') ||
        val.includes(',')
      ) {
        return true;
      }
    }
    return false;
  }

  function getParamsFrom(item: any): any[] {
    if (!item) return [];
    // Drizzle incrusta arrays crudos (ej. inArray con un solo valor): hay que aplanarlos.
    if (Array.isArray(item)) return item.flatMap(getParamsFrom);
    if (item.queryChunks && Array.isArray(item.queryChunks)) {
      return item.queryChunks.flatMap(getParamsFrom);
    }
    if ('value' in item && item.value !== undefined && !isSqlSyntaxChunk(item)) {
      return Array.isArray(item.value) ? item.value : [item.value];
    }
    return [];
  }

  type OperadorSql = '>=' | '<=' | '>' | '<' | '=' | '<>' | 'in' | 'is null' | 'is not null';

  function detectarOperador(chunks: any[]): OperadorSql | undefined {
    const tokens = chunks
      .filter((c) => c && Array.isArray(c.value))
      .flatMap((c) => c.value)
      .filter((v: any) => typeof v === 'string')
      .map((v: string) => v.trim().toLowerCase());
    return tokens.find((t: string) =>
      ['>=', '<=', '>', '<', '=', '<>', 'in', 'is null', 'is not null'].includes(t)
    ) as OperadorSql | undefined;
  }

  function compararValores(a: any, b: any): number {
    const normalizar = (v: any): any => {
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).getTime();
      return v;
    };
    const va = normalizar(a);
    const vb = normalizar(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return va < vb ? -1 : va > vb ? 1 : 0;
  }

  function extractConditions(sqlObj: any): Array<{
    column: string;
    value: any;
    op?: OperadorSql;
    isIn?: boolean;
    isNull?: boolean;
    isNotNull?: boolean;
  }> {
    const conditions: Array<{
      column: string;
      value: any;
      op?: OperadorSql;
      isIn?: boolean;
      isNull?: boolean;
      isNotNull?: boolean;
    }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          const op = detectarOperador(subsequent);
          const hasIn = op === 'in';
          const hasNull = op === 'is null';
          const hasNotNull = op === 'is not null';

          const params = subsequent.flatMap(getParamsFrom);

          if (hasNull) {
            conditions.push({ column: chunk.name, value: null, op, isNull: true });
          } else if (hasNotNull) {
            conditions.push({ column: chunk.name, value: null, op, isNotNull: true });
          } else if (hasIn || params.length > 1) {
            conditions.push({ column: chunk.name, value: params, op, isIn: true });
          } else if (params.length === 1) {
            conditions.push({ column: chunk.name, value: params[0], op });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(
    record: any,
    cond: {
      column: string;
      value: any;
      op?: OperadorSql;
      isIn?: boolean;
      isNull?: boolean;
      isNotNull?: boolean;
    }
  ): boolean {
    const colVal =
      record[cond.column] !== undefined
        ? record[cond.column]
        : record[cond.column.replace(/_([a-z])/g, (_, l) => l.toUpperCase())];

    if (cond.isNull) {
      return colVal === null || colVal === undefined;
    }
    if (cond.isNotNull) {
      return colVal !== null && colVal !== undefined;
    }
    if (cond.isIn && Array.isArray(cond.value)) {
      return cond.value.includes(colVal);
    }

    switch (cond.op) {
      case '>=':
        return compararValores(colVal, cond.value) >= 0;
      case '<=':
        return compararValores(colVal, cond.value) <= 0;
      case '>':
        return compararValores(colVal, cond.value) > 0;
      case '<':
        return compararValores(colVal, cond.value) < 0;
      case '<>':
        return colVal !== cond.value;
      default:
        return colVal === cond.value;
    }
  }

  function normalizeRecord(item: any): any {
    if (!item) return item;
    if (!item.createdAtUtc) item.createdAtUtc = new Date();
    if (!item.updatedAtUtc) item.updatedAtUtc = new Date();
    return item;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'ejercicios_catalogo') return mockEjerciciosCatalogo;
    if (tableName === 'sesiones_entrenamiento') return mockSesionesEntrenamiento;
    if (tableName === 'ejercicios_sesion') return mockEjerciciosSesion;
    if (tableName === 'series_registro') return mockSeriesRegistro;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'rutinas') return mockRutinas;
    if (tableName === 'usuarios') return mockUsuarios;
    return [];
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const baseData = getTableArray(tableName);
          let filtered = baseData.map(normalizeRecord);

          const queryObj: any = {
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              if (conditions.length > 0) {
                // Agrupar por columna: igualdad/inArray son alternativas (OR) dentro de la
                // misma columna; los operadores de rango (>=, <=) se combinan con AND.
                const conditionsByCol = new Map<string, any[]>();
                for (const cond of conditions) {
                  if (!conditionsByCol.has(cond.column)) {
                    conditionsByCol.set(cond.column, []);
                  }
                  conditionsByCol.get(cond.column)!.push(cond);
                }

                filtered = filtered.filter((item) => {
                  for (const [_, colConds] of conditionsByCol.entries()) {
                    // Sólo los operadores de rango se combinan con AND dentro de la misma columna;
                    // igualdad/inArray/null representan alternativas (OR).
                    const esRango = (op?: OperadorSql) =>
                      op === '>=' || op === '<=' || op === '>' || op === '<';
                    const colMatches = colConds.some((cond) => esRango(cond.op))
                      ? colConds.every((cond) => matchesField(item, cond))
                      : colConds.some((cond) => matchesField(item, cond));
                    if (!colMatches) return false;
                  }
                  return true;
                });
              }
              return queryObj;
            }),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn((count: number) => {
              filtered = filtered.slice(0, count);
              return queryObj;
            }),
            then: (resolve: any) => resolve([...filtered]),
          };

          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          const record = {
            id: vals.id || randomUUID(),
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
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  const coachId1 = 'c1111111-1111-4111-8111-111111111111';
  const coachId2 = 'c2222222-2222-4222-8222-222222222222';
  const alumnoId1 = 'a1111111-1111-4111-8111-111111111111';
  const alumnoId2 = 'a2222222-2222-4222-8222-222222222222';
  const ejercicioGlobalId = 'e1111111-1111-4111-8111-111111111111';
  const ejercicioCoachId = 'e2222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsuarios = [
      { id: coachId1, email: 'coach1@guachafit.com', rol: Rol.ENTRENADOR },
      { id: coachId2, email: 'coach2@guachafit.com', rol: Rol.ENTRENADOR },
      { id: alumnoId1, email: 'alumno1@guachafit.com', rol: Rol.ALUMNO },
      { id: alumnoId2, email: 'alumno2@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-alumno-1',
        usuarioId: alumnoId1,
        entrenadorId: coachId1,
        nombres: 'Pedro',
        apellidos: 'Pérez',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
      {
        id: 'perfil-alumno-2',
        usuarioId: alumnoId2,
        entrenadorId: coachId2,
        nombres: 'María',
        apellidos: 'Gómez',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
    ];

    mockEjerciciosCatalogo = [
      {
        id: ejercicioGlobalId,
        entrenadorId: null,
        nombre: 'Sentadilla Libre con Barra',
        grupoMuscular: 'Piernas',
        patronMovimiento: 'Dominante de Rodilla',
        activo: true,
        createdAtUtc: new Date(),
      },
      {
        id: ejercicioCoachId,
        entrenadorId: coachId1,
        nombre: 'Press Militar con Mancuernas',
        grupoMuscular: 'Hombros',
        patronMovimiento: 'Empuje Vertical',
        activo: true,
        createdAtUtc: new Date(),
      },
    ];

    mockSesionesEntrenamiento = [];
    mockEjerciciosSesion = [];
    mockSeriesRegistro = [];
    mockRutinas = [];

    mockDispatcher = {
      despacharEvento: vi.fn().mockResolvedValue({
        inAppId: 'inapp-test',
        pushEnqueued: false,
        emailEnqueued: false,
        activeDeviceTokensCount: 0,
      }),
    };

    mockDb = createMockDb();
    withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(mockDb));
    entrenamientoService = new EntrenamientoService(mockDb, withTenantMock, mockDispatcher);
    entrenamientoController = new EntrenamientoController(entrenamientoService);
  });

  // ---------------------------------------------------------------------------
  // Factories de fixtures para el monitor semanal (RN-03)
  // ---------------------------------------------------------------------------

  function crearRutinaSemanal(alumnoUsuarioId: string, diaSugeridos: number[]) {
    return {
      id: randomUUID(),
      alumnoId: alumnoUsuarioId,
      entrenadorId: coachId1,
      nombre: 'Planificación Semanal Activa',
      bloques: diaSugeridos.map((dia, idx) => ({
        diaId: `dia-${dia}-${idx}`,
        titulo: `Día ${dia}`,
        diaSugerido: dia,
        ejercicios: [{ nombre: 'Sentadilla', series: 3, reps: '10', peso: '50.00' }],
      })),
      activa: true,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    };
  }

  function crearSesionCompletada(alumnoUsuarioId: string, fechaFinUtc: Date) {
    return {
      id: randomUUID(),
      alumnoId: alumnoUsuarioId,
      rutinaId: null,
      fechaProgramada: fechaFinUtc.toISOString().split('T')[0],
      fechaInicioUtc: new Date(fechaFinUtc.getTime() - 3600000),
      fechaFinUtc,
      timezoneCliente: 'UTC',
      estado: EstadoSesion.COMPLETADA,
      porcentajeCumplimiento: '100.00',
      volumenTotalKg: '100.00',
      createdAtUtc: fechaFinUtc,
      updatedAtUtc: fechaFinUtc,
    };
  }

  function agregarAlumno(id: string, usuarioId: string, opciones: Partial<any> = {}) {
    const perfil = {
      id,
      usuarioId,
      entrenadorId: coachId1,
      nombres: 'Alumno',
      apellidos: id,
      estadoActivacion: EstadoAlumno.ACTIVO,
      rachaDias: 0,
      rachaUltimaFecha: null,
      deletedAtUtc: null,
      createdAtUtc: new Date(),
      ...opciones,
    };
    mockPerfilesAlumno.push(perfil);
    return perfil;
  }

  /** Fecha local UTC (YYYY-MM-DD) usada por los tests del monitor con timezone 'UTC'. */
  function fechaLocalUtc(fecha: Date): string {
    return fecha.toISOString().split('T')[0];
  }

  describe('1. Catálogo de Ejercicios', () => {
    it('debe permitir a un entrenador crear un ejercicio en su catálogo', async () => {
      const nuevo = await entrenamientoService.crearEjercicio(coachId1, {
        nombre: 'Peso Muerto Rumano',
        grupoMuscular: 'Isquiosurales',
        patronMovimiento: 'Bisagra de Cadera',
        videoUrl: 'https://cdn.guachafit.com/videos/rdl.mp4',
      });

      expect(nuevo.id).toBeDefined();
      expect(nuevo.nombre).toBe('Peso Muerto Rumano');
      expect(nuevo.entrenadorId).toBe(coachId1);
      expect(nuevo.activo).toBe(true);
    });

    it('debe listar ejercicios activos aplicando filtro multi-tenant (propios + globales)', async () => {
      const lista = await entrenamientoService.listarEjercicios(coachId1);
      expect(lista.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Prescripción de Sesión de Entrenamiento', () => {
    it('debe prescribir una sesión con ejercicios y series para un alumno asignado', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        timezoneCliente: 'America/Caracas',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            orden: 1,
            notasCoach: 'RPE 8 en la última serie',
            series: [
              { numeroSerie: 1, repsObjetivo: 10, pesoSugeridoKg: '60.00' },
              { numeroSerie: 2, repsObjetivo: 8, pesoSugeridoKg: '70.00' },
            ],
          },
        ],
      });

      expect(sesion.id).toBeDefined();
      expect(sesion.alumnoId).toBe(alumnoId1);
      expect(sesion.estado).toBe(EstadoSesion.PLANIFICADA);
      expect(sesion.porcentajeCumplimiento).toBe('0.00');
      expect(sesion.fechaInicioUtc).toBeNull();
      expect(sesion.ejercicios.length).toBe(1);
      expect(sesion.ejercicios[0].series.length).toBe(2);
    });

    it('debe rechazar la prescripción si el entrenador intenta prescribir a un alumno de otro tenant', async () => {
      await expect(
        entrenamientoService.crearSesion(coachId1, {
          alumnoId: alumnoId2, // Pertenece a coachId2
          fechaProgramada: '2026-09-06',
          ejercicios: [
            {
              ejercicioId: ejercicioGlobalId,
              series: [{ repsObjetivo: 10 }],
            },
          ],
        })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Consulta Pasiva de Rutina (RN-04, Solo Lectura)', () => {
    it('debe consultar la rutina sin alterar estado ni fechaInicioUtc', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10, pesoSugeridoKg: '50.00' }],
          },
        ],
      });

      const consultada = await entrenamientoService.obtenerSesionPorId(
        sesion.id,
        alumnoId1,
        Rol.ALUMNO
      );

      expect(consultada.estado).toBe(EstadoSesion.PLANIFICADA);
      expect(consultada.fechaInicioUtc).toBeNull();
    });
  });

  describe('4. Inicio Explícito de Sesión (RN-04, RN-05, ADR-002)', () => {
    it('debe transicionar a "en_progreso", capturar fechaInicioUtc en UTC con "Z" y timezoneCliente', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10 }],
          },
        ],
      });

      const iniciada = await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:15:00Z',
      });

      expect(iniciada.estado).toBe(EstadoSesion.EN_PROGRESO);
      expect(iniciada.fechaInicioUtc).toBe('2026-09-06T10:15:00.000Z');
      expect(iniciada.timezoneCliente).toBe('America/Caracas');
    });

    it('debe rechazar iniciar una sesión que ya no esté en "planificada"', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10 }],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      await expect(
        entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
          timezoneCliente: 'America/Caracas',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('con la misma X-Idempotency-Key el reintento de iniciar devuelve la respuesta original y no re-aplica (D3)', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10 }],
          },
        ],
      });

      const primera = await entrenamientoService.iniciarSesion(
        sesion.id,
        alumnoId1,
        { timezoneCliente: 'America/Caracas', fechaInicioUtc: '2026-09-06T10:15:00Z' },
        'idem-iniciar-1'
      );
      expect(primera.estado).toBe(EstadoSesion.EN_PROGRESO);
      expect(primera.fechaInicioUtc).toBe('2026-09-06T10:15:00.000Z');
      expect(primera.timezoneCliente).toBe('America/Caracas');

      // Reintento con la MISMA key y otro payload: gana la respuesta original y el registro
      // persistido no se re-aplica (sin cache la transición repetida lanzaría 400).
      const reintento = await entrenamientoService.iniciarSesion(
        sesion.id,
        alumnoId1,
        { timezoneCliente: 'America/Santiago', fechaInicioUtc: '2026-09-06T18:00:00Z' },
        'idem-iniciar-1'
      );
      expect(reintento.id).toBe(primera.id);
      expect(reintento.fechaInicioUtc).toBe('2026-09-06T10:15:00.000Z');
      expect(reintento.timezoneCliente).toBe('America/Caracas');

      const persistida = await entrenamientoService.obtenerSesionPorId(
        sesion.id,
        alumnoId1,
        Rol.ALUMNO
      );
      expect(persistida.timezoneCliente).toBe('America/Caracas');
      expect(persistida.fechaInicioUtc).toBe('2026-09-06T10:15:00.000Z');

      // Sin key no hay caché: el segundo envío mantiene el comportamiento previo (400).
      await expect(
        entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
          timezoneCliente: 'America/Caracas',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. Sincronización Batch de Series (RN-01)', () => {
    it('debe actualizar repsLogradas, pesoKg (2 decimales) y completada', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [
              { numeroSerie: 1, repsObjetivo: 10, pesoSugeridoKg: '60.00' },
              { numeroSerie: 2, repsObjetivo: 10, pesoSugeridoKg: '60.00' },
            ],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      const sincronizada = await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [
          {
            serieId,
            repsLogradas: 10,
            pesoKg: '65.00',
            rpe: '8.5',
            completada: true,
            timestampCompletadaUtc: '2026-09-06T10:20:00Z',
          },
        ],
      });

      expect(sincronizada.estado).toBe(EstadoSesion.EN_PROGRESO);
      const s1 = sincronizada.ejercicios[0].series.find((s) => s.id === serieId);
      expect(s1?.repsLogradas).toBe(10);
      expect(s1?.pesoKg).toBe('65.00');
      expect(s1?.completada).toBe(true);
    });

    it('debe denegar la sincronización si la sesión no está en progreso', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10 }],
          },
        ],
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await expect(
        entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
          series: [{ serieId, repsLogradas: 10, pesoKg: '60.00', completada: true }],
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('con la misma X-Idempotency-Key devuelve la respuesta original y NO re-aplica el batch (D3)', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10, pesoSugeridoKg: '60.00' }],
          },
        ],
      });
      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });
      const serieId = sesion.ejercicios[0].series[0].id;

      const primera = await entrenamientoService.sincronizarSeries(
        sesion.id,
        alumnoId1,
        {
          series: [
            { serieId, repsLogradas: 10, pesoKg: '60.00', completada: true },
          ],
        },
        'idem-series-1'
      );
      expect(primera.ejercicios[0].series[0].pesoKg).toBe('60.00');

      // Reintento con la MISMA key y un payload distinto: gana la respuesta original.
      const reintento = await entrenamientoService.sincronizarSeries(
        sesion.id,
        alumnoId1,
        {
          series: [
            { serieId, repsLogradas: 1, pesoKg: '99.99', completada: false },
          ],
        },
        'idem-series-1'
      );
      const serieReintento = reintento.ejercicios[0].series.find((s) => s.id === serieId);
      expect(serieReintento?.pesoKg).toBe('60.00');
      expect(serieReintento?.repsLogradas).toBe(10);
      expect(serieReintento?.completada).toBe(true);

      const enDb = mockSeriesRegistro.find((s) => s.id === serieId);
      expect(enDb?.pesoKg).toBe('60.00');
      expect(enDb?.repsLogradas).toBe(10);
      expect(enDb?.completada).toBe(true);
    });
  });

  describe('6. Finalización de Sesión y Regla de Racha (RN-02)', () => {
    it('Caso Cumplimiento >= 70%: marca completada, cumpleReglaRacha = true e incrementa la racha persistida', async () => {
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-05'; // ayer respecto a la sesión

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
            ],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      // Completar 4 de 5 series = 80.00%
      const seriesIds = sesion.ejercicios[0].series.map((s) => s.id);
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [
          { serieId: seriesIds[0], repsLogradas: 10, pesoKg: '60.00', completada: true },
          { serieId: seriesIds[1], repsLogradas: 10, pesoKg: '60.00', completada: true },
          { serieId: seriesIds[2], repsLogradas: 10, pesoKg: '60.00', completada: true },
          { serieId: seriesIds[3], repsLogradas: 10, pesoKg: '60.00', completada: true },
        ],
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        notasAlumno: 'Excelente bombeo',
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(resultado.sesion.porcentajeCumplimiento).toBe('80.00');
      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(resultado.cumpleRacha).toBe(true);
      expect(resultado.nuevaRacha).toBe(6);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(6);
      expect(mockPerfilesAlumno[0].rachaUltimaFecha).toBe('2026-09-06');
      expect(resultado.duracionMinutos).toBe(60);
    });

    it('Caso Cumplimiento < 70%: cumpleReglaRacha = false y racha almacenada intacta', async () => {
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-05';

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
              { repsObjetivo: 10 },
            ],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      // Completar 2 de 5 = 40.00%
      const seriesIds = sesion.ejercicios[0].series.map((s) => s.id);
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [
          { serieId: seriesIds[0], repsLogradas: 10, pesoKg: '60.00', completada: true },
          { serieId: seriesIds[1], repsLogradas: 10, pesoKg: '60.00', completada: true },
        ],
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T10:30:00Z',
      });

      expect(resultado.sesion.porcentajeCumplimiento).toBe('40.00');
      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(5);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(5);
      expect(mockPerfilesAlumno[0].rachaUltimaFecha).toBe('2026-09-05');
    });

    it('Regla del 70% por VOLUMEN: 75 kg reales sobre 100 kg prescritos incrementa la racha', async () => {
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-05';

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10, pesoSugeridoKg: '100.00' }],
          },
        ],
      });

      expect(sesion.ejercicios[0].series[0].pesoPrescritoKg).toBe('100.00');
      expect(sesion.ejercicios[0].series[0].pesoKg).toBeNull();

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '75.00', completada: true }],
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(resultado.nuevaRacha).toBe(6);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(6);
    });

    it('Mismo día no duplica la racha', async () => {
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-06'; // ya entrenó hoy

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '50.00', completada: true }],
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.nuevaRacha).toBe(5);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(5);
      expect(mockPerfilesAlumno[0].rachaUltimaFecha).toBe('2026-09-06');
    });

    it('Gap de días reinicia la racha a 1 al volver a entrenar', async () => {
      mockPerfilesAlumno[0].rachaDias = 9;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-08-30'; // gap > 1 día

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '50.00', completada: true }],
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.nuevaRacha).toBe(1);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(1);
      expect(mockPerfilesAlumno[0].rachaUltimaFecha).toBe('2026-09-06');
    });

    it('con la misma X-Idempotency-Key el reintento de finalizar devuelve la respuesta original sin duplicar la racha (D3)', async () => {
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-05';

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });
      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });
      const serieId = sesion.ejercicios[0].series[0].id;
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '50.00', completada: true }],
      });

      const primera = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        { fechaFinUtc: '2026-09-06T11:00:00Z' },
        'idem-finalizar-1'
      );
      expect(primera.cumpleReglaRacha).toBe(true);
      expect(primera.nuevaRacha).toBe(6);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(6);

      // Reintento (la respuesta original se perdió): sin cache, la sesión ya está COMPLETADA
      // y el servicio lanzaría 400; con la key se devuelve la respuesta original.
      const reintento = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        { fechaFinUtc: '2026-09-06T12:00:00Z' },
        'idem-finalizar-1'
      );
      expect(reintento.sesion.id).toBe(primera.sesion.id);
      expect(reintento.sesion.fechaFinUtc).toBe(primera.sesion.fechaFinUtc);
      expect(reintento.nuevaRacha).toBe(6);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(6);
    });

    it('el cierre por omisión (descansado/incompleto) también es idempotente con la misma key (D3)', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });
      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      const primera = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        { tipoCierre: 'DESCANSADA', fechaFinUtc: '2026-09-06T10:05:00Z' },
        'idem-omitir-1'
      );
      expect(primera.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(primera.sesion.motivoOmision).toBe('DESCANSO');

      // Reintento con otra decisión: gana la respuesta original (DESCANSO), no INCOMPLETO.
      const reintento = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        { tipoCierre: 'INCOMPLETA', fechaFinUtc: '2026-09-06T10:30:00Z' },
        'idem-omitir-1'
      );
      expect(reintento.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(reintento.sesion.motivoOmision).toBe('DESCANSO');
      expect(reintento.sesion.fechaFinUtc).toBe(primera.sesion.fechaFinUtc);
    });
  });

  describe('6.b Cierre de Sesión Vacía (RF-001 Escenario 5)', () => {
    it('rechaza con 400 el cierre sin series completadas y sin tipoCierre', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      await expect(
        entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
          fechaFinUtc: '2026-09-06T10:10:00Z',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('el 400 por sesión vacía expone el código máquina SESION_VACIA y solo ese caso lo lleva (D7)', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });
      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      let errorVacio: BadRequestException | undefined;
      try {
        await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
          fechaFinUtc: '2026-09-06T10:10:00Z',
        });
      } catch (err) {
        errorVacio = err as BadRequestException;
      }
      expect(errorVacio).toBeInstanceOf(BadRequestException);
      expect(errorVacio!.getResponse()).toMatchObject({
        statusCode: 400,
        code: 'SESION_VACIA',
      });

      // Un 400 distinto (COMPLETADA con 0 series) NO debe llevar el código SESION_VACIA:
      // la UI solo abre el modal de cierre vacío para el caso real.
      let errorCompletada: BadRequestException | undefined;
      try {
        await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
          tipoCierre: 'COMPLETADA',
        });
      } catch (err) {
        errorCompletada = err as BadRequestException;
      }
      expect(errorCompletada).toBeInstanceOf(BadRequestException);
      expect((errorCompletada!.getResponse() as any).code).toBeUndefined();
    });

    it('cierra como OMITIDA con motivo DESCANSO cuando el alumno lo decide, sin tocar la racha', async () => {
      mockPerfilesAlumno[0].rachaDias = 3;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-05';

      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T10:05:00Z',
        tipoCierre: 'DESCANSADA',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(resultado.sesion.motivoOmision).toBe('DESCANSO');
      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(3);
      expect(mockPerfilesAlumno[0].rachaDias).toBe(3);
      expect(resultado.sesion.fechaInicioUtc).toBe('2026-09-06T10:00:00.000Z');
    });

    it('rechaza COMPLETADA con 0 series incluso si viene tipoCierre', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
      });

      await expect(
        entrenamientoService.finalizarSesion(sesion.id, alumnoId1, { tipoCierre: 'COMPLETADA' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6.c Seguridad: aislamiento del historial entre alumnos', () => {
    it('un alumno puede leer su propio historial', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      const req = { user: { sub: alumnoId1, entrenadorId: coachId1, rol: Rol.ALUMNO } };
      const historial = await entrenamientoController.obtenerHistorialSesionesAlumno(
        req,
        alumnoId1
      );

      expect(historial.length).toBe(1);
      expect(historial[0].id).toBe(sesion.id);
      expect(historial[0].alumnoId).toBe(alumnoId1);
    });

    it('un alumno NO puede leer el historial de otro alumno (403)', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { sub: alumnoId1, entrenadorId: coachId1, rol: Rol.ALUMNO } },
          alumnoId2 // Pertenece a coachId2
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('un entrenador de otro tenant sigue bloqueado (403)', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { sub: coachId2, entrenadorId: coachId2, rol: Rol.ENTRENADOR } },
          alumnoId1 // Pertenece a coachId1
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('6.d Última sesión registrada del alumno (auditoría coach)', () => {
    function crearSesionConEstado(
      alumnoUsuarioId: string,
      estado: EstadoSesion,
      fechaProgramada: string
    ) {
      return {
        id: randomUUID(),
        alumnoId: alumnoUsuarioId,
        rutinaId: null,
        fechaProgramada,
        fechaInicioUtc: null,
        fechaFinUtc: null,
        timezoneCliente: 'UTC',
        estado,
        porcentajeCumplimiento: '0.00',
        volumenTotalKg: '0.00',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      };
    }

    it('ignora una PLANIFICADA más reciente y devuelve la COMPLETADA antigua', async () => {
      const completada = crearSesionConEstado(alumnoId1, EstadoSesion.COMPLETADA, '2026-09-01');
      const planificada = crearSesionConEstado(alumnoId1, EstadoSesion.PLANIFICADA, '2026-09-30');
      // La planificada queda primero en el mock: sin filtro de estado, el limit(1) la devolvería.
      mockSesionesEntrenamiento.push(planificada, completada);

      const ultima = await entrenamientoService.obtenerUltimaSesionAlumno(
        coachId1,
        alumnoId1,
        Rol.ENTRENADOR
      );

      expect(ultima).not.toBeNull();
      expect(ultima!.id).toBe(completada.id);
      expect(ultima!.estado).toBe(EstadoSesion.COMPLETADA);
    });

    it('excluye OMITIDA: con solo planificadas y omitidas devuelve null', async () => {
      mockSesionesEntrenamiento.push(
        crearSesionConEstado(alumnoId1, EstadoSesion.PLANIFICADA, '2026-09-30'),
        crearSesionConEstado(alumnoId1, EstadoSesion.OMITIDA, '2026-09-02')
      );

      const ultima = await entrenamientoService.obtenerUltimaSesionAlumno(
        coachId1,
        alumnoId1,
        Rol.ENTRENADOR
      );

      expect(ultima).toBeNull();
    });

    it('devuelve la EN_PROGRESO cuando es la sesión viva más reciente', async () => {
      const enProgreso = crearSesionConEstado(alumnoId1, EstadoSesion.EN_PROGRESO, '2026-09-05');
      const completada = crearSesionConEstado(alumnoId1, EstadoSesion.COMPLETADA, '2026-09-01');
      mockSesionesEntrenamiento.push(enProgreso, completada);

      const ultima = await entrenamientoService.obtenerUltimaSesionAlumno(
        coachId1,
        alumnoId1,
        Rol.ENTRENADOR
      );

      expect(ultima).not.toBeNull();
      expect(ultima!.id).toBe(enProgreso.id);
      expect(ultima!.estado).toBe(EstadoSesion.EN_PROGRESO);
    });
  });

  describe('7. Funciones Puras: Adherencia y Duración', () => {
    it('evaluarAdherenciaSemanal asigna semáforos verde, amarillo y rojo según RN-03', () => {
      // Verde: >=80% e inactividad <=4
      const v = evaluarAdherenciaSemanal(5, 4, 1);
      expect(v.semaforoAdherencia).toBe(SemaforoAdherencia.VERDE);
      expect(v.nivelRiesgo).toBe('BAJO');

      // Amarillo: 50-79% e inactividad <=4
      const a = evaluarAdherenciaSemanal(5, 3, 2);
      expect(a.semaforoAdherencia).toBe(SemaforoAdherencia.AMARILLO);
      expect(a.nivelRiesgo).toBe('MEDIO');

      // Rojo: <50%
      const r1 = evaluarAdherenciaSemanal(5, 2, 1);
      expect(r1.semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(r1.nivelRiesgo).toBe('ALTO');

      // Rojo: inactividad > 4
      const r2 = evaluarAdherenciaSemanal(5, 5, 5);
      expect(r2.semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(r2.nivelRiesgo).toBe('ALTO');
    });

    it('calcularDuracionMinutos calcula los minutos entre timestamps UTC correctamente', () => {
      expect(calcularDuracionMinutos('2026-09-06T10:00:00Z', '2026-09-06T11:15:00Z')).toBe(75);
      expect(calcularDuracionMinutos(null, '2026-09-06T11:15:00Z')).toBeNull();
    });

    it('evaluarCumplimientoRachaPorVolumen aplica el 70% ponderado y el ratio de series', () => {
      // Solo volumen: 75 kg reales de 100 kg prescritos = 75%
      const soloVolumen = evaluarCumplimientoRachaPorVolumen([
        {
          pesoPrescritoKg: '100.00',
          pesoKg: '75.00',
          repsObjetivo: 10,
          repsLogradas: 10,
          completada: true,
        },
      ]);
      expect(soloVolumen.cumple).toBe(true);
      expect(soloVolumen.ratioVolumenPct).toBe(75);

      // Solo volumen insuficiente: 60%
      const volumenBajo = evaluarCumplimientoRachaPorVolumen([
        {
          pesoPrescritoKg: '100.00',
          pesoKg: '60.00',
          repsObjetivo: 10,
          repsLogradas: 10,
          completada: true,
        },
      ]);
      expect(volumenBajo.cumple).toBe(false);

      // Combinada: volumen 100% pero parte cualitativa al 0% -> NO cumple
      const combinada = evaluarCumplimientoRachaPorVolumen([
        {
          pesoPrescritoKg: '100.00',
          pesoKg: '100.00',
          repsObjetivo: 10,
          repsLogradas: 10,
          completada: true,
        },
        { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: null, completada: false },
      ]);
      expect(combinada.ratioVolumenPct).toBe(100);
      expect(combinada.ratioSeriesPct).toBe(0);
      expect(combinada.cumple).toBe(false);

      // Sin parte ponderada: legacy por series (80% -> cumple)
      const legacy = evaluarCumplimientoRachaPorVolumen([
        { pesoPrescritoKg: null, pesoKg: '50.00', repsObjetivo: 10, repsLogradas: 10, completada: true },
        { pesoPrescritoKg: null, pesoKg: '50.00', repsObjetivo: 10, repsLogradas: 10, completada: true },
        { pesoPrescritoKg: null, pesoKg: '50.00', repsObjetivo: 10, repsLogradas: 10, completada: true },
        { pesoPrescritoKg: null, pesoKg: '50.00', repsObjetivo: 10, repsLogradas: 10, completada: true },
        { pesoPrescritoKg: null, pesoKg: null, repsObjetivo: 10, repsLogradas: null, completada: false },
      ]);
      expect(legacy.ratioVolumenPct).toBeNull();
      expect(legacy.cumple).toBe(true);

      // Peso prescrito 0.00 equivale a parte cualitativa
      const prescritoCero = evaluarCumplimientoRachaPorVolumen([
        { pesoPrescritoKg: '0.00', pesoKg: '0.00', repsObjetivo: 10, repsLogradas: 10, completada: true },
      ]);
      expect(prescritoCero.ratioVolumenPct).toBeNull();
      expect(prescritoCero.ratioSeriesPct).toBe(100);
      expect(prescritoCero.cumple).toBe(true);
    });

    it('actualizarRacha y calcularRachaEfectiva respetan mismo día, ayer y gap (RN-02)', () => {
      // Mismo día no duplica
      const mismoDia = actualizarRacha(
        { rachaDias: 5, rachaUltimaFecha: '2026-09-06' },
        '2026-09-06',
        true
      );
      expect(mismoDia.incrementada).toBe(false);
      expect(mismoDia.rachaDias).toBe(5);

      // Ayer incrementa
      const ayer = actualizarRacha(
        { rachaDias: 5, rachaUltimaFecha: '2026-09-05' },
        '2026-09-06',
        true
      );
      expect(ayer.incrementada).toBe(true);
      expect(ayer.rachaDias).toBe(6);

      // Gap reinicia a 1
      const gap = actualizarRacha(
        { rachaDias: 9, rachaUltimaFecha: '2026-08-30' },
        '2026-09-06',
        true
      );
      expect(gap.rachaDias).toBe(1);

      // No cumple: intacta
      const noCumple = actualizarRacha(
        { rachaDias: 9, rachaUltimaFecha: '2026-09-05' },
        '2026-09-06',
        false
      );
      expect(noCumple.incrementada).toBe(false);
      expect(noCumple.rachaDias).toBe(9);

      // Racha efectiva rota por gap
      expect(calcularRachaEfectiva(9, '2026-08-30', '2026-09-06')).toBe(0);
      expect(calcularRachaEfectiva(9, '2026-09-05', '2026-09-06')).toBe(9);
      expect(calcularRachaEfectiva(9, '2026-09-06', '2026-09-06')).toBe(9);
      expect(calcularRachaEfectiva(9, null, '2026-09-06')).toBe(0);
    });

    it('calcularVentanaSemana convierte el Lunes 00:00 local al instante UTC exacto (RN-05)', () => {
      const now = new Date('2026-09-16T02:00:00Z'); // Miércoles 02:00 UTC = Martes 22:00 en Caracas

      const caracas = calcularVentanaSemana(now, 'America/Caracas');
      expect(caracas.hoyLocal).toBe('2026-09-15');
      expect(caracas.inicioSemanaLocal).toBe('2026-09-14');
      expect(caracas.finSemanaLocal).toBe('2026-09-20');
      expect(caracas.isoDayHoy).toBe(2);
      expect(caracas.inicioSemanaUtc.toISOString()).toBe('2026-09-14T04:00:00.000Z');
      expect(caracas.ahoraUtc.toISOString()).toBe(now.toISOString());

      // Timezone inválida => fallback UTC documentado
      const invalida = calcularVentanaSemana(now, 'Zona/Invalida');
      expect(invalida.hoyLocal).toBe('2026-09-16');
      expect(invalida.inicioSemanaUtc.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    });
  });

  describe('7.b Monitor Semanal de Adherencia del Coach (RN-03 / Escenario 4)', () => {
    it('ventana semanal: prescritas desde bloques debidos y completadas solo dentro de Lunes->ahora', async () => {
      const ahora = new Date();
      const dentroDeVentana = new Date(ahora.getTime() - 60 * 60 * 1000);
      const fueraDeVentana = new Date(ahora.getTime() - 10 * 24 * 60 * 60 * 1000);

      const hoyUtc = fechaLocalUtc(ahora);
      const jsDay = new Date(`${hoyUtc}T00:00:00Z`).getUTCDay();
      const isoDayHoy = jsDay === 0 ? 7 : jsDay;
      // Bloque del Lunes (siempre debido) + bloque del Domingo (sólo debido si hoy es domingo):
      // `sesionesPrescritas` refleja únicamente los bloques ya debidos dentro de Lunes->ahora.
      const bloquesDebidos = isoDayHoy === 7 ? 2 : 1;

      mockRutinas.push(crearRutinaSemanal(alumnoId1, [1, 7]));
      // 2 completadas dentro de la ventana + 1 completada hace 10 días (fuera de la semana)
      mockSesionesEntrenamiento.push(
        crearSesionCompletada(alumnoId1, ahora),
        crearSesionCompletada(alumnoId1, dentroDeVentana),
        crearSesionCompletada(alumnoId1, fueraDeVentana)
      );

      const monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');

      expect(monitor).toHaveLength(1);
      const fila = monitor[0];
      expect(fila.tienePlanActivo).toBe(true);
      expect(fila.sesionesPrescritas).toBe(bloquesDebidos);
      expect(fila.sesionesCompletadas).toBe(2); // la de hace 10 días queda fuera
      expect(fila.porcentajeCumplimientoSemanal).toBe(
        ((2 / bloquesDebidos) * 100).toFixed(2)
      );
      expect(fila.semaforoAdherencia).toBe(SemaforoAdherencia.VERDE);
      expect(fila.rachaDiasConsecutivos).toBe(0);
      expect(fila.diasInactivo).toBe(0);
      expect(fila.ultimaSesionUtc).toBe(ahora.toISOString());
      expect(fila.alumnoPerfilId).toBe('perfil-alumno-1'); // GET /alumnos/:id espera perfiles_alumno.id
    });

    it('tienePlanActivo=false y sesionesPrescritas=0 cuando no hay rutina activa', async () => {
      const ahora = new Date();
      mockSesionesEntrenamiento.push(crearSesionCompletada(alumnoId1, ahora));

      const monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');

      expect(monitor).toHaveLength(1);
      expect(monitor[0].tienePlanActivo).toBe(false);
      expect(monitor[0].sesionesPrescritas).toBe(0);
      expect(monitor[0].sesionesCompletadas).toBe(1);
      expect(monitor[0].alumnoPerfilId).toBe('perfil-alumno-1');
    });

    it('D6: plan activo sin bloques vencidos (inicio de semana) expone sinPendientesSemana=true; con bloque debido, false', async () => {
      vi.useFakeTimers();
      try {
        // Lunes 2026-09-14: ningún bloque de Sábado (6) ha vencido todavía.
        vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'));
        mockRutinas.push(crearRutinaSemanal(alumnoId1, [6]));

        let monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');
        expect(monitor[0].tienePlanActivo).toBe(true);
        expect(monitor[0].sesionesPrescritas).toBe(0);
        expect(monitor[0].sinPendientesSemana).toBe(true);
        // Semántica histórica del servidor intacta: la UI la neutraliza con el flag aditivo.
        expect(monitor[0].semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);

        // Con un bloque ya debido (Lunes) y 0 completadas el 0/0 SÍ es un riesgo real.
        mockRutinas.length = 0;
        mockRutinas.push(crearRutinaSemanal(alumnoId1, [1]));
        monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');
        expect(monitor[0].sesionesPrescritas).toBe(1);
        expect(monitor[0].sinPendientesSemana).toBe(false);
        expect(monitor[0].semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      } finally {
        vi.useRealTimers();
      }
    });

    it('D10: excluye alumnos pausados/suspendidos (solo activos y no archivados) del monitor', async () => {
      const pausadoId = 'a5555555-5555-4555-8555-555555555555';
      agregarAlumno('perfil-alumno-pausado', pausadoId, {
        nombres: 'Pablo',
        apellidos: 'Pausado',
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      });

      const monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');

      expect(monitor.map((m) => m.alumnoId)).toContain(alumnoId1);
      expect(monitor.map((m) => m.alumnoId)).not.toContain(pausadoId);
    });

    it('ordena ROJO -> AMARILLO -> VERDE y muestra la racha efectiva (RN-02)', async () => {
      const ahora = new Date();
      const hoyUtc = fechaLocalUtc(ahora);
      const ayerUtc = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const fechaRota = new Date(ahora.getTime() - 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // Alumno 1 (rojo): sin plan y sin historial => inactividad 7
      // Alumno 3 (verde): 1/1 y racha vigente de 9 días (ayer)
      const alumno3 = 'a3333333-3333-4333-8333-333333333333';
      agregarAlumno('perfil-alumno-3', alumno3, {
        nombres: 'Ana',
        apellidos: 'López',
        rachaDias: 9,
        rachaUltimaFecha: ayerUtc,
      });
      mockRutinas.push(crearRutinaSemanal(alumno3, [1]));
      mockSesionesEntrenamiento.push(crearSesionCompletada(alumno3, ahora));

      // Alumno 4 (amarillo): 1/2 y racha rota por gap
      const alumno4 = 'a4444444-4444-4444-8444-444444444444';
      agregarAlumno('perfil-alumno-4', alumno4, {
        nombres: 'Luis',
        apellidos: 'Mora',
        rachaDias: 9,
        rachaUltimaFecha: fechaRota,
      });
      mockRutinas.push(crearRutinaSemanal(alumno4, [1, 1]));
      mockSesionesEntrenamiento.push(crearSesionCompletada(alumno4, ahora));

      const monitor = await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');

      expect(monitor.map((m) => m.alumnoId)).toEqual([alumnoId1, alumno4, alumno3]);
      expect(monitor.map((m) => m.semaforoAdherencia)).toEqual([
        SemaforoAdherencia.ROJO,
        SemaforoAdherencia.AMARILLO,
        SemaforoAdherencia.VERDE,
      ]);

      const verde = monitor.find((m) => m.alumnoId === alumno3)!;
      expect(verde.rachaDiasConsecutivos).toBe(9);
      expect(verde.alumnoPerfilId).toBe('perfil-alumno-3');

      const amarillo = monitor.find((m) => m.alumnoId === alumno4)!;
      expect(amarillo.rachaDiasConsecutivos).toBe(0); // cadena rota => efectiva 0
      expect(amarillo.ultimaSesionUtc).toBe(ahora.toISOString());
      expect(amarillo.diasInactivo).toBe(0);
      expect(verde.rachaDiasConsecutivos).not.toBe(0);
      expect(fechaLocalUtc(ahora)).toBe(hoyUtc);
    });

    it('consulta en lote: el número de queries no crece con la cantidad de alumnos (sin N+1)', async () => {
      const ahora = new Date();
      const alumno3 = 'a3333333-3333-4333-8333-333333333333';
      const alumno4 = 'a4444444-4444-4444-8444-444444444444';
      agregarAlumno('perfil-alumno-3', alumno3);
      agregarAlumno('perfil-alumno-4', alumno4);
      mockRutinas.push(
        crearRutinaSemanal(alumnoId1, [1]),
        crearRutinaSemanal(alumno3, [1]),
        crearRutinaSemanal(alumno4, [1])
      );
      mockSesionesEntrenamiento.push(
        crearSesionCompletada(alumnoId1, ahora),
        crearSesionCompletada(alumno3, ahora),
        crearSesionCompletada(alumno4, ahora)
      );
      mockDb.select.mockClear();

      await entrenamientoService.calcularSemanaAdherencia(coachId1, 'UTC');

      // alumnos + rutinas activas + completadas de la ventana + historial de completadas
      expect(mockDb.select).toHaveBeenCalledTimes(4);
    });
  });

  describe('7.c Notificación al coach por feedback de sesión (RF-014 / ADR-010)', () => {
    async function prepararSesionEnProgreso(opciones: { conRpe?: boolean } = {}) {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 10, pesoSugeridoKg: '100.00' }],
          },
        ],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await entrenamientoService.sincronizarSeries(sesion.id, alumnoId1, {
        series: [
          {
            serieId,
            repsLogradas: 10,
            pesoKg: '80.00',
            ...(opciones.conRpe ? { rpe: '8.5' } : {}),
            completada: true,
          },
        ],
      });

      return sesion;
    }

    it('emite SESION_ALUMNO_FINALIZADA al entrenador del alumno con resumen de RPE y nota', async () => {
      const sesion = await prepararSesionEnProgreso({ conRpe: true });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        notasAlumno: 'Buen bombeo en cuadriceps',
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(mockDispatcher.despacharEvento).toHaveBeenCalledTimes(1);

      const evento = mockDispatcher.despacharEvento.mock.calls[0][0];
      expect(evento.tipoEvento).toBe('SESION_ALUMNO_FINALIZADA');
      expect(evento.categoria).toBe('ENTRENAMIENTO');
      expect(evento.destinatarioUserId).toBe(coachId1);
      expect(evento.titulo).toBe('Sesión finalizada por tu alumno');
      expect(evento.cuerpo).toContain('Pedro Pérez');
      expect(evento.cuerpo).toContain('RPE promedio: 8.5');
      expect(evento.cuerpo).toContain('Dejó una nota');
      expect(evento.linkAccion).toBe('/coach/alumnos/perfil-alumno-1');
      expect(evento.datosAdicionales.sesionId).toBe(sesion.id);
      expect(evento.datosAdicionales.alumnoId).toBe(alumnoId1);
      expect(evento.datosAdicionales.rpePromedio).toBe('8.5');
      expect(evento.datosAdicionales.dejoNota).toBe(true);
    });

    it('no emite notificación cuando la sesión se cierra como OMITIDA (descanso/incompleta)', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await entrenamientoService.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T10:05:00Z',
        tipoCierre: 'DESCANSADA',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(mockDispatcher.despacharEvento).not.toHaveBeenCalled();
    });

    it('un fallo del despachador no rompe la finalización de la sesión (RNF-004)', async () => {
      mockDispatcher.despacharEvento.mockRejectedValueOnce(new Error('Redis no disponible'));
      const sesion = await prepararSesionEnProgreso();

      const resultado = await entrenamientoService.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(mockDispatcher.despacharEvento).toHaveBeenCalledTimes(1);
    });

    it('finaliza correctamente cuando el servicio de notificaciones no está inyectado', async () => {
      const servicioSinDispatcher = new EntrenamientoService(mockDb, withTenantMock);
      const sesion = await servicioSinDispatcher.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      await servicioSinDispatcher.iniciarSesion(sesion.id, alumnoId1, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });

      const serieId = sesion.ejercicios[0].series[0].id;
      await servicioSinDispatcher.sincronizarSeries(sesion.id, alumnoId1, {
        series: [{ serieId, repsLogradas: 10, pesoKg: '50.00', completada: true }],
      });

      const resultado = await servicioSinDispatcher.finalizarSesion(sesion.id, alumnoId1, {
        fechaFinUtc: '2026-09-06T11:00:00Z',
      });

      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
    });
  });

  describe('8. EntrenamientoController: Endpoints y Códigos HTTP', () => {
    it('POST /sesiones/prescribir retorna 201 Created', async () => {
      const req = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };
      const sesion = await entrenamientoController.prescribirSesion(req, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [
          {
            ejercicioId: ejercicioGlobalId,
            series: [{ repsObjetivo: 12 }],
          },
        ],
      });
      expect(sesion.id).toBeDefined();
    });

    it('POST /sesiones/:id/iniciar retorna 200 OK y sesión iniciada', async () => {
      const sesion = await entrenamientoService.crearSesion(coachId1, {
        alumnoId: alumnoId1,
        fechaProgramada: '2026-09-06',
        ejercicios: [{ ejercicioId: ejercicioGlobalId, series: [{ repsObjetivo: 10 }] }],
      });

      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const iniciada = await entrenamientoController.iniciarSesion(req, sesion.id, {
        timezoneCliente: 'America/Caracas',
      });

      expect(iniciada.estado).toBe(EstadoSesion.EN_PROGRESO);
    });

    it('GET /entrenador/monitor-adherencia retorna bandeja de alumnos del coach', async () => {
      const req = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };
      const monitor = await entrenamientoController.monitorAdherencia(req);
      expect(Array.isArray(monitor)).toBe(true);
    });
  });
});
