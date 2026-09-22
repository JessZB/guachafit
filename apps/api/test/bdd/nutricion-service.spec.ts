import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NutricionService,
  evaluarToleranciaNutricional,
  evaluarVentanaCheckinNutricional,
  resolverTimezoneNutricion,
  sumarDiasCalendario,
  enumerarFechasCalendario,
  contarDiasNoReportados,
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

/**
 * RF-002 (WU RF-002a): metas del coach (RN-01), tolerancia ±10% REAL (Escenario 3), ventana
 * horaria 18:00–23:59 local (RN-02), "No reportado" ( §6) y tenancy de los endpoints de metas.
 *
 * El reloj se controla pasando `ahora` al servicio o con fake timers en los caminos de
 * controller: la ventana horaria no puede depender de la hora real de la máquina de CI.
 */
describe('Módulo 3: Check-ins Nutricionales (NutricionService & NutricionController)', () => {
  let nutricionService: NutricionService;
  let nutricionController: NutricionController;

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockCheckinsNutricionales: any[];
  let mockFotosComida: any[];
  let mockMetasNutricionales: any[];

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
    // `inArray` anida los parámetros como un array de `{ value }` dentro del chunk SQL: sin
    // aplanarlo, el mock no puede resolver ninguna condición `IN (...)`.
    if (Array.isArray(item)) return item.flatMap(getParamsFrom);
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
    if (tableName === 'metas_nutricionales') return mockMetasNutricionales;
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
      update: vi.fn((table: any) => ({
        set: vi.fn((vals: any) => ({
          where: vi.fn((predicate: any) => {
            const tableName = table ? getTableName(table) : '';
            const targetArray = getTableArray(tableName);
            const conditions = extractConditions(predicate);
            const target = targetArray.find((item) =>
              conditions.every((cond) => matchesField(item, cond))
            );

            if (target) {
              Object.assign(target, vals);
            }

            return {
              returning: vi.fn().mockResolvedValue(target ? [target] : []),
              then: (resolve: any) => resolve(target ? [target] : []),
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

  /**
   * Instante UTC DENTRO de la ventana RN-02 para una fecha local dada en America/Caracas
   * (UTC-4): 22:00 local = 02:00 UTC del día siguiente.
   */
  function enVentanaCaracas(fecha: string, horaLocal = 22): Date {
    const horaUtc = (horaLocal + 4) % 24;
    const diaUtc = horaLocal + 4 >= 24 ? sumarDiasCalendario(fecha, 1) : fecha;
    return new Date(`${diaUtc}T${String(horaUtc).padStart(2, '0')}:00:00.000Z`);
  }

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
    mockMetasNutricionales = [];

    const mockDb = createMockDb();
    nutricionService = new NutricionService(mockDb);
    nutricionController = new NutricionController(nutricionService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Reporte 1-Tap con Semáforo Nutricional (RN-02)', () => {
    it('debe registrar el estado como "cumplido" mediante 1-Tap dentro de la ventana', async () => {
      const resultado = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(resultado.checkin.id).toBeDefined();
      expect(resultado.checkin.alumnoId).toBe(alumnoId1);
      expect(resultado.checkin.fecha).toBe('2026-09-06');
      expect(resultado.checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('debe soportar semáforos "parcial" y "no_cumplido" con notas de hasta 280 caracteres', async () => {
      const nota = 'Buena proteína pero cené pizza fuera del plan.';
      const resParcial = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-01',
          semaforo: SemaforoNutricional.PARCIAL,
          notasAlumno: nota,
        },
        enVentanaCaracas('2026-09-01')
      );

      expect(resParcial.checkin.semaforo).toBe(SemaforoNutricional.PARCIAL);
      expect(resParcial.checkin.notasAlumno).toBe(nota);

      const resNoCumplido = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-02',
          semaforo: SemaforoNutricional.NO_CUMPLIDO,
          notasAlumno: 'Día libre / cumpleaños',
        },
        enVentanaCaracas('2026-09-02')
      );

      expect(resNoCumplido.checkin.semaforo).toBe(SemaforoNutricional.NO_CUMPLIDO);
    });

    it('debe rechazar notas del alumno que superen 280 caracteres', async () => {
      await expect(
        nutricionService.registrarCheckinDiario(
          alumnoId1,
          {
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            notasAlumno: 'A'.repeat(281),
          },
          enVentanaCaracas('2026-09-06')
        )
      ).rejects.toThrow();
    });
  });

  describe('2. Diario Fotográfico de Comidas (RN-03)', () => {
    it('debe persistir hasta 4 fotografías de comidas asociadas al check-in', async () => {
      const resultado = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          fotosPlatos: [
            { tipoComida: TipoComida.DESAYUNO, storageKey: 'r2/comidas/desayuno_1.webp' },
            { tipoComida: TipoComida.ALMUERZO, storageKey: 'r2/comidas/almuerzo_1.webp' },
            { tipoComida: TipoComida.CENA, storageKey: 'r2/comidas/cena_1.webp' },
            { tipoComida: TipoComida.SNACK, storageKey: 'r2/comidas/snack_1.webp' },
          ],
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(resultado.checkin.fotosPlatos.length).toBe(4);
      expect(resultado.checkin.fotosPlatos[0].tipoComida).toBe(TipoComida.DESAYUNO);
      expect(resultado.checkin.fotosPlatos[1].tipoComida).toBe(TipoComida.ALMUERZO);
    });

    it('debe rechazar intentos de enviar más de 4 fotografías de platos por día (RN-03)', async () => {
      await expect(
        nutricionService.registrarCheckinDiario(
          alumnoId1,
          {
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            fotosPlatos: [
              { tipoComida: TipoComida.DESAYUNO, storageKey: 'r2/f1.webp' },
              { tipoComida: TipoComida.ALMUERZO, storageKey: 'r2/f2.webp' },
              { tipoComida: TipoComida.CENA, storageKey: 'r2/f3.webp' },
              { tipoComida: TipoComida.SNACK, storageKey: 'r2/f4.webp' },
              { tipoComida: TipoComida.SNACK, storageKey: 'r2/f5.webp' },
            ],
          },
          enVentanaCaracas('2026-09-06')
        )
      ).rejects.toThrow();
    });
  });

  describe('3. Metas del coach (RN-01) y Tolerancia ±10% real (Escenario 3)', () => {
    const metasCoach: MetasNutricionalesCoach = {
      caloriasObjetivo: 2000,
      proteinaGramosObjetivo: 150,
      aguaLitrosObjetivo: '2.50',
    };

    it('evaluarToleranciaNutricional calcula desviaciones y margen con ambos totales', () => {
      const tol = evaluarToleranciaNutricional(2100, 155, metasCoach);
      expect(tol.dentroMargenTolerancia).toBe(true);
      expect(tol.desviacionCaloriasPct).toBe(5);
      expect(tol.desviacionProteinasPct).toBe(3.33);

      const fuera = evaluarToleranciaNutricional(2000, 110, metasCoach);
      expect(fuera.dentroMargenTolerancia).toBe(false);
      expect(fuera.desviacionProteinasPct).toBe(-26.67);
    });

    it('el borde exacto ±10% entra en el margen y cualquier punto por encima no', () => {
      expect(evaluarToleranciaNutricional(2200, 150, metasCoach).dentroMargenTolerancia).toBe(true);
      expect(evaluarToleranciaNutricional(2201, 150, metasCoach).dentroMargenTolerancia).toBe(false);
      expect(evaluarToleranciaNutricional(1800, 165, metasCoach).dentroMargenTolerancia).toBe(true);
    });

    it('sin metas del coach, o sin totales reportados, no se evalúa (nunca un falso OK)', () => {
      expect(evaluarToleranciaNutricional(2100, 155, undefined)).toEqual({});

      const sinTotales = evaluarToleranciaNutricional(null, undefined, metasCoach);
      expect(sinTotales.dentroMargenTolerancia).toBeUndefined();
      expect(sinTotales.desviacionCaloriasPct).toBeUndefined();
    });

    it('evalúa solo las dimensiones con meta configurada (metas parciales)', () => {
      const soloCalorias = evaluarToleranciaNutricional(2100, 999, {
        caloriasObjetivo: 2000,
      });
      expect(soloCalorias.dentroMargenTolerancia).toBe(true);
      expect(soloCalorias.desviacionCaloriasPct).toBe(5);
      expect(soloCalorias.desviacionProteinasPct).toBeUndefined();
    });

    it('registrar un check-in compara contra las metas REALES persistidas del alumno', async () => {
      await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
        caloriasObjetivo: 2000,
        proteinaGramosObjetivo: 150,
        aguaLitrosObjetivo: '2.50',
      });

      const res = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          caloriasReportadas: 2100,
          proteinaGramosReportada: 155,
          aguaLitros: '2.50',
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(res.dentroMargenTolerancia).toBe(true);
      expect(res.desviacionCaloriasPct).toBe(5);
      expect(res.desviacionProteinasPct).toBe(3.33);
      expect(res.checkin.aguaLitros).toBe('2.50');
    });

    it('sin metas persistidas el resultado expuesto queda "sin evaluar"', async () => {
      const res = await nutricionService.registrarCheckinDiario(
        alumnoId2,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.PARCIAL,
          caloriasReportadas: 2400,
          proteinaGramosReportada: 150,
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(res.dentroMargenTolerancia).toBeUndefined();
      expect(res.desviacionCaloriasPct).toBeUndefined();
      expect(res.desviacionProteinasPct).toBeUndefined();
    });

    it('el coach define metas (PUT) y el alumno las consulta; el reemplazo limpia lo omitido', async () => {
      const creadas = await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
        caloriasObjetivo: 2000,
        proteinaGramosObjetivo: 150,
        carbohidratosGramosObjetivo: 250,
        grasasGramosObjetivo: 60,
        aguaLitrosObjetivo: '2.50',
        recursos: [{ titulo: 'Lista de compras', url: 'https://r2.guachafit.test/lista.pdf' }],
      });

      expect(creadas.caloriasObjetivo).toBe(2000);
      expect(creadas.recursos).toHaveLength(1);

      const consultadas = await nutricionService.obtenerMetasNutricionales(alumnoId1);
      expect(consultadas?.id).toBe(creadas.id);
      expect(consultadas?.aguaLitrosObjetivo).toBe('2.50');

      // PUT semántica de reemplazo: proteína omitida → NULL, nunca 0 fabricado.
      const reemplazadas = await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
        caloriasObjetivo: 2200,
      });
      expect(reemplazadas.id).toBe(creadas.id);
      expect(reemplazadas.caloriasObjetivo).toBe(2200);
      expect(reemplazadas.proteinaGramosObjetivo).toBeNull();
      expect(reemplazadas.recursos).toEqual([]);
    });

    it('un coach NO puede definir ni consultar metas de un alumno ajeno (tenancy)', async () => {
      await expect(
        nutricionService.definirMetasNutricionales(coachId2, alumnoId1, { caloriasObjetivo: 2000 })
      ).rejects.toThrow(ForbiddenException);

      await expect(nutricionService.obtenerMetasDeAlumno(coachId2, alumnoId1)).rejects.toThrow(
        ForbiddenException
      );

      // El coach dueño sí puede (y aún no hay metas: null honesto, no un objeto vacío fabricado).
      await expect(nutricionService.obtenerMetasDeAlumno(coachId1, alumnoId1)).resolves.toBeNull();
    });

    it('rechaza metas sin ningún campo declarado (Zod) y URLs de recursos inválidas', async () => {
      await expect(nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {})).rejects.toThrow();

      await expect(
        nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
          recursos: [{ titulo: 'PDF roto', url: 'no-es-una-url' }],
        })
      ).rejects.toThrow();
    });

    it('el controller valida el cuerpo con 400 (no un 500 de ZodError crudo)', async () => {
      const req = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };

      await expect(nutricionController.definirMetasAlumno(req, alumnoId1, {})).rejects.toThrow(
        BadRequestException
      );

      await expect(
        nutricionController.definirMetasAlumno(req, alumnoId1, { caloriasObjetivo: 12000 })
      ).resolves.toEqual(expect.objectContaining({ caloriasObjetivo: 12000 }));
    });
  });

  describe('4. Ventana horaria del check-in (RN-02: 18:00–23:59 hora local)', () => {
    it('acepta a las 18:00 locales y rechaza a las 17:59', () => {
      const aLas18 = evaluarVentanaCheckinNutricional(
        '2026-09-06',
        'America/Caracas',
        new Date('2026-09-06T22:00:00.000Z')
      );
      expect(aLas18.permitido).toBe(true);
      expect(aLas18.horaLocal).toBe(18);

      const aLas1759 = evaluarVentanaCheckinNutricional(
        '2026-09-06',
        'America/Caracas',
        new Date('2026-09-06T21:59:00.000Z')
      );
      expect(aLas1759.permitido).toBe(false);
      expect(aLas1759.motivo).toBe('FUERA_DE_VENTANA');
    });

    it('acepta a las 23:59 locales y rechaza a las 00:00 del día siguiente', () => {
      const aLas2359 = evaluarVentanaCheckinNutricional(
        '2026-09-06',
        'America/Caracas',
        new Date('2026-09-07T03:59:00.000Z')
      );
      expect(aLas2359.permitido).toBe(true);
      expect(aLas2359.horaLocal).toBe(23);

      const medianoche = evaluarVentanaCheckinNutricional(
        '2026-09-07',
        'America/Caracas',
        new Date('2026-09-07T04:00:00.000Z')
      );
      expect(medianoche.permitido).toBe(false);
      expect(medianoche.motivo).toBe('FUERA_DE_VENTANA');
    });

    it('rechaza una fecha que no es el día local en curso', () => {
      const ayer = evaluarVentanaCheckinNutricional(
        '2026-09-05',
        'America/Caracas',
        new Date('2026-09-07T02:00:00.000Z')
      );
      expect(ayer.permitido).toBe(false);
      expect(ayer.motivo).toBe('FECHA_DISTINTA_AL_DIA_LOCAL');
      expect(ayer.fechaLocalHoy).toBe('2026-09-06');
    });

    it('respeta la zona horaria del cliente (mismo instante en Madrid y Caracas)', () => {
      const instante = new Date('2026-09-06T20:00:00.000Z'); // 22:00 Madrid / 16:00 Caracas
      expect(evaluarVentanaCheckinNutricional('2026-09-06', 'Europe/Madrid', instante).permitido).toBe(
        true
      );
      expect(
        evaluarVentanaCheckinNutricional('2026-09-06', 'America/Caracas', instante).permitido
      ).toBe(false);
    });

    it('usa America/Caracas cuando la zona falta o es inválida', () => {
      expect(resolverTimezoneNutricion(undefined)).toBe('America/Caracas');
      expect(resolverTimezoneNutricion('No/Existe')).toBe('America/Caracas');
      expect(resolverTimezoneNutricion('Europe/Madrid')).toBe('Europe/Madrid');
    });

    it('el servicio rechaza el check-in fuera de ventana con BadRequest (no persiste)', async () => {
      await expect(
        nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          new Date('2026-09-06T15:00:00.000Z') // 11:00 Caracas
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockCheckinsNutricionales).toHaveLength(0);
    });

    it('el controller propaga el rechazo de ventana del servicio', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-06T15:00:00.000Z')); // 11:00 Caracas
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };

      await expect(
        nutricionController.registrarCheckinDiario(req, {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('5. "No reportado" del calendario nutricional (RF-002 §6)', () => {
    it('enumera el rango inclusivo de fechas y tolera rangos inválidos', () => {
      const semana = enumerarFechasCalendario('2026-09-15', '2026-09-21');
      expect(semana).toHaveLength(7);
      expect(semana[0]).toBe('2026-09-15');
      expect(semana[6]).toBe('2026-09-21');

      expect(enumerarFechasCalendario('2026-09-21', '2026-09-15')).toEqual([]);
      expect(enumerarFechasCalendario('ayer', '2026-09-15')).toEqual([]);
    });

    it('cuenta como no reportados solo los días cerrados sin check-in', () => {
      const reportadas = new Set(['2026-09-15', '2026-09-17']);
      expect(contarDiasNoReportados('2026-09-15', '2026-09-21', reportadas)).toBe(5);
      expect(contarDiasNoReportados('2026-09-15', '2026-09-21', new Set())).toBe(7);
    });
  });

  describe('6. Unicidad Diaria (uq_checkin_nutricional_diario)', () => {
    it('debe rechazar un segundo check-in para el mismo alumno en la misma fecha calendario', async () => {
      await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
        enVentanaCaracas('2026-09-06')
      );

      await expect(
        nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.PARCIAL },
          enVentanaCaracas('2026-09-06')
        )
      ).rejects.toThrow(ConflictException);
    });

    it('debe permitir check-ins en fechas distintas para el mismo alumno', async () => {
      const d1 = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
        enVentanaCaracas('2026-09-06')
      );
      const d2 = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-07', semaforo: SemaforoNutricional.PARCIAL },
        enVentanaCaracas('2026-09-07')
      );

      expect(d1.checkin.fecha).toBe('2026-09-06');
      expect(d2.checkin.fecha).toBe('2026-09-07');
    });

    it('debe permitir check-ins en la misma fecha para diferentes alumnos (Multi-tenant)', async () => {
      const c1 = await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
        enVentanaCaracas('2026-09-06')
      );
      const c2 = await nutricionService.registrarCheckinDiario(
        alumnoId2,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.NO_CUMPLIDO },
        enVentanaCaracas('2026-09-06')
      );

      expect(c1.checkin.alumnoId).toBe(alumnoId1);
      expect(c2.checkin.alumnoId).toBe(alumnoId2);
    });
  });

  describe('7. Consulta de Check-in y Listado de Historial', () => {
    it('obtenerCheckinHoy debe devolver el reporte de hoy o null si no existe', async () => {
      const vacio = await nutricionService.obtenerCheckinHoy(alumnoId1, '2026-09-06');
      expect(vacio).toBeNull();

      await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
        enVentanaCaracas('2026-09-06')
      );

      const encontrado = await nutricionService.obtenerCheckinHoy(alumnoId1, '2026-09-06');
      expect(encontrado).not.toBeNull();
      expect(encontrado?.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('sin fecha explícita, "hoy" se resuelve en la zona del alumno (RN-05), no en UTC', async () => {
      vi.useFakeTimers();
      // 2026-09-07T02:00Z = 2026-09-06 22:00 en America/Caracas (UTC-4).
      vi.setSystemTime(new Date('2026-09-07T02:00:00.000Z'));

      await nutricionService.registrarCheckinDiario(
        alumnoId1,
        { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
        new Date('2026-09-07T02:30:00.000Z')
      );

      const encontrado = await nutricionService.obtenerCheckinHoy(alumnoId1);
      expect(encontrado?.fecha).toBe('2026-09-06');

      // El día UTC ya es 2026-09-07: resolver con UTC habría devuelto null.
      expect(new Date().toISOString().split('T')[0]).toBe('2026-09-07');
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

  describe('8. NutricionController: Endpoints y Códigos HTTP', () => {
    it('POST /nutricion/checkin-diario retorna 201 Created', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-07T02:00:00.000Z')); // 22:00 Caracas del 2026-09-06
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const res = await nutricionController.registrarCheckinDiario(req, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
        aguaLitros: '2.00',
        timezoneCliente: 'America/Caracas',
      });

      expect(res.checkin).toBeDefined();
      expect(res.checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
    });

    it('POST con fecha malformada responde 400 del contrato (no ZodError crudo)', async () => {
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };

      await expect(
        nutricionController.registrarCheckinDiario(req, {
          fecha: '06-09-2026',
          semaforo: SemaforoNutricional.CUMPLIDO,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('GET /nutricion/checkin/hoy retorna reporte del alumno o 204 sin reporte', async () => {
      const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const res = await nutricionController.obtenerCheckinHoy(req, '2026-09-06');
      expect(res).toBeNull();

      const resStatus = { status: vi.fn() };
      const sinReporte = await nutricionController.obtenerCheckinHoy(
        req,
        undefined,
        'America/Caracas',
        resStatus
      );
      expect(sinReporte).toBeNull();
      expect(resStatus.status).toHaveBeenCalledWith(204);
    });

    it('GET /nutricion/alumnos/:alumnoId/checkins retorna lista de check-ins', async () => {
      const req = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };
      const res = await nutricionController.listarCheckins(req, alumnoId1, {});
      expect(Array.isArray(res)).toBe(true);
    });

    it('GET /nutricion/metas (alumno) devuelve sus metas o 204 sin configurar', async () => {
      const reqAlumno = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
      const resStatus = { status: vi.fn() };

      expect(await nutricionController.obtenerMisMetas(reqAlumno, resStatus)).toBeNull();
      expect(resStatus.status).toHaveBeenCalledWith(204);

      await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
        caloriasObjetivo: 2000,
      });

      const metas = await nutricionController.obtenerMisMetas(reqAlumno);
      expect(metas?.caloriasObjetivo).toBe(2000);
    });

    it('GET /nutricion/alumnos/:alumnoId/metas (coach) respeta tenancy y responde 204 sin metas', async () => {
      const reqCoach = { user: { sub: coachId1, rol: Rol.ENTRENADOR, entrenadorId: coachId1 } };
      const reqAjeno = { user: { sub: coachId2, rol: Rol.ENTRENADOR, entrenadorId: coachId2 } };

      const resStatus = { status: vi.fn() };
      expect(
        await nutricionController.obtenerMetasAlumno(reqCoach, alumnoId1, resStatus)
      ).toBeNull();
      expect(resStatus.status).toHaveBeenCalledWith(204);

      await expect(
        nutricionController.obtenerMetasAlumno(reqAjeno, alumnoId1, { status: vi.fn() })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('9. URL de lectura de las fotos de platos (RF-002 RN-03, bóveda R2)', () => {
    const storageKeyComida =
      'comidas/a1111111-1111-4111-8111-111111111111/2026-09-06/aaaaaaaa-1111-4111-8111-111111111111.webp';

    it('hidrata `fotoUrl` con la firma de la bóveda en el check-in y en el listado del coach', async () => {
      const r2Fake = {
        generarPresignedGetUrl: vi.fn(
          async (storageKey: string) => `https://r2.example/${storageKey}?firma=temporal`
        ),
      };
      const servicio = new NutricionService(createMockDb(), r2Fake as any);

      const res = await servicio.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          fotosPlatos: [{ tipoComida: TipoComida.ALMUERZO, storageKey: storageKeyComida }],
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(res.checkin.fotosPlatos).toHaveLength(1);
      expect(res.checkin.fotosPlatos[0].fotoUrl).toContain('firma=temporal');
      expect(r2Fake.generarPresignedGetUrl).toHaveBeenCalledWith(storageKeyComida, 900);

      const lista = await servicio.listarCheckins(coachId1, alumnoId1, {}, Rol.ENTRENADOR);
      expect(lista[0].fotosPlatos[0].fotoUrl).toContain('firma=temporal');
    });

    it('sin bóveda inyectada, `fotoUrl` queda null (nunca un enlace fabricado)', async () => {
      const servicio = new NutricionService(createMockDb());

      const res = await servicio.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.CUMPLIDO,
          fotosPlatos: [{ tipoComida: TipoComida.CENA, storageKey: storageKeyComida }],
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(res.checkin.fotosPlatos[0].fotoUrl).toBeNull();
    });

    it('si la firma falla, el check-in se devuelve con `fotoUrl` null y no rompe la respuesta', async () => {
      const r2Caido = {
        generarPresignedGetUrl: vi.fn().mockRejectedValue(new Error('R2 no disponible')),
      };
      const servicio = new NutricionService(createMockDb(), r2Caido as any);

      const res = await servicio.registrarCheckinDiario(
        alumnoId1,
        {
          fecha: '2026-09-06',
          semaforo: SemaforoNutricional.PARCIAL,
          fotosPlatos: [{ tipoComida: TipoComida.DESAYUNO, storageKey: storageKeyComida }],
        },
        enVentanaCaracas('2026-09-06')
      );

      expect(res.checkin.fotosPlatos[0].storageKey).toBe(storageKeyComida);
      expect(res.checkin.fotosPlatos[0].fotoUrl).toBeNull();
    });
  });
});
