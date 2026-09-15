import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  Rol,
  EstadoSesion,
} from '@guachafit/shared';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import {
  EntrenamientoService,
  calcularRangoSemanaIso,
  obtenerDiaSugeridoBloque,
} from '../../src/modules/entrenamiento/entrenamiento.service';
import { getTableName } from '@guachafit/database';

describe('BDD: RF-001 - Planificación Semanal Flexible por Bloques, Selección Libre y Auditoría (1 a 7 Días)', () => {
  const COACH_ID = '11111111-1111-4111-8111-111111111111';
  const ALUMNO_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockSesionesEntrenamiento: any[];
  let mockEjerciciosSesion: any[];
  let mockSeriesRegistro: any[];
  let mockEjerciciosCatalogo: any[];
  let mockRutinas: any[];

  let entrenamientoService: EntrenamientoService;
  let entrenamientoController: EntrenamientoController;

  function findOperator(chunks: any[]): 'gte' | 'lte' | 'eq' {
    for (const c of chunks) {
      if (typeof c === 'string') {
        if (c.includes('>=')) return 'gte';
        if (c.includes('<=')) return 'lte';
      }
      if (c && typeof c === 'object') {
        const val = Array.isArray(c.value) ? c.value.join(' ') : String(c.value || '');
        if (val.includes('>=')) return 'gte';
        if (val.includes('<=')) return 'lte';
      }
    }
    return 'eq';
  }

  function extractConditions(sqlObj: any): { column: string; value: any; op?: string }[] {
    const conditions: { column: string; value: any; op?: string }[] = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
          const op = findOperator(chunk.queryChunks);
          const colChunk = chunk.queryChunks.find(
            (c: any) => c && typeof c === 'object' && 'name' in c
          );
          const paramChunk = chunk.queryChunks.find(
            (c: any) => c && typeof c === 'object' && 'value' in c && !Array.isArray(c.value)
          );
          if (colChunk && paramChunk) {
            conditions.push({ column: colChunk.name, value: paramChunk.value, op });
          } else {
            traverse(chunk.queryChunks);
          }
        } else if (chunk && typeof chunk === 'object' && 'name' in chunk) {
          const subsequent = chunks.slice(i + 1);
          const nextParam = subsequent.find(
            (c: any) => c && 'value' in c && !Array.isArray(c.value)
          );
          if (nextParam) {
            conditions.push({ column: chunk.name, value: nextParam.value, op: 'eq' });
          }
        }
      }
    }

    if (sqlObj.queryChunks) {
      traverse(sqlObj.queryChunks);
    }
    return conditions;
  }

  function matchesField(record: any, cond: any): boolean {
    const col = cond.column;
    const val = cond.value;
    if (!col) return true;
    const key =
      record[col] !== undefined ? col : col.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase());
    if (cond.op === 'gte') {
      return record[key] >= val;
    }
    if (cond.op === 'lte') {
      return record[key] <= val;
    }
    return record[key] === val;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'rutinas') return mockRutinas;
    if (tableName === 'perfiles_alumno') return mockPerfilesAlumno;
    if (tableName === 'usuarios') return mockUsuarios;
    if (tableName === 'sesiones_entrenamiento') return mockSesionesEntrenamiento;
    if (tableName === 'ejercicios_sesion') return mockEjerciciosSesion;
    if (tableName === 'series_registro') return mockSeriesRegistro;
    if (tableName === 'ejercicios_catalogo') return mockEjerciciosCatalogo;
    return [];
  }

  function createMockDb() {
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          const chain: any = {
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              const filtered = targetArray.filter((item) =>
                conditions.length === 0 || conditions.every((cond) => matchesField(item, cond))
              );

              const innerChain: any = {
                orderBy: vi.fn(() => innerChain),
                limit: vi.fn((n: number) => filtered.slice(0, n)),
                then: (resolve: any) => resolve(filtered),
              };
              return innerChain;
            }),
            orderBy: vi.fn(() => chain),
            limit: vi.fn((n: number) => targetArray.slice(0, n)),
            then: (resolve: any) => resolve(targetArray),
          };
          return chain;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);
          const inserted = {
            id: vals.id || `id-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };
          targetArray.push(inserted);
          return {
            returning: vi.fn().mockResolvedValue([inserted]),
            then: (resolve: any) => resolve([inserted]),
          };
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((setVals: any) => ({
          where: vi.fn((predicate: any) => {
            const tableName = table ? getTableName(table) : '';
            const targetArray = getTableArray(tableName);
            const conditions = extractConditions(predicate);

            const affected: any[] = [];
            for (const item of targetArray) {
              if (conditions.length === 0 || conditions.every((c) => matchesField(item, c))) {
                Object.assign(item, setVals);
                affected.push(item);
              }
            }

            return {
              returning: vi.fn().mockResolvedValue(affected),
              then: (resolve: any) => resolve(affected),
            };
          }),
        })),
      })),
      delete: vi.fn((table: any) => ({
        where: vi.fn((predicate: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);
          const conditions = extractConditions(predicate);
          for (let i = targetArray.length - 1; i >= 0; i--) {
            if (conditions.length === 0 || conditions.every((c) => matchesField(targetArray[i], c))) {
              targetArray.splice(i, 1);
            }
          }
          return Promise.resolve();
        }),
      })),
    };
    return db;
  }

  beforeEach(() => {
    mockUsuarios = [
      { id: COACH_ID, rol: Rol.ENTRENADOR, email: 'coach@guachafit.com' },
      { id: ALUMNO_USER_ID, rol: Rol.ALUMNO, email: 'alumno@guachafit.com' },
    ];

    mockPerfilesAlumno = [
      {
        id: ALUMNO_PERFIL_ID,
        usuarioId: ALUMNO_USER_ID,
        entrenadorId: COACH_ID,
        nombres: 'Carlos',
        apellidos: 'Pérez',
      },
    ];

    mockEjerciciosCatalogo = [
      { id: 'ej-press', nombre: 'Press de Banca Plano', grupoMuscular: 'Pecho', activo: true },
      { id: 'ej-remo', nombre: 'Remo con Barra', grupoMuscular: 'Espalda', activo: true },
      { id: 'ej-prensa', nombre: 'Prensa Inclinada 45°', grupoMuscular: 'Piernas', activo: true },
      { id: 'ej-militar', nombre: 'Press Militar', grupoMuscular: 'Hombros', activo: true },
    ];

    mockSesionesEntrenamiento = [];
    mockEjerciciosSesion = [];
    mockSeriesRegistro = [];

    // Rutina de 4 bloques prescrita por el coach:
    // Bloque 1: Lunes (diaSugerido: 1)
    // Bloque 2: Martes (diaSugerido: 2)
    // Bloque 3: Jueves (diaSugerido: 4)
    // Bloque 4: Viernes (diaSugerido: 5)
    // Días de descanso prescritos: Miércoles (3), Sábado (6), Domingo (7)
    mockRutinas = [
      {
        id: 'rutina-flexible-01',
        alumnoId: ALUMNO_USER_ID,
        entrenadorId: COACH_ID,
        nombre: 'Plan 4 Días Hipertrofia',
        activa: true,
        bloques: [
          {
            diaId: 'd1',
            titulo: 'Bloque 1: Empuje & Pectoral',
            enfoque: 'Fuerza / Hipertrofia',
            diaSugerido: 1,
            ejercicios: [
              { ejercicioId: 'ej-press', nombre: 'Press de Banca Plano', series: 3, reps: '10', peso: '60kg' },
            ],
          },
          {
            diaId: 'd2',
            titulo: 'Bloque 2: Tracción & Espalda',
            enfoque: 'Volumen',
            diaSugerido: 2,
            ejercicios: [
              { ejercicioId: 'ej-remo', nombre: 'Remo con Barra', series: 3, reps: '10', peso: '50kg' },
            ],
          },
          {
            diaId: 'd3',
            titulo: 'Bloque 3: Piernas & Cuádriceps',
            enfoque: 'Hipertrofia',
            diaSugerido: 4,
            ejercicios: [
              { ejercicioId: 'ej-prensa', nombre: 'Prensa Inclinada 45°', series: 3, reps: '12', peso: '120kg' },
            ],
          },
          {
            diaId: 'd4',
            titulo: 'Bloque 4: Hombros & Brazos',
            enfoque: 'Detalle',
            diaSugerido: 5,
            ejercicios: [
              { ejercicioId: 'ej-militar', nombre: 'Press Militar', series: 3, reps: '10', peso: '35kg' },
            ],
          },
        ],
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      },
    ];

    const db = createMockDb();
    entrenamientoService = new EntrenamientoService(db);
    entrenamientoController = new EntrenamientoController(entrenamientoService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Funciones Puras de Dominio: Rango de Semana y Mapeo de Días', () => {
    it('calcula correctamente la semana ISO (Lunes a Domingo) para cualquier fecha', () => {
      // 2026-09-15 es un Martes
      const rango = calcularRangoSemanaIso('2026-09-15');
      expect(rango.inicioSemana).toBe('2026-09-14'); // Lunes
      expect(rango.finSemana).toBe('2026-09-20'); // Domingo
      expect(rango.isoDay).toBe(2); // Martes
      expect(rango.semanaIso).toContain('2026-W');
    });

    it('extrae el día sugerido explícito o lo deriva del identificador o índice', () => {
      const bloqueConDia = { diaId: 'bloque-a', diaSugerido: 3, titulo: 'Día 3', ejercicios: [] };
      expect(obtenerDiaSugeridoBloque(bloqueConDia, 0)).toBe(3);

      const bloqueConRegex = { diaId: 'd4', titulo: 'Día 4', ejercicios: [] };
      expect(obtenerDiaSugeridoBloque(bloqueConRegex, 0)).toBe(4);

      const bloqueFallback = { diaId: 'sin-numero', titulo: 'Pierna', ejercicios: [] };
      expect(obtenerDiaSugeridoBloque(bloqueFallback, 1)).toBe(2);
    });
  });

  describe('Escenario 1: Omisión del Lunes y Sugerencia Inteligente el Martes', () => {
    it('sugiere el Bloque 1 (primer pendiente) si el alumno faltó el lunes y entra el martes', async () => {
      // Simular que hoy es Martes 15 de Septiembre de 2026
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Consulta de progreso semanal: 0/4 completados, sugiere Bloque 1 ('d1')
      const progreso = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(progreso.totalBloques).toBe(4);
      expect(progreso.bloquesCompletados).toBe(0);
      expect(progreso.porcentajeCumplimiento).toBe('0.00');
      expect(progreso.siguienteBloqueSugeridoId).toBe('d1');
      expect(progreso.esDiaDescansoHoy).toBe(false); // Martes está prescrito en la rutina

      // Consulta pasiva de hoy sin bloqueId: el alumno recibe el Bloque 1 pendiente
      const sesion = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas');
      expect(sesion).not.toBeNull();
      expect(sesion!.bloqueId).toBe('d1');
      expect(sesion!.esDiaDescansoOriginal).toBe(false);
      expect(sesion!.ejercicios[0].ejercicio?.nombre).toBe('Press de Banca Plano');
    });
  });

  describe('Escenario 2: Selección Libre (1-Tap Switch)', () => {
    it('permite al alumno cambiar y ejecutar el Bloque 2 el martes usando bloqueId', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Alumno solicita explícitamente el Bloque 2 ('d2')
      const sesionBloque2 = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas', 'd2');
      expect(sesionBloque2).not.toBeNull();
      expect(sesionBloque2!.bloqueId).toBe('d2');
      expect(sesionBloque2!.ejercicios[0].ejercicio?.nombre).toBe('Remo con Barra');

      // Finalizar la sesión del Bloque 2
      await entrenamientoController.iniciarSesion(req, sesionBloque2!.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, sesionBloque2!.id, {
        series: [
          {
            serieId: sesionBloque2!.ejercicios[0].series[0].id,
            ejercicioSesionId: sesionBloque2!.ejercicios[0].id,
            numeroSerie: 1,
            repsLogradas: 10,
            pesoKg: '50.00',
            completada: true,
          },
        ],
      });
      await entrenamientoController.finalizarSesion(req, sesionBloque2!.id, {
        notasAlumno: 'Excelente bombeo de espalda',
      });

      // Ahora el progreso semanal debe mostrar 1/4 completado (25%)
      const progreso = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(progreso.bloquesCompletados).toBe(1);
      expect(progreso.porcentajeCumplimiento).toBe('25.00');

      const b2 = progreso.bloques.find((b) => b.bloqueId === 'd2');
      expect(b2?.completado).toBe(true);

      // Como el Bloque 1 no se ha hecho, el siguiente sugerido sigue siendo el Bloque 1 ('d1')
      expect(progreso.siguienteBloqueSugeridoId).toBe('d1');
    });
  });

  describe('Escenario 3: Recuperación en Día de Descanso Prescrito (Sábado)', () => {
    it('muestra día de descanso en consulta pasiva pero permite recuperar Bloque 1 con esDiaDescansoOriginal=true', async () => {
      // Simular que hoy es Sábado 19 de Septiembre de 2026 (descanso en el plan de 4 días)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-19T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Consulta de progreso semanal: detecta que hoy es día de descanso
      const progreso = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(progreso.esDiaDescansoHoy).toBe(true);
      expect(progreso.siguienteBloqueSugeridoId).toBe('d1');

      // Consulta pasiva hoy sin bloqueId: retorna null para habilitar vista amigable de descanso
      const sesionPasiva = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas');
      expect(sesionPasiva).toBeNull();

      // Alumno pulsa "Recuperar Bloque 1 hoy"
      const sesionRecuperada = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas', 'd1');
      expect(sesionRecuperada).not.toBeNull();
      expect(sesionRecuperada!.bloqueId).toBe('d1');
      expect(sesionRecuperada!.esDiaDescansoOriginal).toBe(true);

      // El alumno completa el entrenamiento del sábado
      await entrenamientoController.iniciarSesion(req, sesionRecuperada!.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, sesionRecuperada!.id, {
        series: [
          {
            serieId: sesionRecuperada!.ejercicios[0].series[0].id,
            ejercicioSesionId: sesionRecuperada!.ejercicios[0].id,
            numeroSerie: 1,
            repsLogradas: 10,
            pesoKg: '60.00',
            completada: true,
          },
        ],
      });
      await entrenamientoController.finalizarSesion(req, sesionRecuperada!.id, {
        notasAlumno: 'Recuperando el bloque del lunes en mi día libre',
      });

      // Validar que en el historial del coach quede la marca de recuperación en día de descanso
      const reqCoach = { user: { sub: COACH_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_ID } };
      const historial = await entrenamientoController.obtenerHistorialSesionesAlumno(
        reqCoach,
        ALUMNO_PERFIL_ID
      );

      const sesionSabado = historial.find((s) => s.fechaProgramada === '2026-09-19');
      expect(sesionSabado).toBeDefined();
      expect(sesionSabado!.bloqueId).toBe('d1');
      expect(sesionSabado!.esDiaDescansoOriginal).toBe(true);
      expect(sesionSabado!.notasAlumno).toContain('Recuperando el bloque');
    });
  });

  describe('Escenario 4: Evaluación de Racha y Cierre de Semana (RN-02: >= 70%)', () => {
    it('evalúa >= 70% cuando se completan 3 de 4 bloques (75%)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-20T20:00:00.000Z')); // Domingo noche

      // Insertamos 3 sesiones completadas en la semana
      mockSesionesEntrenamiento.push(
        {
          id: 's-1',
          alumnoId: ALUMNO_USER_ID,
          rutinaId: 'rutina-flexible-01',
          bloqueId: 'd1',
          fechaProgramada: '2026-09-14',
          estado: EstadoSesion.COMPLETADA,
          porcentajeCumplimiento: '100.00',
        },
        {
          id: 's-2',
          alumnoId: ALUMNO_USER_ID,
          rutinaId: 'rutina-flexible-01',
          bloqueId: 'd2',
          fechaProgramada: '2026-09-15',
          estado: EstadoSesion.COMPLETADA,
          porcentajeCumplimiento: '100.00',
        },
        {
          id: 's-3',
          alumnoId: ALUMNO_USER_ID,
          rutinaId: 'rutina-flexible-01',
          bloqueId: 'd3',
          fechaProgramada: '2026-09-17',
          estado: EstadoSesion.COMPLETADA,
          porcentajeCumplimiento: '100.00',
        }
      );

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      const progreso = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');

      expect(progreso.totalBloques).toBe(4);
      expect(progreso.bloquesCompletados).toBe(3);
      expect(progreso.porcentajeCumplimiento).toBe('75.00');
      expect(parseFloat(progreso.porcentajeCumplimiento)).toBeGreaterThanOrEqual(70.0);
      expect(progreso.siguienteBloqueSugeridoId).toBe('d4'); // Bloque 4 pendiente
    });
  });
});
