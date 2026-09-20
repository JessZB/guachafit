import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Rol,
  EstadoSesion,
  GuardarRutinaSemanalSchema,
  IniciarSesionSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
} from '@guachafit/shared';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { getTableName } from '@guachafit/database';

describe('BDD: RF-001 & RF-017 - Cierre End-to-End del Flujo de Entrenamiento (Coach ↔ Atleta)', () => {
  const COACH_A_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_B_ID = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_A_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';
  const ALUMNO_B_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ALUMNO_B_PERFIL_ID = 'b1111111-1111-4111-8111-111111111111';
  const EJERCICIO_CAT_ID = '66666666-6666-4666-8666-666666666666';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockPerfilesEntrenador: any[];
  let mockSesionesEntrenamiento: any[];
  let mockEjerciciosSesion: any[];
  let mockSeriesRegistro: any[];
  let mockEjerciciosCatalogo: any[];
  let mockRutinas: any[];

  let entrenamientoService: EntrenamientoService;
  let entrenamientoController: EntrenamientoController;

  function extractConditions(sqlObj: any): { column: string; value: any; op?: string }[] {
    const conditions: { column: string; value: any; op?: string }[] = [];
    if (!sqlObj) return conditions;

    function traverse(chunks: any[]) {
      if (!Array.isArray(chunks)) return;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
          traverse(chunk.queryChunks);
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

  function matchesField(record: any, condOrCol: any, valueParam?: any): boolean {
    const col = typeof condOrCol === 'string' ? condOrCol : condOrCol?.column;
    const val = typeof condOrCol === 'string' ? valueParam : condOrCol?.value;
    if (!col) return true;
    const key =
      record[col] !== undefined ? col : col.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase());
    return record[key] === val;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'rutinas') return mockRutinas;
    if (tableName === 'perfiles_entrenador') return mockPerfilesEntrenador;
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
      { id: COACH_A_ID, rol: Rol.ENTRENADOR, email: 'coach_a@guachafit.com' },
      { id: COACH_B_ID, rol: Rol.ENTRENADOR, email: 'coach_b@guachafit.com' },
      { id: ALUMNO_A_USER_ID, rol: Rol.ALUMNO, email: 'alumno_a@guachafit.com' },
      { id: ALUMNO_B_USER_ID, rol: Rol.ALUMNO, email: 'alumno_b@guachafit.com' },
    ];

    mockPerfilesAlumno = [
      {
        id: ALUMNO_A_PERFIL_ID,
        usuarioId: ALUMNO_A_USER_ID,
        entrenadorId: COACH_A_ID,
        nombres: 'Carlos',
        apellidos: 'Atleta',
      },
      {
        id: ALUMNO_B_PERFIL_ID,
        usuarioId: ALUMNO_B_USER_ID,
        entrenadorId: COACH_B_ID,
        nombres: 'Maria',
        apellidos: 'Deportista',
      },
    ];

    mockPerfilesEntrenador = [
      { id: 'p-coach-a', usuarioId: COACH_A_ID },
      { id: 'p-coach-b', usuarioId: COACH_B_ID },
    ];

    mockEjerciciosCatalogo = [
      {
        id: EJERCICIO_CAT_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Press de Banca Plano',
        grupoMuscular: 'PECHO',
        activo: true,
        createdAtUtc: new Date(),
      },
    ];

    mockRutinas = [];
    mockSesionesEntrenamiento = [];
    mockEjerciciosSesion = [];
    mockSeriesRegistro = [];

    const mockDb = createMockDb();
    // RNF-003/ADR-009: passthrough del envoltorio RLS para el mock in-memory.
    const withTenantMock = vi.fn(async (_ctx: any, fn: any) => fn(mockDb));
    entrenamientoService = new EntrenamientoService(mockDb as any, withTenantMock);
    entrenamientoController = new EntrenamientoController(entrenamientoService);
  });

  // ===========================================================================
  // FASE 1: PRESCRIPCIÓN DE RUTINA SEMANAL POR PARTE DEL COACH
  // ===========================================================================
  describe('Escenario 1: Prescripción de Rutina Semanal (Coach)', () => {
    it('debe guardar la rutina semanal del alumno con bloques y ejercicios asociados', async () => {
      const payload = {
        alumnoId: ALUMNO_A_USER_ID,
        nombreRutina: 'Hipertrofia Frecuencia 2',
        bloques: [
          {
            diaId: 'dia-1',
            titulo: 'Día 1: Empuje (Pecho, Hombro, Tríceps)',
            enfoque: 'Fuerza e Hipertrofia',
            ejercicios: [
              {
                id: 'e-1',
                ejercicioId: EJERCICIO_CAT_ID,
                nombre: 'Press de Banca Plano',
                series: 3,
                reps: '8-10',
                peso: '70.00',
                rpe: '8.5',
              },
            ],
          },
        ],
      };

      const res = await entrenamientoController.guardarRutinaSemanal(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        ALUMNO_A_PERFIL_ID,
        payload
      );

      expect(res).toBeDefined();
      expect(res.activa).toBe(true);
      expect(res.nombre).toBe('Hipertrofia Frecuencia 2');
      expect(res.bloques.length).toBe(1);
      expect(res.bloques[0].ejercicios[0].nombre).toBe('Press de Banca Plano');
      expect(mockRutinas.length).toBe(1);
    });

    it('debe desactivar la rutina anterior al prescribir una nueva para el mismo alumno', async () => {
      mockRutinas.push({
        id: 'rutina-antigua',
        alumnoId: ALUMNO_A_USER_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Rutina Antigua',
        bloques: [],
        activa: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const payload = {
        alumnoId: ALUMNO_A_USER_ID,
        nombreRutina: 'Nueva Rutina',
        bloques: [
          {
            diaId: 'dia-1',
            titulo: 'Día 1: Torso',
            ejercicios: [
              {
                nombre: 'Dominadas',
                series: 4,
                reps: '10',
                peso: '0',
              },
            ],
          },
        ],
      };

      await entrenamientoController.guardarRutinaSemanal(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        ALUMNO_A_PERFIL_ID,
        payload
      );

      const antigua = mockRutinas.find((r) => r.id === 'rutina-antigua');
      expect(antigua.activa).toBe(false);
      const nueva = mockRutinas.find((r) => r.nombre === 'Nueva Rutina');
      expect(nueva.activa).toBe(true);
    });

    it('debe bloquear con 403 si un entrenador intenta prescribir rutina a un alumno ajeno', async () => {
      const payload = {
        alumnoId: ALUMNO_A_USER_ID,
        bloques: [
          {
            diaId: 'dia-1',
            titulo: 'Día 1: Pierna',
            ejercicios: [{ nombre: 'Sentadilla', series: 3, reps: '10', peso: '80' }],
          },
        ],
      };

      await expect(
        entrenamientoController.guardarRutinaSemanal(
          { user: { entrenadorId: COACH_B_ID, rol: Rol.ENTRENADOR } }, // Coach B sobre Alumno A
          ALUMNO_A_PERFIL_ID,
          payload
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // FASE 2: CONSULTA Y AUTO-GENERACIÓN DE SESIÓN DIARIA (ATLETA)
  // ===========================================================================
  describe('Escenario 2: Auto-generación de Sesión del Día desde Rutina Activa', () => {
    beforeEach(() => {
      mockRutinas.push({
        id: 'rutina-activa-uuid',
        alumnoId: ALUMNO_A_USER_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Rutina Semanal Activa',
        bloques: [
          {
            diaId: 'dia-1',
            titulo: 'Bloque A',
            ejercicios: [
              {
                ejercicioId: EJERCICIO_CAT_ID,
                nombre: 'Press de Banca Plano',
                series: 3,
                reps: '10',
                peso: '60.00',
                rpe: '8.0',
              },
            ],
          },
        ],
        activa: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('mantiene la consulta pasiva en solo lectura (RN-04) y la acción explícita instancia la sesión del día', async () => {
      // Fecha fija (lunes) para que el bloque prescrito aplique sin depender del día real de ejecución
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-14T10:00:00.000Z'));

      expect(mockSesionesEntrenamiento.length).toBe(0);

      // RN-04: consultar la rutina del día es READ-ONLY: no instancia ni muta nada
      const sesionPasiva = await entrenamientoController.obtenerSesionHoy(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        'America/Caracas'
      );
      expect(sesionPasiva).toBeNull();
      expect(mockSesionesEntrenamiento.length).toBe(0);

      // Acción explícita del alumno: instanciar el bloque del día
      const sesion = await entrenamientoController.entrenarBloqueHoy(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        'dia-1',
        { timezoneCliente: 'America/Caracas' }
      );

      expect(sesion).not.toBeNull();
      expect(sesion?.estado).toBe(EstadoSesion.PLANIFICADA);
      expect(sesion?.ejercicios.length).toBe(1);
      expect(sesion?.ejercicios[0].series.length).toBe(3);
      expect(mockSesionesEntrenamiento.length).toBe(1);
      expect(mockEjerciciosSesion.length).toBe(1);
      expect(mockSeriesRegistro.length).toBe(3);
    });

    it('debe devolver la sesión existente si ya fue instanciada o creada previamente', async () => {
      const hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
      mockSesionesEntrenamiento.push({
        id: 'sesion-existente-hoy',
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: hoyStr,
        estado: EstadoSesion.EN_PROGRESO,
        porcentajeCumplimiento: '33.33',
        volumenTotalKg: '180.00',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const sesion = await entrenamientoController.obtenerSesionHoy(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        'America/Caracas'
      );

      expect(sesion?.id).toBe('sesion-existente-hoy');
      expect(sesion?.estado).toBe(EstadoSesion.EN_PROGRESO);
      expect(mockSesionesEntrenamiento.length).toBe(1); // No crea duplicados
    });
  });

  // ===========================================================================
  // FASE 3: INICIO, REGISTRO DE SERIES Y FINALIZACIÓN CON VOLUMEN (ATLETA)
  // ===========================================================================
  describe('Escenario 3: Ejecución, Sincronización Flexible y Tonelaje Acumulado', () => {
    let sesionId: string;
    let serie1Id: string;
    let serie2Id: string;

    beforeEach(() => {
      sesionId = 'sesion-test-1';
      const ejSesionId = 'ej-sesion-1';
      serie1Id = '11111111-1111-4111-8111-111111111111';
      serie2Id = '22222222-2222-4222-8222-222222222222';

      mockSesionesEntrenamiento.push({
        id: sesionId,
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: '2026-09-13',
        estado: EstadoSesion.PLANIFICADA,
        porcentajeCumplimiento: '0.00',
        volumenTotalKg: '0.00',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      mockEjerciciosSesion.push({
        id: ejSesionId,
        sesionId,
        ejercicioId: EJERCICIO_CAT_ID,
        orden: 1,
      });

      mockSeriesRegistro.push(
        {
          id: serie1Id,
          ejercicioSesionId: ejSesionId,
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: '50.00',
          rpe: null,
          completada: false,
        },
        {
          id: serie2Id,
          ejercicioSesionId: ejSesionId,
          numeroSerie: 2,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: '50.00',
          rpe: null,
          completada: false,
        }
      );
    });

    it('debe iniciar la sesión exitosamente cuando se proporciona el timezoneCliente requerido', async () => {
      const res = await entrenamientoController.iniciarSesion(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        sesionId,
        { timezoneCliente: 'America/Caracas', fechaInicioUtc: new Date().toISOString() }
      );

      expect(res.estado).toBe(EstadoSesion.EN_PROGRESO);
      const sesionDb = mockSesionesEntrenamiento.find((s) => s.id === sesionId);
      expect(sesionDb.estado).toBe(EstadoSesion.EN_PROGRESO);
    });

    it('debe rechazar con 400 Bad Request si el inicio de sesión omite timezoneCliente', async () => {
      await expect(
        entrenamientoController.iniciarSesion(
          { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
          sesionId,
          {} // Payload vacío sin timezoneCliente
        )
      ).rejects.toThrow();
    });

    it('debe registrar series con peso vacío o nulo (peso corporal) sin lanzar error 400', async () => {
      // Iniciar sesión
      mockSesionesEntrenamiento[0].estado = EstadoSesion.EN_PROGRESO;

      const res = await entrenamientoController.sincronizarSeries(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        sesionId,
        {
          series: [
            {
              serieId: serie1Id,
              repsLogradas: 12,
              pesoKg: '', // Ejercicio corporal vacío
              rpe: '',
              completada: true,
            },
          ],
        }
      );

      expect(res).toBeDefined();
      const s1 = mockSeriesRegistro.find((s) => s.id === serie1Id);
      expect(s1.completada).toBe(true);
      expect(s1.repsLogradas).toBe(12);
      expect(s1.pesoKg).toBe('0.00');
    });

    it('debe registrar el tiempo de descanso real (descansoSegundos) y persistirlo al sincronizar series', async () => {
      mockSesionesEntrenamiento[0].estado = EstadoSesion.EN_PROGRESO;

      const res = await entrenamientoController.sincronizarSeries(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        sesionId,
        {
          series: [
            {
              serieId: serie1Id,
              repsLogradas: 10,
              pesoKg: '50.00',
              rpe: '8.0',
              descansoSegundos: 150, // Alumno ajustó/descansó 150s
              completada: true,
            },
          ],
        }
      );

      expect(res).toBeDefined();
      const s1 = mockSeriesRegistro.find((s) => s.id === serie1Id);
      expect(s1.descansoSegundos).toBe(150);
      expect(res.ejercicios[0].series[0].descansoSegundos).toBe(150);
    });

    it('debe finalizar la sesión calculando cumplimiento y volumen total en kg', async () => {
      mockSesionesEntrenamiento[0].estado = EstadoSesion.EN_PROGRESO;
      mockSesionesEntrenamiento[0].fechaInicioUtc = new Date(Date.now() - 45 * 60000);

      // Serie 1: 10 reps x 50 kg = 500 kg
      mockSeriesRegistro[0].completada = true;
      mockSeriesRegistro[0].repsLogradas = 10;
      mockSeriesRegistro[0].pesoKg = '50.00';

      // Serie 2: 8 reps x 60 kg = 480 kg
      mockSeriesRegistro[1].completada = true;
      mockSeriesRegistro[1].repsLogradas = 8;
      mockSeriesRegistro[1].pesoKg = '60.00';

      const res = await entrenamientoController.finalizarSesion(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        sesionId,
        {
          notasAlumno: 'Excelente sesión, sentí buena congestión en pecho.',
          fechaFinUtc: new Date().toISOString(),
        }
      );

      expect(res.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(res.sesion.porcentajeCumplimiento).toBe('100.00');
      // Volumen total: 500 + 480 = 980.00 kg
      expect(res.volumenTotalKg).toBe('980.00');
      expect(res.sesion.volumenTotalKg).toBe('980.00');
      expect(res.cumpleReglaRacha).toBe(true);
      expect(res.cumpleRacha).toBe(true);
    });

    it('debe exigir la decisión del alumno (400) al intentar cerrar una sesión sin series completadas', async () => {
      mockSesionesEntrenamiento[0].estado = EstadoSesion.EN_PROGRESO;
      mockSesionesEntrenamiento[0].fechaInicioUtc = new Date(Date.now() - 5 * 60000);

      // Ninguna serie completada (Escenario 5)
      await expect(
        entrenamientoController.finalizarSesion(
          { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
          sesionId,
          { fechaFinUtc: new Date().toISOString() }
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('debe registrar el día como OMITIDA (DESCANSO) sin incrementar la racha cuando el alumno lo decide', async () => {
      mockSesionesEntrenamiento[0].estado = EstadoSesion.EN_PROGRESO;
      mockSesionesEntrenamiento[0].fechaInicioUtc = new Date(Date.now() - 5 * 60000);
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      mockPerfilesAlumno[0].rachaDias = 4;
      mockPerfilesAlumno[0].rachaUltimaFecha = ayer;

      const res = await entrenamientoController.finalizarSesion(
        { user: { sub: ALUMNO_A_USER_ID, rol: Rol.ALUMNO } },
        sesionId,
        { fechaFinUtc: new Date().toISOString(), tipoCierre: 'DESCANSADA' }
      );

      expect(res.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(res.sesion.motivoOmision).toBe('DESCANSO');
      expect(res.cumpleReglaRacha).toBe(false);
      expect(res.nuevaRacha).toBe(4); // racha intacta (no incrementa por omisión)
      expect(mockPerfilesAlumno[0].rachaDias).toBe(4);
    });
  });

  // ===========================================================================
  // FASE 3.b: AISLAMIENTO DEL HISTORIAL ENTRE ALUMNOS (SEGURIDAD)
  // ===========================================================================
  describe('Escenario 3.b: Aislamiento del Historial (Alumno solo ve su propio expediente)', () => {
    it('debe permitir a un alumno consultar su propio historial', async () => {
      mockSesionesEntrenamiento.push({
        id: 'sesion-propia',
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: '2026-09-12',
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      const historial = await entrenamientoController.obtenerHistorialSesionesAlumno(
        { user: { sub: ALUMNO_A_USER_ID, entrenadorId: COACH_A_ID, rol: Rol.ALUMNO } },
        ALUMNO_A_PERFIL_ID
      );

      expect(historial.items.length).toBe(1);
      expect(historial.items[0].alumnoId).toBe(ALUMNO_A_USER_ID);
      expect(historial.total).toBe(1);
    });

    it('debe rechazar con 403 cuando un alumno intenta leer el historial de otro alumno', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { sub: ALUMNO_B_USER_ID, entrenadorId: COACH_B_ID, rol: Rol.ALUMNO } },
          ALUMNO_A_PERFIL_ID
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // FASE 4: SUPERVISIÓN DEL COACH (HISTORIAL CON VOLUMEN Y SERIES)
  // ===========================================================================
  describe('Escenario 4: Supervisión en Expediente 360° (Coach)', () => {
    it('debe retornar las sesiones completadas con volumenTotalKg y series efectivas hidratadas', async () => {
      const sesionCompletadaId = 'sesion-comp-1';
      const ejId = 'ej-ses-1';

      mockSesionesEntrenamiento.push({
        id: sesionCompletadaId,
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: '2026-09-12',
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
        volumenTotalKg: '1250.50',
        notasAlumno: 'Buen entrenamiento',
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      });

      mockEjerciciosSesion.push({
        id: ejId,
        sesionId: sesionCompletadaId,
        ejercicioId: EJERCICIO_CAT_ID,
        orden: 1,
        descansoPrescritoSegundos: 120,
      });

      mockSeriesRegistro.push({
        id: 's-1',
        ejercicioSesionId: ejId,
        numeroSerie: 1,
        repsObjetivo: 10,
        repsLogradas: 10,
        pesoKg: '70.00',
        rpe: '8.5',
        descansoSegundos: 150,
        completada: true,
      });

      const historial = await entrenamientoController.obtenerHistorialSesionesAlumno(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        ALUMNO_A_PERFIL_ID
      );

      expect(historial.items.length).toBe(1);
      expect(historial.items[0].volumenTotalKg).toBe('1250.50');
      expect(historial.items[0].porcentajeCumplimiento).toBe('100.00');
      expect(historial.items[0].ejercicios[0].descansoPrescritoSegundos).toBe(120);
      expect(historial.items[0].ejercicios[0].series[0].descansoSegundos).toBe(150);
      expect(historial.items[0].ejercicios[0].series[0].rpe).toBe('8.5');
    });
  });
});
