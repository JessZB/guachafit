import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NutricionService,
  evaluarToleranciaNutricional,
  MetasNutricionalesCoach,
} from '../../src/modules/nutricion/nutricion.service';
// Ronda 1 (LOTE API-N2): las reglas puras de tiempo viven en su propio módulo.
import {
  contarDiasNoReportados,
  enumerarFechasCalendario,
  evaluarRecepcionCheckinNutricional,
  evaluarVentanaCheckinNutricional,
  resolverTimezoneNutricion,
  ultimoDiaNutricionalCerrado,
} from '../../src/modules/nutricion/nutricion-tiempo.util';
import { sumarDiasCalendario } from '../../src/common/adherencia.util';
import { sumarDiasCalendario as sumarDiasCalendarioAntropometria } from '../../src/modules/antropometria/antropometria-periodicidad.util';
import { NutricionController } from '../../src/modules/nutricion/nutricion.controller';
import {
  Rol,
  SemaforoNutricional,
  TipoComida,
  EstadoAlumno,
  CODIGO_CHECKIN_YA_REGISTRADO,
  MENSAJE_CHECKIN_YA_REGISTRADO,
  MENSAJE_FOTO_COMIDA_NO_ASOCIABLE,
  MENSAJE_AGUA_LITROS,
  AGUA_LITROS_MAXIMO,
  MENSAJE_FECHA_CALENDARIO,
  MENSAJE_RANGO_CHECKINS_EXCEDIDO,
  MENSAJE_RANGO_FECHAS_INVERTIDO,
  RANGO_MAXIMO_DIAS_CHECKINS_NUTRICIONALES,
  MENSAJE_URL_RECURSO,
  MENSAJE_NOTAS_ALUMNO_MAXIMO,
  MENSAJE_MAX_FOTOS_PLATOS_DIA,
  MAX_FOTOS_PLATOS_DIA,
  CheckinNutricionalSchema,
} from '@guachafit/shared';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN,
  MENSAJE_CHECKIN_DIA_CAMBIADO,
  MENSAJE_CHECKIN_FUERA_DE_PLAZO,
  MENSAJE_CHECKIN_FUERA_DE_VENTANA,
  MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO,
} from '@guachafit/shared';

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
      // RNF-003/ADR-011 (etapa 3): withTenant() aplica el GUC con set_config sobre el tx.
      execute: vi.fn(async () => undefined),
    };
    return db;
  }

  const coachId1 = 'c1111111-1111-4111-8111-111111111111';
  const coachId2 = 'c2222222-2222-4222-8222-222222222222';
  const alumnoId1 = 'a1111111-1111-4111-8111-111111111111';
  const alumnoId2 = 'a2222222-2222-4222-8222-222222222222';

  /** Clave real de foto de plato, como la emite el presign del módulo `comidas` (ADR-007). */
  function claveFotoComida(alumnoId: string, n: number, fecha = '2026-09-06'): string {
    return `comidas/${alumnoId}/${fecha}/aaaaaaaa-1111-4111-8111-00000000000${n}.webp`;
  }

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
            { tipoComida: TipoComida.DESAYUNO, storageKey: claveFotoComida(alumnoId1, 1) },
            { tipoComida: TipoComida.ALMUERZO, storageKey: claveFotoComida(alumnoId1, 2) },
            { tipoComida: TipoComida.CENA, storageKey: claveFotoComida(alumnoId1, 3) },
            { tipoComida: TipoComida.SNACK, storageKey: claveFotoComida(alumnoId1, 4) },
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
              { tipoComida: TipoComida.DESAYUNO, storageKey: claveFotoComida(alumnoId1, 1) },
              { tipoComida: TipoComida.ALMUERZO, storageKey: claveFotoComida(alumnoId1, 2) },
              { tipoComida: TipoComida.CENA, storageKey: claveFotoComida(alumnoId1, 3) },
              { tipoComida: TipoComida.SNACK, storageKey: claveFotoComida(alumnoId1, 4) },
              { tipoComida: TipoComida.SNACK, storageKey: claveFotoComida(alumnoId1, 5) },
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

    it('RNF-001: rechaza un recurso con storageKey de OTRO alumno o de otro módulo (400)', async () => {
      const keyAjena = `nutricion-recursos/${alumnoId2}/2026/aaaaaaaa-1111-4111-8111-111111111111.pdf`;
      await expect(
        nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
          recursos: [{ titulo: 'PDF ajeno', storageKey: keyAjena }],
        })
      ).rejects.toThrow(BadRequestException);

      const keyDeOtroModulo = `comidas/${alumnoId1}/2026-09-06/aaaaaaaa-1111-4111-8111-111111111111.webp`;
      await expect(
        nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
          recursos: [{ titulo: 'Foto como recurso', storageKey: keyDeOtroModulo }],
        })
      ).rejects.toThrow(BadRequestException);

      // El rechazo no persiste medias metas: la fila del alumno sigue sin existir.
      await expect(nutricionService.obtenerMetasNutricionales(alumnoId1)).resolves.toBeNull();
    });

    it('RNF-001: acepta un storageKey del alumno dueño y sin bóveda lo degrada con honestidad', async () => {
      const keyPropia = `nutricion-recursos/${alumnoId1}/2026/aaaaaaaa-1111-4111-8111-111111111111.pdf`;
      const guardadas = await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [{ titulo: 'Guía PDF', storageKey: keyPropia }],
      });

      expect(guardadas.recursos).toEqual([
        { titulo: 'Guía PDF', url: null, storageKey: keyPropia },
      ]);
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

    it('LOTE API-2: el rechazo de ventana lleva code CHECKIN_FUERA_DE_VENTANA y texto claro', async () => {
      let capturado: any;
      try {
        await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          new Date('2026-09-06T15:00:00.000Z') // 11:00 Caracas
        );
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(BadRequestException);
      expect(capturado.getResponse()).toMatchObject({
        statusCode: 400,
        // Literal a propósito: fija el contrato del cable con la web.
        // LOTE API-N2: la hora que cuenta es la de la zona del perfil (antes: "hora de tu teléfono").
        code: 'CHECKIN_FUERA_DE_VENTANA',
        message:
          'Puedes enviar el reporte de hoy entre las 18:00 y las 23:59 (hora de la zona horaria de tu perfil). Fuera de ese horario el día queda como «No reportado».',
      });
    });

    it('LOTE API-2 / API-N1: fecha distinta al día local → code estable y texto claro', async () => {
      let capturado: any;
      try {
        await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-05', semaforo: SemaforoNutricional.CUMPLIDO },
          enVentanaCaracas('2026-09-06')
        );
      } catch (error) {
        capturado = error;
      }
      expect(capturado).toBeInstanceOf(BadRequestException);
      expect(capturado.getResponse()).toMatchObject({
        statusCode: 400,
        // Literal a propósito: fija el contrato del cable con la web.
        code: 'CHECKIN_FUERA_DE_VENTANA',
        message:
          'El día de tu reporte ya cambió según la zona horaria de tu perfil. Actualiza la pantalla para ver el reporte de hoy.',
      });
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

    it('LOTE API-2: el 409 usa el mismo texto que la web ("Ya registraste tu reporte de hoy.")', async () => {
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
      ).rejects.toThrow(MENSAJE_CHECKIN_YA_REGISTRADO);
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

  describe('10. Recursos educativos con PDF subido (RF-002 RN-01, RNF-001)', () => {
    const keyPdfPropia = `nutricion-recursos/${alumnoId1}/2026/aaaaaaaa-1111-4111-8111-111111111111.pdf`;
    const urlExterna = 'https://r2.guachafit.test/lista-de-compras.pdf';

    it('resuelve el presigned GET del archivo subido y deja la URL externa tal cual (shape mixto)', async () => {
      const r2Fake = {
        generarPresignedGetUrl: vi.fn(
          async (storageKey: string) => `https://r2.example/${storageKey}?firma=temporal`
        ),
      };
      const servicio = new NutricionService(createMockDb(), r2Fake as any);

      const guardadas = await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [
          { titulo: 'Lista externa', url: urlExterna },
          { titulo: 'Guía PDF', storageKey: keyPdfPropia },
        ],
      });

      expect(guardadas.recursos).toEqual([
        { titulo: 'Lista externa', url: urlExterna, storageKey: null },
        {
          titulo: 'Guía PDF',
          url: `https://r2.example/${keyPdfPropia}?firma=temporal`,
          storageKey: keyPdfPropia,
        },
      ]);
      expect(r2Fake.generarPresignedGetUrl).toHaveBeenCalledWith(keyPdfPropia, 900);

      // Alumno (sus metas) y coach (cartera) pasan por el mismo resolutor de lectura.
      const consultadas = await servicio.obtenerMetasNutricionales(alumnoId1);
      expect(consultadas?.recursos[1].url).toContain('firma=temporal');

      const delCoach = await servicio.obtenerMetasDeAlumno(coachId1, alumnoId1);
      expect(delCoach?.recursos[1].url).toContain('firma=temporal');
      expect(delCoach?.recursos[0].url).toBe(urlExterna);
    });

    it('si la firma falla, el recurso queda con `url` null y la clave conservada (no rompe la lectura)', async () => {
      const r2Caido = {
        generarPresignedGetUrl: vi.fn().mockRejectedValue(new Error('bóveda caída')),
      };
      const servicio = new NutricionService(createMockDb(), r2Caido as any);

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [{ titulo: 'Guía PDF', storageKey: keyPdfPropia }],
      });

      const consultadas = await servicio.obtenerMetasNutricionales(alumnoId1);
      expect(consultadas?.recursos[0]).toEqual({
        titulo: 'Guía PDF',
        url: null,
        storageKey: keyPdfPropia,
      });
    });

    function bovedaConBorrado() {
      return {
        generarPresignedGetUrl: vi.fn(
          async (storageKey: string) => `https://r2.example/${storageKey}?firma=temporal`
        ),
        eliminarObjeto: vi.fn().mockResolvedValue(undefined),
      };
    }

    it('RNF-001: el PUT-replace borra el PDF que dejó de estar referenciado y jamás el conservado', async () => {
      const r2Fake = bovedaConBorrado();
      const servicio = new NutricionService(createMockDb(), r2Fake as any);
      const keyRemovida = `nutricion-recursos/${alumnoId1}/2026/bbbbbbbb-2222-4222-8222-222222222222.pdf`;

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [
          { titulo: 'Guía conservada', storageKey: keyPdfPropia },
          { titulo: 'PDF que se quita', storageKey: keyRemovida },
        ],
      });

      const reemplazadas = await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [{ titulo: 'Guía conservada', storageKey: keyPdfPropia }],
      });

      expect(reemplazadas.recursos).toHaveLength(1);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledTimes(1);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledWith(keyRemovida);
      expect(r2Fake.eliminarObjeto).not.toHaveBeenCalledWith(keyPdfPropia);
    });

    it('RNF-001: `recursos` omitido en el PUT borra TODOS los PDFs previos (PUT-replace)', async () => {
      const r2Fake = bovedaConBorrado();
      const servicio = new NutricionService(createMockDb(), r2Fake as any);
      const keySegunda = `nutricion-recursos/${alumnoId1}/2026/bbbbbbbb-2222-4222-8222-222222222222.pdf`;

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [
          { titulo: 'Guía uno', storageKey: keyPdfPropia },
          { titulo: 'Guía dos', storageKey: keySegunda },
        ],
      });

      const reemplazadas = await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        caloriasObjetivo: 2200,
      });

      expect(reemplazadas.recursos).toEqual([]);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledTimes(2);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledWith(keyPdfPropia);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledWith(keySegunda);
    });

    it('RNF-001: si el borrado falla, el PUT responde igual (best-effort, sin lanzar)', async () => {
      const r2Fake = {
        generarPresignedGetUrl: vi.fn(
          async (storageKey: string) => `https://r2.example/${storageKey}?firma=temporal`
        ),
        eliminarObjeto: vi.fn().mockRejectedValue(new Error('bóveda caída')),
      };
      const servicio = new NutricionService(createMockDb(), r2Fake as any);

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [{ titulo: 'Guía PDF', storageKey: keyPdfPropia }],
      });

      await expect(
        servicio.definirMetasNutricionales(coachId1, alumnoId1, { caloriasObjetivo: 2100 })
      ).resolves.toEqual(expect.objectContaining({ caloriasObjetivo: 2100, recursos: [] }));

      expect(r2Fake.eliminarObjeto).toHaveBeenCalledWith(keyPdfPropia);
    });

    it('RNF-001: una clave ajena al prefijo del alumno nunca llega al borrado (tenancy)', async () => {
      const r2Fake = bovedaConBorrado();
      const servicio = new NutricionService(createMockDb(), r2Fake as any);
      const keyAjena = `nutricion-recursos/${alumnoId2}/2026/cccccccc-3333-4333-8333-333333333333.pdf`;

      // Fila previa simulada con una clave ajena (dato legado/corrupto): el guard de servicio
      // debe ignorarla aunque ya no esté referenciada por el PUT.
      mockMetasNutricionales.push({
        id: 'metas-previas',
        alumnoId: alumnoId1,
        caloriasObjetivo: 2000,
        proteinaGramosObjetivo: null,
        carbohidratosGramosObjetivo: null,
        grasasGramosObjetivo: null,
        aguaLitrosObjetivo: null,
        recursos: [
          { titulo: 'Propia', storageKey: keyPdfPropia },
          { titulo: 'Ajena', storageKey: keyAjena },
        ],
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, { caloriasObjetivo: 2100 });

      expect(r2Fake.eliminarObjeto).toHaveBeenCalledTimes(1);
      expect(r2Fake.eliminarObjeto).toHaveBeenCalledWith(keyPdfPropia);
      expect(r2Fake.eliminarObjeto).not.toHaveBeenCalledWith(keyAjena);
    });

    it('RNF-001: si la relectura anti-race falla, el PUT sigue OK y no se borra nada (best-effort)', async () => {
      // Mock con una avería inyectada SOLO en la relectura de verificación post-commit: la
      // primera lectura de metas (fila previa) pasa; la segunda (relectura) revienta.
      const db = createMockDb();
      const selectOriginal = db.select;
      let fallarLecturaDeMetas = false;
      let lecturasDeMetas = 0;
      db.select = vi.fn((...args: any[]) => {
        const query = selectOriginal(...args);
        const fromOriginal = query.from;
        query.from = vi.fn((table: any) => {
          const builder = fromOriginal(table);
          if (fallarLecturaDeMetas && getTableName(table) === 'metas_nutricionales') {
            lecturasDeMetas += 1;
            if (lecturasDeMetas >= 2) {
              builder.limit = vi.fn(() => {
                throw new Error('lectura de metas caída tras el commit');
              });
            }
          }
          return builder;
        });
        return query;
      });

      const r2Fake = bovedaConBorrado();
      const servicio = new NutricionService(db, r2Fake as any);

      await servicio.definirMetasNutricionales(coachId1, alumnoId1, {
        recursos: [{ titulo: 'Guía PDF', storageKey: keyPdfPropia }],
      });

      fallarLecturaDeMetas = true;

      await expect(
        servicio.definirMetasNutricionales(coachId1, alumnoId1, { caloriasObjetivo: 2100 })
      ).resolves.toEqual(expect.objectContaining({ caloriasObjetivo: 2100, recursos: [] }));

      // Sin verificación de la fila actual no se borra a ciegas.
      expect(r2Fake.eliminarObjeto).not.toHaveBeenCalled();
    });
  });

  describe('11. LOTE API-N1: integridad y seguridad del reporte (RF-002)', () => {
    const MENSAJE_FOTO_AJENA = MENSAJE_FOTO_COMIDA_NO_ASOCIABLE;
    const MENSAJE_AGUA = MENSAJE_AGUA_LITROS;
    const MENSAJE_FECHA = MENSAJE_FECHA_CALENDARIO;

    async function capturar(promesa: Promise<unknown>): Promise<any> {
      try {
        await promesa;
      } catch (error) {
        return error;
      }
      throw new Error('Se esperaba un rechazo');
    }

    describe('Criterio 1: la foto del plato debe ser del alumno autenticado', () => {
      const clavesAjenas: Array<[string, string]> = [
        ['de otro alumno', claveFotoComida(alumnoId2, 1)],
        [
          'de antropometría del mismo alumno',
          `antropometria/${alumnoId1}/2026/aaaaaaaa-1111-4111-8111-000000000001.webp`,
        ],
        [
          'de recursos del mismo alumno',
          `nutricion-recursos/${alumnoId1}/2026/aaaaaaaa-1111-4111-8111-000000000001.pdf`,
        ],
        ['con estructura inválida', `comidas/${alumnoId1}/../otra/foto.webp`],
        ['falsa sin prefijo', 'r2/f1.webp'],
        ['demasiado larga', `comidas/${alumnoId1}/${'x'.repeat(260)}.webp`],
      ];

      for (const [caso, clave] of clavesAjenas) {
        it(`rechaza una clave ${caso} con 400 claro: nada se guarda ni se firma`, async () => {
          const r2Fake = { generarPresignedGetUrl: vi.fn(async () => 'https://r2.example/x') };
          const servicio = new NutricionService(createMockDb(), r2Fake as any);

          const error = await capturar(
            servicio.registrarCheckinDiario(
              alumnoId1,
              {
                fecha: '2026-09-06',
                semaforo: SemaforoNutricional.CUMPLIDO,
                fotosPlatos: [{ tipoComida: TipoComida.ALMUERZO, storageKey: clave }],
              },
              enVentanaCaracas('2026-09-06')
            )
          );

          expect(error).toBeInstanceOf(BadRequestException);
          expect(error.message).toBe(MENSAJE_FOTO_AJENA);
          expect(mockCheckinsNutricionales).toHaveLength(0);
          expect(mockFotosComida).toHaveLength(0);
          expect(r2Fake.generarPresignedGetUrl).not.toHaveBeenCalled();
        });
      }

      it('acepta la clave propia emitida por el presign de `comidas`', async () => {
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          {
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            fotosPlatos: [{ tipoComida: TipoComida.CENA, storageKey: claveFotoComida(alumnoId1, 1) }],
          },
          enVentanaCaracas('2026-09-06')
        );
        expect(res.checkin.fotosPlatos[0].storageKey).toBe(claveFotoComida(alumnoId1, 1));
      });
    });

    describe('Criterio 2: doble POST concurrente → 409, no 500', () => {
      function errorUnicidad(): Error {
        return Object.assign(
          new Error('duplicate key value violates unique constraint "uq_checkin_nutricional_diario"'),
          { code: '23505', constraint_name: 'uq_checkin_nutricional_diario' }
        );
      }

      it('la violación del índice único se traduce al mismo 409 de "ya registraste"', async () => {
        const db = createMockDb();
        db.transaction = vi.fn(async () => {
          throw errorUnicidad();
        });
        // LOTE API-N2: la lectura de la zona del perfil (RLS) no pasa por la transacción que falla;
        // así el fallo cae, como en producción, en la transacción del alta del reporte.
        const servicio = new NutricionService(db, undefined, (async (_ctx: any, fn: any) => fn(db)) as any);

        const error = await capturar(
          servicio.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
            enVentanaCaracas('2026-09-06')
          )
        );

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({
          statusCode: 409,
          code: CODIGO_CHECKIN_YA_REGISTRADO,
          message: MENSAJE_CHECKIN_YA_REGISTRADO,
        });
      });

      it('el 409 de la verificación previa lleva el mismo código y texto', async () => {
        await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          enVentanaCaracas('2026-09-06')
        );
        const error = await capturar(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.PARCIAL },
            enVentanaCaracas('2026-09-06')
          )
        );
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({
          statusCode: 409,
          // Literal a propósito: fija el contrato del cable con la web.
          code: 'CHECKIN_YA_REGISTRADO',
          message: MENSAJE_CHECKIN_YA_REGISTRADO,
        });
      });

      it('otro error de la base de datos no se disfraza de 409', async () => {
        const db = createMockDb();
        const caida = new Error('conexión perdida');
        db.transaction = vi.fn(async () => {
          throw caida;
        });
        // LOTE API-N2: la lectura de la zona del perfil (RLS) no pasa por la transacción que falla;
        // así el fallo cae, como en producción, en la transacción del alta del reporte.
        const servicio = new NutricionService(db, undefined, (async (_ctx: any, fn: any) => fn(db)) as any);

        await expect(
          servicio.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
            enVentanaCaracas('2026-09-06')
          )
        ).rejects.toBe(caida);
      });
    });

    describe('Criterio 3: validación sin 500 (agua, fechas reales y rango)', () => {
      it('el agua del reporte acepta hasta 20 L y rechaza más con mensaje claro', async () => {
        const ok = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, aguaLitros: '20' },
          enVentanaCaracas('2026-09-06')
        );
        expect(ok.checkin.aguaLitros).toBe('20');

        for (const agua of ['20.01', '99.99', '150', '2.555', 'dos']) {
          const error = await capturar(
            nutricionService.registrarCheckinDiario(
              alumnoId1,
              { fecha: '2026-09-07', semaforo: SemaforoNutricional.CUMPLIDO, aguaLitros: agua },
              enVentanaCaracas('2026-09-07')
            )
          );
          expect(error, agua).toBeInstanceOf(BadRequestException);
          expect(error.message, agua).toBe(MENSAJE_AGUA);
        }
      });

      it('la meta de agua del coach tiene el mismo tope y mensaje', async () => {
        const error = await capturar(
          nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
            aguaLitrosObjetivo: '21',
          })
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe(MENSAJE_AGUA);

        await expect(
          nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
            aguaLitrosObjetivo: '20.00',
          })
        ).resolves.toEqual(expect.objectContaining({ aguaLitrosObjetivo: '20.00' }));
      });

      it('GET checkin/hoy rechaza fechas que no existen en el calendario (400, no 500)', async () => {
        const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
        for (const fecha of ['2026-02-31', 'abc', '2026-13-01', '2026-9-6']) {
          const error = await capturar(nutricionController.obtenerCheckinHoy(req, fecha));
          expect(error, fecha).toBeInstanceOf(BadRequestException);
          expect(error.message, fecha).toBe(MENSAJE_FECHA);
        }
        // Una fecha real (29 de febrero de un año bisiesto) sigue funcionando.
        await expect(nutricionController.obtenerCheckinHoy(req, '2028-02-29')).resolves.toBeNull();
      });

      it('la lista rechaza desde/hasta que no son fechas reales', async () => {
        const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
        for (const query of [
          { desde: '2026-02-31', hasta: '2026-03-10' },
          { desde: '2026-02-01', hasta: 'abc' },
        ]) {
          const error = await capturar(nutricionController.listarCheckins(req, alumnoId1, query));
          expect(error, JSON.stringify(query)).toBeInstanceOf(BadRequestException);
          expect(error.message).toBe(MENSAJE_FECHA);
        }
      });

      it('la lista admite hasta 92 días y rechaza un rango mayor con mensaje claro', async () => {
        const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
        await expect(
          nutricionController.listarCheckins(req, alumnoId1, {
            desde: '2026-01-01',
            hasta: sumarDiasCalendario('2026-01-01', 91),
          })
        ).resolves.toEqual([]);

        const error = await capturar(
          nutricionController.listarCheckins(req, alumnoId1, {
            desde: '2026-01-01',
            hasta: sumarDiasCalendario('2026-01-01', 92),
          })
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe(MENSAJE_RANGO_CHECKINS_EXCEDIDO);

        // El servicio aplica el mismo tope aunque se le llame sin pasar por el controller.
        await expect(
          nutricionService.listarCheckins(
            coachId1,
            alumnoId1,
            { desde: '2025-01-01', hasta: '2026-01-01' },
            Rol.ENTRENADOR
          )
        ).rejects.toThrow(BadRequestException);
      });

      it('la lista rechaza un rango invertido', async () => {
        const req = { user: { sub: alumnoId1, rol: Rol.ALUMNO } };
        const error = await capturar(
          nutricionController.listarCheckins(req, alumnoId1, {
            desde: '2026-03-10',
            hasta: '2026-03-01',
          })
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe(MENSAJE_RANGO_FECHAS_INVERTIDO);
      });
    });

    describe('Ronda 1: una sola regla de fecha y textos derivados de las constantes', () => {
      it('POST con una fecha que no existe en el calendario → 400 con la regla única de fecha', async () => {
        for (const fecha of ['2026-02-31', '2026-13-01']) {
          const error = await capturar(
            nutricionService.registrarCheckinDiario(
              alumnoId1,
              { fecha, semaforo: SemaforoNutricional.CUMPLIDO },
              enVentanaCaracas('2026-09-06')
            )
          );
          expect(error, fecha).toBeInstanceOf(BadRequestException);
          expect(error.message, fecha).toBe(MENSAJE_FECHA_CALENDARIO);
        }
      });

      it('los textos de agua, rango y fotos salen de sus constantes', () => {
        expect(MENSAJE_AGUA_LITROS).toContain(`entre 0 y ${AGUA_LITROS_MAXIMO}`);
        expect(MENSAJE_RANGO_CHECKINS_EXCEDIDO).toContain(
          `hasta ${RANGO_MAXIMO_DIAS_CHECKINS_NUTRICIONALES} días`
        );
        expect(MENSAJE_MAX_FOTOS_PLATOS_DIA).toContain(`hasta ${MAX_FOTOS_PLATOS_DIA} fotos`);
        expect(MAX_FOTOS_PLATOS_DIA).toBe(4);
      });

      it('el tope de fotos del contrato es el mismo que el del servicio', () => {
        expect(
          CheckinNutricionalSchema.safeParse({
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            fotosPlatos: Array.from({ length: MAX_FOTOS_PLATOS_DIA + 1 }, (_, n) => ({
              tipoComida: TipoComida.SNACK,
              storageKey: claveFotoComida(alumnoId1, n),
            })),
          }).error?.issues[0].message
        ).toBe(MENSAJE_MAX_FOTOS_PLATOS_DIA);
      });
    });

    describe('Criterio 5: enlaces de recursos solo http/https', () => {
      for (const url of [
        'javascript:alert(1)',
        'data:text/html,hola',
        'ftp://r2.guachafit.test/lista.pdf',
        'file:///etc/passwd',
      ]) {
        it(`rechaza ${url.split(':')[0]}: con mensaje claro`, async () => {
          const error = await capturar(
            nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
              recursos: [{ titulo: 'Lista', url }],
            })
          );
          expect(error).toBeInstanceOf(BadRequestException);
          expect(error.message).toBe(MENSAJE_URL_RECURSO);
          expect(mockMetasNutricionales).toHaveLength(0);
        });
      }

      it('acepta http y https', async () => {
        const guardadas = await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
          recursos: [
            { titulo: 'Segura', url: 'https://r2.guachafit.test/lista.pdf' },
            { titulo: 'Plana', url: 'http://guachafit.test/guia' },
          ],
        });
        expect(guardadas.recursos).toHaveLength(2);
      });
    });

    describe('Criterio 6: mensajes claros con tuteo', () => {
      it('notas de más de 280 caracteres', async () => {
        const error = await capturar(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              notasAlumno: 'A'.repeat(281),
            },
            enVentanaCaracas('2026-09-06')
          )
        );
        expect(error.message).toBe(MENSAJE_NOTAS_ALUMNO_MAXIMO);
      });

      it('más de 4 fotos por día', async () => {
        const error = await capturar(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              fotosPlatos: [1, 2, 3, 4, 5].map((n) => ({
                tipoComida: TipoComida.SNACK,
                storageKey: claveFotoComida(alumnoId1, n),
              })),
            },
            enVentanaCaracas('2026-09-06')
          )
        );
        expect(error.message).toBe(MENSAJE_MAX_FOTOS_PLATOS_DIA);
      });

      it('una clave de foto demasiado corta usa el mismo mensaje de foto', async () => {
        const error = await capturar(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              fotosPlatos: [{ tipoComida: TipoComida.SNACK, storageKey: 'abc' }],
            },
            enVentanaCaracas('2026-09-06')
          )
        );
        expect(error.message).toBe(MENSAJE_FOTO_AJENA);
      });
    });
  });

  // ===========================================================================
  // LOTE API-N2 (RF-002, decisiones del dueño 2026-10-05): zona horaria del PERFIL, captura
  // offline tardía con plazo hasta las 12:00 del día siguiente y copia de metas por reporte.
  // ===========================================================================
  describe('12. LOTE API-N2: zona del perfil, captura offline tardía y metas del día', () => {
    async function capturarRechazo(promesa: Promise<unknown>): Promise<any> {
      try {
        await promesa;
      } catch (error) {
        return error;
      }
      throw new Error('Se esperaba un rechazo y la operación terminó bien.');
    }

    describe('Criterio 2: la ventana usa la zona del perfil, no `timezoneCliente`', () => {
      it('perfil en Madrid: a las 22:00 de Madrid se acepta aunque el cliente diga Caracas (16:00)', async () => {
        mockPerfilesAlumno[0].zonaHoraria = 'Europe/Madrid';
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          {
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            timezoneCliente: 'America/Caracas',
          },
          new Date('2026-09-06T20:00:00.000Z')
        );
        expect(res.checkin.fecha).toBe('2026-09-06');
        expect(res.checkin.zonaHoraria).toBe('Europe/Madrid');
      });

      it('perfil por defecto (Caracas): a las 16:00 de Caracas se rechaza aunque el cliente diga Madrid (22:00)', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              timezoneCliente: 'Europe/Madrid',
            },
            new Date('2026-09-06T20:00:00.000Z')
          )
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toMatchObject({ code: CODIGO_CHECKIN_FUERA_DE_VENTANA });
        expect(mockCheckinsNutricionales).toHaveLength(0);
      });

      it('el aviso de ventana ya no menciona la hora del teléfono (decide la zona del perfil)', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
            new Date('2026-09-06T15:00:00.000Z')
          )
        );
        expect(error.getResponse().message).toBe(MENSAJE_CHECKIN_FUERA_DE_VENTANA);
        expect(MENSAJE_CHECKIN_FUERA_DE_VENTANA).toBe(
          'Puedes enviar el reporte de hoy entre las 18:00 y las 23:59 (hora de la zona horaria de tu perfil). Fuera de ese horario el día queda como «No reportado».'
        );
      });

      it('checkin/hoy sin fecha resuelve el día con la zona del perfil e ignora `timezoneCliente`', async () => {
        mockPerfilesAlumno[0].zonaHoraria = 'Asia/Tokyo';
        // 2026-09-06T14:00Z = 23:00 del 06 en Tokio.
        await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          new Date('2026-09-06T14:00:00.000Z')
        );
        vi.useFakeTimers();
        // 2026-09-06T16:00Z = 01:00 del 07 en Tokio; 12:00 del 06 en Caracas.
        vi.setSystemTime(new Date('2026-09-06T16:00:00.000Z'));

        // Con Caracas (lo que dice el cliente) habría encontrado el reporte del 06.
        const hoy = await nutricionService.obtenerCheckinHoy(alumnoId1, undefined, 'America/Caracas');
        expect(hoy).toBeNull();
      });
    });

    describe('Criterio 3: captura offline tardía (`segundosDesdeCaptura`)', () => {
      // Perfil en Caracas (UTC-4) por defecto. Día 2026-09-06:
      //  - 22:00 locales = 2026-09-07T02:00Z (captura válida)
      //  - 12:00 locales del 07 = 2026-09-07T16:00Z (límite de recepción)
      // La hora de captura = recepción del SERVIDOR − segundosDesdeCaptura: el reloj del teléfono
      // nunca interviene, así que un teléfono adelantado o atrasado no altera el resultado.
      const capturaValida = '2026-09-07T02:00:00.000Z';
      const HORA = 3600;

      it('captura a las 22:00 y recepción a las 10:00 del día siguiente → se registra con su hora de captura', async () => {
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          {
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.PARCIAL,
            segundosDesdeCaptura: 12 * HORA,
          },
          new Date('2026-09-07T14:00:00.000Z')
        );
        expect(res.checkin.capturadoEnUtc).toBe(capturaValida);
        expect(mockCheckinsNutricionales[0].capturadoEnUtc).toEqual(new Date(capturaValida));
      });

      it('recepción exactamente a las 12:00:00 del día siguiente → todavía se acepta', async () => {
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, segundosDesdeCaptura: 14 * HORA },
          new Date('2026-09-07T16:00:00.000Z')
        );
        expect(res.checkin.capturadoEnUtc).toBe(capturaValida);
      });

      it('recepción a las 12:00:01 del día siguiente → 400 CHECKIN_FUERA_DE_PLAZO con el texto acordado', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, segundosDesdeCaptura: 14 * HORA + 1 },
            new Date('2026-09-07T16:00:01.000Z')
          )
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toMatchObject({
          statusCode: 400,
          code: CODIGO_CHECKIN_FUERA_DE_PLAZO,
          message:
            'Este reporte llegó después del mediodía del día siguiente, así que ya no se puede registrar. El día quedó como «No reportado».',
        });
        expect(MENSAJE_CHECKIN_FUERA_DE_PLAZO).toBe(error.getResponse().message);
        expect(mockCheckinsNutricionales).toHaveLength(0);
      });

      it('el plazo usa la zona del perfil: en Madrid las 12:00 del día siguiente son 10:00Z', async () => {
        mockPerfilesAlumno[0].zonaHoraria = 'Europe/Madrid';
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              // Recibido 12:30 en Madrid; capturado 14 h 30 min antes = 22:00 del 06 en Madrid.
              segundosDesdeCaptura: 14 * HORA + 1800,
            },
            new Date('2026-09-07T10:30:00.000Z')
          )
        );
        expect(error.getResponse()).toMatchObject({ code: CODIGO_CHECKIN_FUERA_DE_PLAZO });
      });

      it('captura fuera de 18:00–23:59 del día `fecha` → rechazo de ventana actual', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-06',
              semaforo: SemaforoNutricional.CUMPLIDO,
              segundosDesdeCaptura: 1.5 * HORA, // recibido 19:00 → capturado 17:30 en Caracas
            },
            new Date('2026-09-06T23:00:00.000Z')
          )
        );
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_CHECKIN_FUERA_DE_VENTANA,
          message: MENSAJE_CHECKIN_FUERA_DE_VENTANA,
        });
      });

      it('captura en un día distinto a `fecha` → rechazo de día cambiado', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            {
              fecha: '2026-09-05',
              semaforo: SemaforoNutricional.CUMPLIDO,
              segundosDesdeCaptura: HORA, // capturado 22:00 del 06
            },
            new Date('2026-09-07T03:00:00.000Z')
          )
        );
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_CHECKIN_FUERA_DE_VENTANA,
          message: MENSAJE_CHECKIN_DIA_CAMBIADO,
        });
      });

      it('sin `segundosDesdeCaptura` se usa y se guarda la hora del servidor', async () => {
        const ahora = enVentanaCaracas('2026-09-06');
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          ahora
        );
        expect(res.checkin.capturadoEnUtc).toBe(ahora.toISOString());
      });

      it('`segundosDesdeCaptura` = 0 equivale a la hora del servidor', async () => {
        const ahora = enVentanaCaracas('2026-09-06');
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, segundosDesdeCaptura: 0 },
          ahora
        );
        expect(res.checkin.capturadoEnUtc).toBe(ahora.toISOString());
      });

      it('sin el campo, recibir al día siguiente sigue siendo el rechazo de día cambiado (comportamiento actual)', async () => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
            new Date('2026-09-07T14:00:00.000Z')
          )
        );
        expect(error.getResponse()).toMatchObject({
          code: CODIGO_CHECKIN_FUERA_DE_VENTANA,
          message: MENSAJE_CHECKIN_DIA_CAMBIADO,
        });
      });

      it.each([
        ['negativo', -1],
        ['con decimales', 1.5],
        ['mayor que 48 h', MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN + 1],
        ['texto', 'ayer'],
      ])('`segundosDesdeCaptura` %s → 400 claro del contrato', async (_caso, valor) => {
        const error = await capturarRechazo(
          nutricionService.registrarCheckinDiario(
            alumnoId1,
            { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, segundosDesdeCaptura: valor } as any,
            enVentanaCaracas('2026-09-06')
          )
        );
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe(MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO);
        expect(mockCheckinsNutricionales).toHaveLength(0);
      });

      it('el máximo es 48 h (172800 s) y se acepta en el contrato', () => {
        expect(MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN).toBe(48 * HORA);
        expect(
          CheckinNutricionalSchema.safeParse({
            fecha: '2026-09-06',
            semaforo: SemaforoNutricional.CUMPLIDO,
            segundosDesdeCaptura: MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN,
          }).success
        ).toBe(true);
      });

      it('evaluarRecepcionCheckinNutricional es pura y explica el motivo', () => {
        expect(
          evaluarRecepcionCheckinNutricional({
            fecha: '2026-09-06',
            zonaHoraria: 'America/Caracas',
            recibidoEn: new Date('2026-09-07T16:00:01.000Z'),
            segundosDesdeCaptura: 14 * HORA + 1,
          })
        ).toMatchObject({ permitido: false, motivo: 'FUERA_DE_PLAZO' });
        const aceptada = evaluarRecepcionCheckinNutricional({
          fecha: '2026-09-06',
          zonaHoraria: 'America/Caracas',
          recibidoEn: new Date('2026-09-07T03:00:00.000Z'),
          segundosDesdeCaptura: HORA,
        });
        expect(aceptada.permitido).toBe(true);
        expect(aceptada.capturadoEn.toISOString()).toBe(capturaValida);
      });
    });

    describe('Ronda 1: bordes de tiempo con relojes fijos', () => {
      /** Evalúa una captura al instante (sin desfase): recibido = capturado. */
      function enInstante(fecha: string, instanteUtc: string, zonaHoraria = 'America/Caracas') {
        return evaluarRecepcionCheckinNutricional({
          fecha,
          zonaHoraria,
          recibidoEn: new Date(instanteUtc),
        });
      }

      /** Captura a las 22:00 locales del día (instante UTC dado) y recepción en `recibidoUtc`. */
      function capturadaYRecibida(
        fecha: string,
        capturaUtc: string,
        recibidoUtc: string,
        zonaHoraria: string
      ) {
        const segundos = (Date.parse(recibidoUtc) - Date.parse(capturaUtc)) / 1000;
        return evaluarRecepcionCheckinNutricional({
          fecha,
          zonaHoraria,
          recibidoEn: new Date(recibidoUtc),
          segundosDesdeCaptura: segundos,
        });
      }

      it('captura a las 18:00:00 y a las 23:59:59 se acepta; a las 17:59:59 se rechaza', () => {
        expect(enInstante('2026-09-06', '2026-09-06T22:00:00.000Z').permitido).toBe(true);
        expect(enInstante('2026-09-06', '2026-09-07T03:59:59.000Z').permitido).toBe(true);
        expect(enInstante('2026-09-06', '2026-09-06T21:59:59.000Z')).toMatchObject({
          permitido: false,
          motivo: 'FUERA_DE_VENTANA',
        });
      });

      it('recepción a las 12:00:00 del día siguiente se acepta; a las 12:00:01 queda fuera de plazo', () => {
        expect(
          capturadaYRecibida('2026-09-06', '2026-09-07T02:00:00.000Z', '2026-09-07T16:00:00.000Z', 'America/Caracas')
            .permitido
        ).toBe(true);
        expect(
          capturadaYRecibida('2026-09-06', '2026-09-07T02:00:00.000Z', '2026-09-07T16:00:01.000Z', 'America/Caracas')
        ).toMatchObject({ permitido: false, motivo: 'FUERA_DE_PLAZO' });
      });

      it('una `fecha` futura (mañana) se rechaza aunque sea de noche', () => {
        expect(enInstante('2026-09-07', '2026-09-07T02:00:00.000Z')).toMatchObject({
          permitido: false,
          motivo: 'FECHA_DISTINTA_AL_DIA_LOCAL',
        });
      });

      it('ultimoDiaNutricionalCerrado: a las 12:00:00 ayer sigue abierto; a las 12:00:01 ya cerró', () => {
        // 2026-09-22T16:00:00Z = 12:00:00 en Caracas.
        expect(ultimoDiaNutricionalCerrado(new Date('2026-09-22T16:00:00.000Z'), 'America/Caracas')).toBe(
          '2026-09-20'
        );
        expect(ultimoDiaNutricionalCerrado(new Date('2026-09-22T16:00:01.000Z'), 'America/Caracas')).toBe(
          '2026-09-21'
        );
      });

      it('una sola implementación de fechas: antropometría reexporta la común', () => {
        expect(sumarDiasCalendarioAntropometria).toBe(sumarDiasCalendario);
      });

      describe('Europe/Madrid con horario de verano', () => {
        it('marzo (29/03/2026, de UTC+1 a UTC+2): ventana y plazo siguen la hora local', () => {
          // Día 28 (UTC+1): captura 22:00 = 21:00Z. Plazo: 12:00 del 29 (ya UTC+2) = 10:00Z.
          expect(
            capturadaYRecibida('2026-03-28', '2026-03-28T21:00:00.000Z', '2026-03-29T10:00:00.000Z', 'Europe/Madrid')
              .permitido
          ).toBe(true);
          expect(
            capturadaYRecibida('2026-03-28', '2026-03-28T21:00:00.000Z', '2026-03-29T10:00:01.000Z', 'Europe/Madrid')
          ).toMatchObject({ permitido: false, motivo: 'FUERA_DE_PLAZO' });
          // Día 29 (UTC+2): la ventana abre a las 18:00 = 16:00Z.
          expect(enInstante('2026-03-29', '2026-03-29T16:00:00.000Z', 'Europe/Madrid').permitido).toBe(true);
          expect(enInstante('2026-03-29', '2026-03-29T15:59:59.000Z', 'Europe/Madrid').permitido).toBe(false);
          expect(ultimoDiaNutricionalCerrado(new Date('2026-03-29T10:00:00.000Z'), 'Europe/Madrid')).toBe(
            '2026-03-27'
          );
          expect(ultimoDiaNutricionalCerrado(new Date('2026-03-29T10:00:01.000Z'), 'Europe/Madrid')).toBe(
            '2026-03-28'
          );
        });

        it('octubre (25/10/2026, de UTC+2 a UTC+1): ventana y plazo siguen la hora local', () => {
          // Día 24 (UTC+2): captura 22:00 = 20:00Z. Plazo: 12:00 del 25 (ya UTC+1) = 11:00Z.
          expect(
            capturadaYRecibida('2026-10-24', '2026-10-24T20:00:00.000Z', '2026-10-25T11:00:00.000Z', 'Europe/Madrid')
              .permitido
          ).toBe(true);
          expect(
            capturadaYRecibida('2026-10-24', '2026-10-24T20:00:00.000Z', '2026-10-25T11:00:01.000Z', 'Europe/Madrid')
          ).toMatchObject({ permitido: false, motivo: 'FUERA_DE_PLAZO' });
          // Día 25 (UTC+1): la ventana abre a las 18:00 = 17:00Z.
          expect(enInstante('2026-10-25', '2026-10-25T17:00:00.000Z', 'Europe/Madrid').permitido).toBe(true);
          expect(enInstante('2026-10-25', '2026-10-25T16:59:59.000Z', 'Europe/Madrid').permitido).toBe(false);
          expect(ultimoDiaNutricionalCerrado(new Date('2026-10-25T11:00:00.000Z'), 'Europe/Madrid')).toBe(
            '2026-10-23'
          );
          expect(ultimoDiaNutricionalCerrado(new Date('2026-10-25T11:00:01.000Z'), 'Europe/Madrid')).toBe(
            '2026-10-24'
          );
        });
      });
    });

    describe('Criterio 4: copia de las metas vigentes en cada reporte', () => {
      it('guarda las metas del alumno al registrar y no cambian si el coach las edita después', async () => {
        await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, {
          caloriasObjetivo: 2000,
          proteinaGramosObjetivo: 150,
          carbohidratosGramosObjetivo: 250,
          grasasGramosObjetivo: 60,
          aguaLitrosObjetivo: '2.50',
        });

        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO, caloriasReportadas: 2100 },
          enVentanaCaracas('2026-09-06')
        );
        const metasEsperadas = {
          caloriasObjetivo: 2000,
          proteinaGramosObjetivo: 150,
          carbohidratosGramosObjetivo: 250,
          grasasGramosObjetivo: 60,
          aguaLitrosObjetivo: '2.50',
        };
        expect(res.checkin.metasVigentes).toEqual(metasEsperadas);
        expect(mockCheckinsNutricionales[0].metasVigentes).toEqual(metasEsperadas);

        await nutricionService.definirMetasNutricionales(coachId1, alumnoId1, { caloriasObjetivo: 3000 });

        const lista = await nutricionService.listarCheckins(coachId1, alumnoId1, {}, Rol.ENTRENADOR);
        expect(lista[0].metasVigentes).toEqual(metasEsperadas);
      });

      it('sin metas configuradas la copia queda en null', async () => {
        const res = await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          enVentanaCaracas('2026-09-06')
        );
        expect(res.checkin.metasVigentes).toBeNull();
        expect(mockCheckinsNutricionales[0].metasVigentes).toBeNull();
      });
    });

    describe('Criterio 5: lecturas con hora de captura, metas del día y zona usada', () => {
      it('checkin/hoy devuelve capturadoEnUtc, metasVigentes y zonaHoraria', async () => {
        mockPerfilesAlumno[0].zonaHoraria = 'America/Bogota';
        // 22:00 en Bogotá (UTC-5) del 06 = 2026-09-07T03:00Z
        await nutricionService.registrarCheckinDiario(
          alumnoId1,
          { fecha: '2026-09-06', semaforo: SemaforoNutricional.CUMPLIDO },
          new Date('2026-09-07T03:00:00.000Z')
        );
        const hoy = await nutricionService.obtenerCheckinHoy(alumnoId1, '2026-09-06');
        expect(hoy).toMatchObject({
          capturadoEnUtc: '2026-09-07T03:00:00.000Z',
          metasVigentes: null,
          zonaHoraria: 'America/Bogota',
        });
      });

      it('la lista del coach y la del alumno incluyen los tres datos; los reportes antiguos quedan en null', async () => {
        // Reporte antiguo (anterior a la migración): sin hora de captura ni copia de metas.
        mockCheckinsNutricionales.push({
          id: 'checkin-antiguo',
          alumnoId: alumnoId1,
          fecha: '2026-09-01',
          semaforo: SemaforoNutricional.PARCIAL,
          createdAtUtc: new Date('2026-09-02T02:00:00.000Z'),
          updatedAtUtc: new Date('2026-09-02T02:00:00.000Z'),
        });

        const delCoach = await nutricionService.listarCheckins(coachId1, alumnoId1, {}, Rol.ENTRENADOR);
        expect(delCoach[0]).toMatchObject({
          capturadoEnUtc: null,
          metasVigentes: null,
          zonaHoraria: 'America/Caracas',
        });

        const delAlumno = await nutricionService.listarCheckins(
          alumnoId1,
          alumnoId1,
          {},
          Rol.ALUMNO,
          alumnoId1
        );
        expect(delAlumno[0]).toMatchObject({
          capturadoEnUtc: null,
          metasVigentes: null,
          zonaHoraria: 'America/Caracas',
        });
      });
    });

    describe('Criterio 6: último día cerrado según el plazo del día siguiente', () => {
      it('antes de las 12:00 locales el día de ayer sigue abierto; después, queda cerrado', () => {
        // 2026-09-22T08:00Z = 04:00 en Caracas → ayer (21) aún puede reportarse.
        expect(ultimoDiaNutricionalCerrado(new Date('2026-09-22T08:00:00.000Z'), 'America/Caracas')).toBe(
          '2026-09-20'
        );
        // 2026-09-22T16:00:01Z = 12:00:01 en Caracas → el 21 ya cerró.
        expect(ultimoDiaNutricionalCerrado(new Date('2026-09-22T16:00:01.000Z'), 'America/Caracas')).toBe(
          '2026-09-21'
        );
        // Mismo instante de las 08:00Z en Tokio (17:00 del 22) → el 21 ya cerró.
        expect(ultimoDiaNutricionalCerrado(new Date('2026-09-22T08:00:00.000Z'), 'Asia/Tokyo')).toBe(
          '2026-09-21'
        );
      });
    });
  });
});
