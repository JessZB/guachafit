import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NutricionService,
  evaluarToleranciaNutricional,
  MetasNutricionalesCoach,
} from '../../src/modules/nutricion/nutricion.service';
import { NutricionController } from '../../src/modules/nutricion/nutricion.controller';
import {
  Rol,
  SemaforoNutricional,
  TipoComida,
  EstadoAlumno,
} from '@guachafit/shared';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';

describe('Módulo 3: Check-ins Nutricionales (NutricionService & NutricionController)', () => {
  let nutricionService: NutricionService;
  let nutricionController: NutricionController;

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockCheckinsNutricionales: any[];
  let mockFotosComida: any[];

  function isSqlSyntaxChunk(c: any): boolean {
    if (!c || !('value' in c)) return true;
    if (Array.isArray(c.value)) {
      if (
        typeof c.value[0] === 'string' &&
        (/^[=><\s,()]+$/.test(c.value[0].trim()) ||
          c.value[0].trim() === 'in' ||
          c.value[0].trim() === 'and' ||
          c.value[0].trim() === 'or' ||
          c.value[0].trim() === 'is null' ||
          c.value[0].trim() === 'is not null')
      ) {
        return true;
      }
    }
    return false;
  }

  function getParamsFrom(item: any): any[] {
    if (!item) return [];
    if ('value' in item && !isSqlSyntaxChunk(item)) {
      return Array.isArray(item.value) ? item.value : [item.value];
    }
    if (item.queryChunks && Array.isArray(item.queryChunks)) {
      return item.queryChunks.flatMap(getParamsFrom);
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
              c.value[0].includes('in')
          );
          const hasNull = subsequent.some(
            (c: any) =>
              c &&
              Array.isArray(c.value) &&
              typeof c.value[0] === 'string' &&
              c.value[0].includes('null')
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
    if (tableName === 'checkins_nutricionales') return mockCheckinsNutricionales;
    if (tableName === 'fotos_comida') return mockFotosComida;
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
                filtered = filtered.filter((item) =>
                  conditions.every((cond) => matchesField(item, cond))
                );
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
            id: vals.id || `uuid-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      transaction: vi.fn(async (cb: any) => cb(db)),
    };
    return db;
  }

  const coachId1 = 'c1111111-1111-4111-8111-111111111111';
  const coachId2 = 'c2222222-2222-4222-8222-222222222222';
  const alumnoId1 = 'a1111111-1111-4111-8111-111111111111';
  const alumnoId2 = 'a2222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockUsuarios = [
      { id: coachId1, email: 'coach1@guachafit.com', rol: Rol.ENTRENADOR },
      { id: coachId2, email: 'coach2@guachafit.com', rol: Rol.ENTRENADOR },
      { id: alumnoId1, email: 'alumno1@guachafit.com', rol: Rol.ALUMNO },
      { id: alumnoId2, email: 'alumno2@guachafit.com', rol: Rol.ALUMNO },
    ];

    mockPerfilesAlumno = [
      {
        id: 'perfil-1',
        usuarioId: alumnoId1,
        entrenadorId: coachId1,
        nombres: 'Pedro',
        apellidos: 'Pérez',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
      {
        id: 'perfil-2',
        usuarioId: alumnoId2,
        entrenadorId: coachId2,
        nombres: 'María',
        apellidos: 'Gómez',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      },
    ];

    mockCheckinsNutricionales = [];
    mockFotosComida = [];

    const mockDb = createMockDb();
    nutricionService = new NutricionService(mockDb);
    nutricionController = new NutricionController(nutricionService);
  });

  describe('1. Reporte 1-Tap con Semáforo Nutricional (RN-02)', () => {
    it('debe registrar el estado como "cumplido" mediante 1-Tap', async () => {
      const resultado = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      expect(resultado.checkin.id).toBeDefined();
      expect(resultado.checkin.alumnoId).toBe(alumnoId1);
      expect(resultado.checkin.fecha).toBe('2026-09-06');
      expect(resultado.checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('debe soportar semáforos "parcial" y "no_cumplido" con notas de hasta 280 caracteres', async () => {
      const nota = 'Buena proteína pero cené pizza fuera del plan.';
      const resParcial = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-01',
        semaforo: SemaforoNutricional.PARCIAL,
        notasAlumno: nota,
      });

      expect(resParcial.checkin.semaforo).toBe(SemaforoNutricional.PARCIAL);
      expect(resParcial.checkin.notasAlumno).toBe(nota);

      const resNoCumplido = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-02',
        semaforo: SemaforoNutricional.NO_CUMPLIDO,
        notasAlumno: 'Día libre / cumpleaños',
      });

      expect(resNoCumplido.checkin.semaforo).toBe(SemaforoNutricional.NO_CUMPLIDO);
    });

    it('debe rechazar notas del alumno que superen 280 caracteres', async () => {
      await expect(
        nutricionService.registrarCheckinDiario(alumnoId1, {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          notasAlumno: 'A'.repeat(281),
        })
      ).rejects.toThrow();
    });
  });

  describe('2. Diario Fotográfico de Comidas (RN-03)', () => {
    it('debe persistir hasta 4 fotografías de comidas asociadas al check-in', async () => {
      const resultado = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
        fotosPlatos: [
          { tipoComida: TipoComida.DESAYUNO, storageKey: 'r2/comidas/desayuno_1.webp' },
          { tipoComida: TipoComida.ALMUERZO, storageKey: 'r2/comidas/almuerzo_1.webp' },
          { tipoComida: TipoComida.CENA, storageKey: 'r2/comidas/cena_1.webp' },
          { tipoComida: TipoComida.SNACK, storageKey: 'r2/comidas/snack_1.webp' },
        ],
      });

      expect(resultado.checkin.fotosPlatos.length).toBe(4);
      expect(resultado.checkin.fotosPlatos[0].tipoComida).toBe(TipoComida.DESAYUNO);
      expect(resultado.checkin.fotosPlatos[1].tipoComida).toBe(TipoComida.ALMUERZO);
    });

    it('debe rechazar intentos de enviar más de 4 fotografías de platos por día (RN-03)', async () => {
      await expect(
        nutricionService.registrarCheckinDiario(alumnoId1, {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          fotosPlatos: [
            { tipoComida: TipoComida.DESAYUNO, storageKey: 'r2/f1.webp' },
            { tipoComida: TipoComida.ALMUERZO, storageKey: 'r2/f2.webp' },
            { tipoComida: TipoComida.CENA, storageKey: 'r2/f3.webp' },
            { tipoComida: TipoComida.SNACK, storageKey: 'r2/f4.webp' },
            { tipoComida: TipoComida.SNACK, storageKey: 'r2/f5.webp' },
          ],
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Ingreso Opcional de Totales y Margen de Tolerancia (±10%, RN-01, RN-04)', () => {
    const metasCoach: MetasNutricionalesCoach = {
      caloriasObjetivo: 2000,
      proteinaGramosObjetivo: 150,
      aguaLitrosObjetivo: '2.50',
    };

    it('Caso dentro del margen: 2100 kcal (+5%) y 155g proteína (+3.3%)', async () => {
      const res = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          caloriasReportadas: 2100,
          proteinaGramosReportada: 155,
          aguaLitros: '2.50',
        },
        metasCoach
      );

      expect(res.dentroMargenTolerancia).toBe(true);
      expect(res.desviacionCaloriasPct).toBe(5);
      expect(res.desviacionProteinasPct).toBe(3.33);
      expect(res.checkin.aguaLitros).toBe('2.50');
    });

    it('Caso fuera del margen: 2400 kcal (+20%)', async () => {
      const res = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.PARCIAL,
          caloriasReportadas: 2400,
          proteinaGramosReportada: 150,
        },
        metasCoach
      );

      expect(res.dentroMargenTolerancia).toBe(false);
      expect(res.desviacionCaloriasPct).toBe(20);
    });

    it('evaluarToleranciaNutricional calcula desviaciones porcentuales y tolerancia correctamente', () => {
      const tol = evaluarToleranciaNutricional(2000, 110, metasCoach);
      expect(tol.dentroMargenTolerancia).toBe(false);
      expect(tol.desviacionProteinasPct).toBe(-26.67);
    });
  });

  describe('4. Unicidad Diaria (uq_checkin_nutricional_diario)', () => {
    it('debe rechazar un segundo check-in para el mismo alumno en la misma fecha calendario', async () => {
      await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      await expect(
        nutricionService.registrarCheckinDiario(alumnoId1, {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.PARCIAL,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('debe permitir check-ins en fechas distintas para el mismo alumno', async () => {
      const d1 = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
      });
      const d2 = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-07',
        semaforo: SemaforoNutricional.PARCIAL,
      });

      expect(d1.checkin.fecha).toBe('2026-09-06');
      expect(d2.checkin.fecha).toBe('2026-09-07');
    });

    it('debe permitir check-ins en la misma fecha para diferentes alumnos (Multi-tenant)', async () => {
      const c1 = await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
      });
      const c2 = await nutricionService.registrarCheckinDiario(alumnoId2, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.NO_CUMPLIDO,
      });

      expect(c1.checkin.alumnoId).toBe(alumnoId1);
      expect(c2.checkin.alumnoId).toBe(alumnoId2);
    });
  });

  describe('5. Consulta de Check-in y Listado de Historial', () => {
    it('obtenerCheckinHoy debe devolver el reporte de hoy o null si no existe', async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const vacio = await nutricionService.obtenerCheckinHoy(alumnoId1, hoy);
      expect(vacio).toBeNull();

      await nutricionService.registrarCheckinDiario(alumnoId1, {
        fecha: hoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      const encontrado = await nutricionService.obtenerCheckinHoy(alumnoId1, hoy);
      expect(encontrado).not.toBeNull();
      expect(encontrado?.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('listarCheckins debe verificar aislamiento de tenant entre entrenadores', async () => {
      // Coach 1 consulta alumno de Coach 2 -> ForbiddenException
      await expect(
        nutricionService.listarCheckins(coachId1, alumnoId2, {}, Rol.ENTRENADOR)
      ).rejects.toThrow(ForbiddenException);

      // Coach 1 consulta alumno propio -> OK
      const lista = await nutricionService.listarCheckins(coachId1, alumnoId1, {}, Rol.ENTRENADOR);
      expect(Array.isArray(lista)).toBe(true);
    });
  });

  describe('6. NutricionController: Endpoints y Códigos HTTP', () => {
    it('POST /nutricion/checkin-diario retorna 201 Created', async () => {
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const res = await nutricionController.registrarCheckinDiario(req, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
        aguaLitros: '2.00',
      });

      expect(res.checkin).toBeDefined();
      expect(res.checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('GET /nutricion/checkin/hoy retorna reporte del alumno', async () => {
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const res = await nutricionController.obtenerCheckinHoy(req, '2026-09-06');
      expect(res).toBeDefined();
    });

    it('GET /nutricion/alumnos/:alumnoId/checkins retorna lista de check-ins', async () => {
      const req = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };
      const res = await nutricionController.listarCheckins(req, alumnoId1, {});
      expect(Array.isArray(res)).toBe(true);
    });
  });
});
