import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
    // WU24: la selección puede ser un COUNT real (`{ total: count() }`) del historial paginado.
    const esSeleccionCount = (seleccion: any): boolean =>
      Boolean(
        seleccion &&
          typeof seleccion === 'object' &&
          Object.values(seleccion).some(
            (expr: any) =>
              expr &&
              Array.isArray(expr.queryChunks) &&
              expr.queryChunks.some(
                (c: any) =>
                  Array.isArray(c?.value) &&
                  c.value.some(
                    (v: any) => typeof v === 'string' && v.toLowerCase().includes('count(')
                  )
              )
          )
      );

    const db: any = {
      select: vi.fn((fieldsSelection?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const targetArray = getTableArray(tableName);

          const chain: any = {
            where: vi.fn((predicate: any) => {
              const conditions = extractConditions(predicate);
              const filtered = targetArray.filter((item) =>
                conditions.length === 0 || conditions.every((cond) => matchesField(item, cond))
              );

              // WU24: LIMIT/OFFSET se aplican al resolver (offset primero), como en SQL.
              let limite: number | null = null;
              let desplazamiento = 0;
              const innerChain: any = {
                orderBy: vi.fn(() => innerChain),
                limit: vi.fn((n: number) => {
                  limite = n;
                  return innerChain;
                }),
                offset: vi.fn((n: number) => {
                  desplazamiento = n;
                  return innerChain;
                }),
                then: (resolve: any) => {
                  if (esSeleccionCount(fieldsSelection)) {
                    return resolve([{ total: filtered.length }]);
                  }
                  const pagina =
                    limite === null
                      ? filtered.slice(desplazamiento)
                      : filtered.slice(desplazamiento, desplazamiento + limite);
                  return resolve(pagina);
                },
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
    // RNF-003/ADR-009: passthrough del envoltorio RLS para el mock in-memory.
    const withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(db));
    entrenamientoService = new EntrenamientoService(db, withTenantMock);
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

      // RN-04: la consulta pasiva de hoy es READ-ONLY: no instancia ni muta nada
      const sesionPasiva = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas');
      expect(sesionPasiva).toBeNull();
      expect(mockSesionesEntrenamiento.length).toBe(0);

      // Acción explícita: instanciar el Bloque 1 sugerido para hoy
      const sesion = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      expect(sesion).not.toBeNull();
      expect(sesion.bloqueId).toBe('d1');
      expect(sesion.estado).toBe(EstadoSesion.PLANIFICADA);
      expect(sesion.esDiaDescansoOriginal).toBe(false);
      expect(sesion.ejercicios[0].ejercicio?.nombre).toBe('Press de Banca Plano');
      expect(mockSesionesEntrenamiento.length).toBe(1);
    });
  });

  describe('Escenario 2: Selección Libre (1-Tap Switch)', () => {
    it('permite al alumno cambiar y ejecutar el Bloque 2 el martes usando bloqueId', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Consulta pasiva del Bloque 2: no existe sesión y NO se crea nada
      const consultaPasiva = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas', 'd2');
      expect(consultaPasiva).toBeNull();
      expect(mockSesionesEntrenamiento.length).toBe(0);

      // Acción explícita: el alumno decide entrenar el Bloque 2 ('d2') hoy
      const sesionBloque2 = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
      });
      expect(sesionBloque2).not.toBeNull();
      expect(sesionBloque2.bloqueId).toBe('d2');
      expect(sesionBloque2.ejercicios[0].ejercicio?.nombre).toBe('Remo con Barra');

      // Finalizar la sesión del Bloque 2
      await entrenamientoController.iniciarSesion(req, sesionBloque2.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, sesionBloque2.id, {
        series: [
          {
            serieId: sesionBloque2.ejercicios[0].series[0].id,
            ejercicioSesionId: sesionBloque2.ejercicios[0].id,
            numeroSerie: 1,
            repsLogradas: 10,
            pesoKg: '50.00',
            completada: true,
          },
        ],
      });
      await entrenamientoController.finalizarSesion(req, sesionBloque2.id, {
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

      // Consulta pasiva del Bloque 1: también read-only, no instancia nada
      const bloque1Pasivo = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas', 'd1');
      expect(bloque1Pasivo).toBeNull();
      expect(mockSesionesEntrenamiento.length).toBe(0);

      // Alumno pulsa "Entrenar este bloque hoy" (acción explícita)
      const sesionRecuperada = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      expect(sesionRecuperada).not.toBeNull();
      expect(sesionRecuperada.bloqueId).toBe('d1');
      expect(sesionRecuperada.esDiaDescansoOriginal).toBe(true);

      // El alumno completa el entrenamiento del sábado
      await entrenamientoController.iniciarSesion(req, sesionRecuperada.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, sesionRecuperada.id, {
        series: [
          {
            serieId: sesionRecuperada.ejercicios[0].series[0].id,
            ejercicioSesionId: sesionRecuperada.ejercicios[0].id,
            numeroSerie: 1,
            repsLogradas: 10,
            pesoKg: '60.00',
            completada: true,
          },
        ],
      });
      await entrenamientoController.finalizarSesion(req, sesionRecuperada.id, {
        notasAlumno: 'Recuperando el bloque del lunes en mi día libre',
      });

      // Validar que en el historial del coach quede la marca de recuperación en día de descanso
      const reqCoach = { user: { sub: COACH_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_ID } };
      const historial = await entrenamientoController.obtenerHistorialSesionesAlumno(
        reqCoach,
        ALUMNO_PERFIL_ID
      );

      const sesionSabado = historial.items.find((s) => s.fechaProgramada === '2026-09-19');
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

  describe('Escenario 5: Navegación Read-Only y Acción Explícita (RN-04)', () => {
    it('consultar el Bloque B existiendo una sesión planificada del Bloque A NO elimina ni recrea la de A', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z')); // Martes

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Acción explícita: el alumno instancia el Bloque A ('d1') para hoy
      const sesionA = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      const idOriginalA = sesionA.id;
      expect(mockSesionesEntrenamiento.length).toBe(1);
      expect(mockSesionesEntrenamiento[0].bloqueId).toBe('d1');

      // Navegar/consultar el Bloque B ('d2') es read-only: no borra la sesión de A ni crea otra
      const consultaB = await entrenamientoController.obtenerSesionHoy(req, 'America/Caracas', 'd2');
      expect(consultaB).toBeNull();
      expect(mockSesionesEntrenamiento.length).toBe(1);
      expect(mockSesionesEntrenamiento[0].id).toBe(idOriginalA);
      expect(mockSesionesEntrenamiento[0].bloqueId).toBe('d1');
      expect(mockSesionesEntrenamiento[0].estado).toBe(EstadoSesion.PLANIFICADA);

      // La acción explícita del Bloque B agrega una sesión nueva SIN destruir la de A
      const sesionB = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
      });
      expect(sesionB.bloqueId).toBe('d2');
      expect(mockSesionesEntrenamiento.length).toBe(2);
      const sesionAPersistida = mockSesionesEntrenamiento.find((s) => s.id === idOriginalA);
      expect(sesionAPersistida).toBeDefined();
      expect(sesionAPersistida!.bloqueId).toBe('d1');
      expect(sesionAPersistida!.estado).toBe(EstadoSesion.PLANIFICADA);
      // Las referencias estables de IDs se preservan (la cola offline apunta a ellas)
      expect(sesionAPersistida!.id).toBe(idOriginalA);
    });

    it('es idempotente: repetir la acción del mismo bloque devuelve la sesión viva sin duplicarla', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      const primera = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
      });
      const segunda = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
      });
      expect(segunda.id).toBe(primera.id);
      expect(mockSesionesEntrenamiento.length).toBe(1);
    });

    it('con la misma X-Idempotency-Key no re-instancia aunque la sesión original ya esté finalizada (D3)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      const primera = await entrenamientoController.entrenarBloqueHoy(
        req,
        'd1',
        { timezoneCliente: 'America/Caracas' },
        'idem-bloque-1'
      );
      await entrenamientoController.iniciarSesion(req, primera.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, primera.id, {
        series: [
          {
            serieId: primera.ejercicios[0].series[0].id,
            repsLogradas: 10,
            pesoKg: '60.00',
            completada: true,
          },
        ],
      });
      await entrenamientoController.finalizarSesion(req, primera.id, {
        fechaFinUtc: '2026-09-15T11:00:00Z',
      });
      expect(mockSesionesEntrenamiento.length).toBe(1);

      // Reintento con la MISMA key (la respuesta se perdió): devuelve la original sin crear otra.
      const reintento = await entrenamientoController.entrenarBloqueHoy(
        req,
        'd1',
        { timezoneCliente: 'America/Caracas' },
        'idem-bloque-1'
      );
      expect(reintento.id).toBe(primera.id);
      expect(mockSesionesEntrenamiento.length).toBe(1);

      // Sin key, el comportamiento sigue igual que siempre: repetir el bloque instancia otra sesión.
      const sinKey = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      expect(sinKey.id).not.toBe(primera.id);
      expect(mockSesionesEntrenamiento.length).toBe(2);
    });

    it('rechaza entrenar un bloque cuando hay otro entrenamiento en progreso hoy (409)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      const sesionD1 = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.iniciarSesion(req, sesionD1.id, {
        timezoneCliente: 'America/Caracas',
      });

      await expect(
        entrenamientoController.entrenarBloqueHoy(req, 'd2', { timezoneCliente: 'America/Caracas' })
      ).rejects.toThrow(ConflictException);

      // La sesión en progreso permanece intacta
      expect(mockSesionesEntrenamiento.length).toBe(1);
      expect(mockSesionesEntrenamiento[0].estado).toBe(EstadoSesion.EN_PROGRESO);
    });

    it('valida tenancy: sin rutina activa propia no se puede instanciar bloques (404)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      // Alumno sin rutina en el mock (no pertenece a la rutina del alumno A)
      const reqOtroAlumno = {
        user: { sub: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', rol: Rol.ALUMNO },
      };
      await expect(
        entrenamientoController.entrenarBloqueHoy(reqOtroAlumno, 'd1', {
          timezoneCliente: 'America/Caracas',
        })
      ).rejects.toThrow(NotFoundException);

      // Bloque inexistente en la rutina propia
      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      await expect(
        entrenamientoController.entrenarBloqueHoy(req, 'd9', { timezoneCliente: 'America/Caracas' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Escenario 6: Repetición de Bloque Completado sin Romper el Historial', () => {
    it('crea una NUEVA sesión en progreso al repetir un bloque ya completado y conserva la anterior', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // 1. Completar el Bloque 2 ('d2')
      const primera = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.iniciarSesion(req, primera.id, {
        timezoneCliente: 'America/Caracas',
      });
      await entrenamientoController.sincronizarSeries(req, primera.id, {
        series: [
          {
            serieId: primera.ejercicios[0].series[0].id,
            ejercicioSesionId: primera.ejercicios[0].id,
            numeroSerie: 1,
            repsLogradas: 10,
            pesoKg: '50.00',
            completada: true,
          },
        ],
      });
      const cierre = await entrenamientoController.finalizarSesion(req, primera.id, {});
      expect(cierre.sesion.estado).toBe(EstadoSesion.COMPLETADA);

      // 2. Repetir el bloque: nueva sesión en progreso (iniciarInmediato)
      const repetida = await entrenamientoController.entrenarBloqueHoy(req, 'd2', {
        timezoneCliente: 'America/Caracas',
        iniciarInmediato: true,
      });

      expect(repetida.id).not.toBe(primera.id);
      expect(repetida.bloqueId).toBe('d2');
      expect(repetida.estado).toBe(EstadoSesion.EN_PROGRESO);
      expect(repetida.fechaInicioUtc).toBeTruthy();

      // 3. El historial previo se conserva y ahora hay dos sesiones del bloque
      expect(mockSesionesEntrenamiento.length).toBe(2);
      const anterior = mockSesionesEntrenamiento.find((s) => s.id === primera.id);
      expect(anterior).toBeDefined();
      expect(anterior!.estado).toBe(EstadoSesion.COMPLETADA);
    });
  });

  describe('Escenario 7: Racha Visible y Sesiones OMITIDA en el Progreso Semanal', () => {
    it('expone rachaDias efectiva (5 con último día ayer, 0 con cadena rota o sin registro)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z')); // Martes; local Caracas = 2026-09-15

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

      // Racha viva: último entrenamiento ayer
      mockPerfilesAlumno[0].rachaDias = 5;
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-09-14';
      const conRacha = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(conRacha.rachaDias).toBe(5);

      // Cadena rota (gap > 1 día): racha efectiva 0
      mockPerfilesAlumno[0].rachaUltimaFecha = '2026-08-30';
      const rota = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(rota.rachaDias).toBe(0);

      // Sin registro previo: 0
      mockPerfilesAlumno[0].rachaUltimaFecha = null;
      mockPerfilesAlumno[0].rachaDias = 0;
      const vacia = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');
      expect(vacia.rachaDias).toBe(0);
    });

    it('expone estadoSesion y motivoOmision para renderizar OMITIDA como Descansado/Incompleto', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));

      const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(
        new Date()
      );

      mockSesionesEntrenamiento.push(
        {
          id: 'sesion-descanso',
          alumnoId: ALUMNO_USER_ID,
          rutinaId: 'rutina-flexible-01',
          bloqueId: 'd2',
          fechaProgramada: hoyStr,
          estado: EstadoSesion.OMITIDA,
          motivoOmision: 'DESCANSO',
          porcentajeCumplimiento: '0.00',
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        },
        {
          id: 'sesion-incompleta',
          alumnoId: ALUMNO_USER_ID,
          rutinaId: 'rutina-flexible-01',
          bloqueId: 'd3',
          fechaProgramada: hoyStr,
          estado: EstadoSesion.OMITIDA,
          motivoOmision: 'INCOMPLETO',
          porcentajeCumplimiento: '0.00',
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        }
      );

      const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };
      const progreso = await entrenamientoController.obtenerSemanaActualProgreso(req, 'America/Caracas');

      const b2 = progreso.bloques.find((b) => b.bloqueId === 'd2');
      expect(b2?.completado).toBe(false);
      expect(b2?.estadoSesion).toBe(EstadoSesion.OMITIDA);
      expect(b2?.motivoOmision).toBe('DESCANSO');

      const b3 = progreso.bloques.find((b) => b.bloqueId === 'd3');
      expect(b3?.estadoSesion).toBe(EstadoSesion.OMITIDA);
      expect(b3?.motivoOmision).toBe('INCOMPLETO');

      // Una sesión OMITIDA no cuenta como bloque completado ni infla el porcentaje
      expect(progreso.bloquesCompletados).toBe(0);
      expect(progreso.porcentajeCumplimiento).toBe('0.00');
    });
  });

  // ===========================================================================
  // El alumno recibe las indicaciones reales del coach
  // ===========================================================================
  describe('LOTE API-3: indicaciones del coach y esfuerzo sugerido llegan a la sesión', () => {
    const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

    function rutinaConEjercicio(ejercicio: Record<string, unknown>, titulo = 'Día 1') {
      mockRutinas[0].bloques = [
        { diaId: 'd1', titulo, diaSugerido: 2, ejercicios: [ejercicio] },
      ];
    }

    it('notas técnicas y esfuerzo sugerido en campos propios; resumen sin jerga', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
      rutinaConEjercicio({
        ejercicioId: 'ej-press',
        nombre: 'Press de Banca Plano',
        series: 3,
        reps: '8-10',
        peso: '',
        rpe: '8',
        notas: 'Baja controlada en 3 s.',
      });

      const sesion = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      const ejercicio = sesion.ejercicios[0];

      expect(ejercicio.notasTecnicas).toBe('Baja controlada en 3 s.');
      expect(ejercicio.rpeSugerido).toBe('8.0');
      // `notasCoach` sigue existiendo (web publicada) y ahora también lleva las indicaciones.
      expect(ejercicio.notasCoach).toBe(
        'Día 1 · 8-10 repeticiones · peso a tu criterio · Baja controlada en 3 s.'
      );
      expect(ejercicio.notasCoach).not.toMatch(/Reps|Bloque:|Sugerido|•/);
    });

    it('con carga prescrita y sin notas: resumen con el peso y campos estructurados vacíos', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
      rutinaConEjercicio({
        ejercicioId: 'ej-press',
        nombre: 'Press de Banca Plano',
        series: 3,
        reps: '10',
        peso: '60 kg',
      });

      const sesion = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      const ejercicio = sesion.ejercicios[0];

      expect(ejercicio.notasCoach).toBe('Día 1 · 10 repeticiones · peso 60 kg');
      expect(ejercicio.notasTecnicas).toBeNull();
      expect(ejercicio.rpeSugerido).toBeNull();
    });

    it('el esfuerzo sugerido no cambia cuando el alumno registra su esfuerzo real', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
      rutinaConEjercicio({
        ejercicioId: 'ej-press',
        nombre: 'Press de Banca Plano',
        series: 2,
        reps: '10',
        rpe: '8.5',
      });

      await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      for (const serie of mockSeriesRegistro) serie.rpe = '9.5';

      const otraVez = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });
      expect(otraVez.ejercicios[0].rpeSugerido).toBe('8.5');
    });
  });

  // ===========================================================================
  // Nunca se usa el ejercicio privado de otro coach
  // ===========================================================================
  describe('LOTE API-3: aislamiento del catálogo al instanciar la sesión', () => {
    const OTRO_COACH = '22222222-2222-4222-8222-222222222222';
    const req = { user: { sub: ALUMNO_USER_ID, rol: Rol.ALUMNO } };

    beforeEach(() => {
      mockEjerciciosCatalogo.push({
        id: 'ej-privado-otro',
        entrenadorId: OTRO_COACH,
        nombre: 'Sentadilla Búlgara Privada',
        grupoMuscular: 'Piernas',
        activo: true,
      });
    });

    it('un ejercicio sin id con el mismo nombre que uno privado de otro coach no se enlaza a ese', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
      mockRutinas[0].bloques = [
        {
          diaId: 'd1',
          titulo: 'Día 1',
          diaSugerido: 2,
          ejercicios: [{ nombre: 'Sentadilla Búlgara Privada', series: 3, reps: '10' }],
        },
      ];

      const sesion = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });

      expect(sesion.ejercicios[0].ejercicioId).not.toBe('ej-privado-otro');
      const enlazado = mockEjerciciosCatalogo.find((e) => e.id === sesion.ejercicios[0].ejercicioId);
      expect(enlazado?.entrenadorId).toBe(COACH_ID);
    });

    it('un id guardado de un ejercicio privado de otro coach tampoco se enlaza', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-15T10:00:00.000Z'));
      mockRutinas[0].bloques = [
        {
          diaId: 'd1',
          titulo: 'Día 1',
          diaSugerido: 2,
          ejercicios: [
            { ejercicioId: 'ej-privado-otro', nombre: 'Sentadilla Búlgara Privada', series: 3, reps: '10' },
          ],
        },
      ];

      const sesion = await entrenamientoController.entrenarBloqueHoy(req, 'd1', {
        timezoneCliente: 'America/Caracas',
      });

      expect(sesion.ejercicios[0].ejercicioId).not.toBe('ej-privado-otro');
    });
  });
});
