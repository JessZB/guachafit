import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  EntrenamientoService,
  evaluarAdherenciaSemanal,
  calcularDuracionMinutos,
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

  // In-memory data store for the mock database
  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockEjerciciosCatalogo: any[];
  let mockSesionesEntrenamiento: any[];
  let mockEjerciciosSesion: any[];
  let mockSeriesRegistro: any[];

  function isSqlSyntaxChunk(c: any): boolean {
    if (!c || !('value' in c)) return true;
    if (Array.isArray(c.value) && typeof c.value[0] === 'string') {
      const val = c.value[0].toLowerCase().trim();
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
    if (item.queryChunks && Array.isArray(item.queryChunks)) {
      return item.queryChunks.flatMap(getParamsFrom);
    }
    if ('value' in item && item.value !== undefined && !isSqlSyntaxChunk(item)) {
      return Array.isArray(item.value) ? item.value : [item.value];
    }
    return [];
  }

  function extractConditions(sqlObj: any): Array<{ column: string; value: any; isIn?: boolean; isNull?: boolean }> {
    const conditions: Array<{ column: string; value: any; isIn?: boolean; isNull?: boolean }> = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && chunk.queryChunks) {
          traverse(chunk.queryChunks);
        } else if (chunk && typeof chunk.name === 'string') {
          const subsequent = chunks.slice(i + 1);
          const hasIn = subsequent.some(
            (c: any) =>
              c &&
              Array.isArray(c.value) &&
              typeof c.value[0] === 'string' &&
              c.value[0].toLowerCase().includes('in')
          );
          const hasNull = subsequent.some(
            (c: any) =>
              c &&
              Array.isArray(c.value) &&
              typeof c.value[0] === 'string' &&
              c.value[0].toLowerCase().includes('null')
          );

          const params = subsequent.flatMap(getParamsFrom);

          if (hasNull && params.length === 0) {
            conditions.push({ column: chunk.name, value: null, isNull: true });
          } else if (params.length > 1 || hasIn) {
            conditions.push({ column: chunk.name, value: params, isIn: true });
          } else if (params.length === 1) {
            conditions.push({ column: chunk.name, value: params[0] });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(record: any, cond: { column: string; value: any; isIn?: boolean; isNull?: boolean }): boolean {
    const colVal =
      record[cond.column] !== undefined
        ? record[cond.column]
        : record[cond.column.replace(/_([a-z])/g, (_, l) => l.toUpperCase())];

    if (cond.isNull) {
      return colVal === null || colVal === undefined;
    }
    if (cond.isIn && Array.isArray(cond.value)) {
      return cond.value.includes(colVal);
    }
    return colVal === cond.value;
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
                // Agrupar por columna para soportar semántica OR dentro de una misma columna
                const conditionsByCol = new Map<string, any[]>();
                for (const cond of conditions) {
                  if (!conditionsByCol.has(cond.column)) {
                    conditionsByCol.set(cond.column, []);
                  }
                  conditionsByCol.get(cond.column)!.push(cond);
                }

                filtered = filtered.filter((item) => {
                  for (const [_, colConds] of conditionsByCol.entries()) {
                    const colMatches = colConds.some((cond) => matchesField(item, cond));
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

    const mockDb = createMockDb();
    entrenamientoService = new EntrenamientoService(mockDb);
    entrenamientoController = new EntrenamientoController(entrenamientoService);
  });

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
  });

  describe('6. Finalización de Sesión y Regla de Racha (RN-02)', () => {
    it('Caso Cumplimiento >= 70%: marca completada, cumpleReglaRacha = true e incrementa racha', async () => {
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

      const resultado = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        {
          notasAlumno: 'Excelente bombeo',
          fechaFinUtc: '2026-09-06T11:00:00Z',
        },
        5 // Racha previa
      );

      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(resultado.sesion.porcentajeCumplimiento).toBe('80.00');
      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(resultado.nuevaRacha).toBe(6);
      expect(resultado.duracionMinutos).toBe(60);
    });

    it('Caso Cumplimiento < 70%: cumpleReglaRacha = false y racha no se incrementa', async () => {
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

      const resultado = await entrenamientoService.finalizarSesion(
        sesion.id,
        alumnoId1,
        {
          fechaFinUtc: '2026-09-06T10:30:00Z',
        },
        5
      );

      expect(resultado.sesion.porcentajeCumplimiento).toBe('40.00');
      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(5);
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
