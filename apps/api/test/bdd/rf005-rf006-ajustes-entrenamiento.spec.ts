import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Rol,
  EstadoSesion,
  ActualizarPlanMembresiaSchema,
  ActualizarTasaCambioSchema,
} from '@guachafit/shared';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import { EntrenamientoService } from '../../src/modules/entrenamiento/entrenamiento.service';
import { getTableName } from '@guachafit/database';

describe('BDD: RF-005, RF-006 & RF-001 - Ajustes Operativos e Historial de Entrenamiento', () => {
  const COACH_A_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_B_ID = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_A_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ALUMNO_A_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';
  const ALUMNO_B_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ALUMNO_B_PERFIL_ID = 'b1111111-1111-4111-8111-111111111111';
  const PLAN_A_ID = '99999999-9999-4999-8999-999999999999';
  const PLAN_B_ID = '88888888-8888-4888-8888-888888888888';
  const SESION_1_ID = '77777777-7777-4777-8777-777777777771';
  const SESION_2_ID = '77777777-7777-4777-8777-777777777772';
  const EJERCICIO_CAT_ID = '66666666-6666-4666-8666-666666666666';

  let mockUsuarios: any[];
  let mockPerfilesAlumno: any[];
  let mockPerfilesEntrenador: any[];
  let mockPlanesMembresia: any[];
  let mockTasasCambioReferencia: any[];
  let mockSesionesEntrenamiento: any[];
  let mockEjerciciosSesion: any[];
  let mockSeriesRegistro: any[];
  let mockEjerciciosCatalogo: any[];

  let finanzasService: FinanzasService;
  let finanzasController: FinanzasController;
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
    const key = record[col] !== undefined ? col : col.replace(/_([a-z])/g, (_: string, l: string) => l.toUpperCase());
    return record[key] === val;
  }

  function getTableArray(tableName: string): any[] {
    if (tableName === 'planes_membresia') return mockPlanesMembresia;
    if (tableName === 'tasas_cambio_referencia') return mockTasasCambioReferencia;
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
          const inserted = { id: `id-${Date.now()}`, ...vals, createdAtUtc: new Date(), updatedAtUtc: new Date() };
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
      { id: ALUMNO_A_USER_ID, email: 'alumno.a@guachafit.com', rol: Rol.ALUMNO, activo: true },
      { id: ALUMNO_B_USER_ID, email: 'alumno.b@guachafit.com', rol: Rol.ALUMNO, activo: true },
    ];

    mockPerfilesEntrenador = [
      { id: 'perfil-coach-a', usuarioId: COACH_A_ID, nombres: 'Carlos', apellidos: 'Coach A', tasaCambioGlobal: '65.0000' },
      { id: 'perfil-coach-b', usuarioId: COACH_B_ID, nombres: 'Bruno', apellidos: 'Coach B', tasaCambioGlobal: '65.0000' },
    ];

    mockPerfilesAlumno = [
      {
        id: ALUMNO_A_PERFIL_ID,
        usuarioId: ALUMNO_A_USER_ID,
        entrenadorId: COACH_A_ID,
        nombres: 'Atleta',
        apellidos: 'Alpha',
        deletedAtUtc: null,
      },
      {
        id: ALUMNO_B_PERFIL_ID,
        usuarioId: ALUMNO_B_USER_ID,
        entrenadorId: COACH_B_ID,
        nombres: 'Atleta',
        apellidos: 'Beta',
        deletedAtUtc: null,
      },
    ];

    mockPlanesMembresia = [
      {
        id: PLAN_A_ID,
        entrenadorId: COACH_A_ID,
        nombre: 'Plan Sala Estándar',
        descripcion: 'Acceso a sala de pesas',
        precioBaseUsd: '40.00',
        duracionMeses: 1,
        beneficios: ['Acceso a sala', 'Rutina en app'],
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      },
      {
        id: PLAN_B_ID,
        entrenadorId: COACH_B_ID,
        nombre: 'Plan Coach B',
        descripcion: 'Plan de otro entrenador',
        precioBaseUsd: '50.00',
        duracionMeses: 1,
        beneficios: ['Exclusivo coach B'],
        activo: true,
        createdAtUtc: new Date(),
        updatedAtUtc: new Date(),
      },
    ];

    mockTasasCambioReferencia = [
      {
        id: 'tasa-ref-1',
        entrenadorId: COACH_A_ID,
        tasaOficialBcv: '65.5000',
        tasaParalelo: '72.0000',
        tasaActivaEntrenador: '65.5000',
        fuente: 'oficial_bcv',
        fechaActualizacionUtc: new Date(),
      },
    ];

    mockEjerciciosCatalogo = [
      {
        id: EJERCICIO_CAT_ID,
        entrenadorId: null,
        nombre: 'Press de Banca Plano',
        grupoMuscular: 'Pecho',
        patronMovimiento: 'Empuje Horizontal',
        activo: true,
      },
    ];

    mockSesionesEntrenamiento = [
      {
        id: SESION_1_ID,
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: '2026-09-10',
        fechaInicioUtc: new Date('2026-09-10T14:00:00Z'),
        fechaFinUtc: new Date('2026-09-10T15:00:00Z'),
        timezoneCliente: 'America/Caracas',
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
        notasAlumno: 'Excelente bombeo',
        createdAtUtc: new Date('2026-09-10T14:00:00Z'),
      },
      {
        id: SESION_2_ID,
        alumnoId: ALUMNO_A_USER_ID,
        fechaProgramada: '2026-09-12',
        fechaInicioUtc: new Date('2026-09-12T14:00:00Z'),
        fechaFinUtc: new Date('2026-09-12T15:05:00Z'),
        timezoneCliente: 'America/Caracas',
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '85.00',
        notasAlumno: 'Cansancio en hombros',
        createdAtUtc: new Date('2026-09-12T14:00:00Z'),
      },
    ];

    mockEjerciciosSesion = [
      {
        id: 'ej-ses-1',
        sesionId: SESION_1_ID,
        ejercicioId: EJERCICIO_CAT_ID,
        orden: 1,
        notasCoach: 'Controlar bajada',
      },
    ];

    mockSeriesRegistro = [
      {
        id: 'serie-1',
        ejercicioSesionId: 'ej-ses-1',
        numeroSerie: 1,
        repsObjetivo: 10,
        repsLogradas: 10,
        pesoKg: '60.00',
        rpe: '8.0',
        completada: true,
      },
    ];

    const mockDb = createMockDb();
    const mockEventEmitter = { emit: vi.fn() } as any;

    finanzasService = new FinanzasService(mockDb, mockEventEmitter);
    finanzasController = new FinanzasController(finanzasService);

    entrenamientoService = new EntrenamientoService(mockDb, mockEventEmitter);
    entrenamientoController = new EntrenamientoController(entrenamientoService);
  });

  describe('1. Catálogo de Planes: Actualización y Aislamiento Multi-inquilino (PATCH /finanzas/planes/:id)', () => {
    it('debe actualizar exitosamente un plan existente con precio y beneficios modificados', async () => {
      const payload = {
        nombre: 'Plan Sala Premium (Actualizado)',
        precioBaseUsd: '45.00',
        beneficios: ['Acceso a sala ilimitado', 'Rutina guiada', '1 Check-in quincenal'],
        activo: true,
      };

      const res = await finanzasController.actualizarPlan(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        PLAN_A_ID,
        payload
      );

      expect(res).toBeDefined();
      expect(res.nombre).toBe('Plan Sala Premium (Actualizado)');
      expect(res.precioBaseUsd).toBe('45.00');
      expect(res.beneficios).toHaveLength(3);
    });

    it('debe rechazar con 400 Bad Request si el ID de plan no es un UUID válido', async () => {
      await expect(
        finanzasController.actualizarPlan(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          'plan-invalido-123',
          { precioBaseUsd: '50.00' }
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar con 404 Not Found si el plan no existe en la base de datos', async () => {
      await expect(
        finanzasController.actualizarPlan(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          '00000000-0000-4000-8000-000000000000',
          { precioBaseUsd: '50.00' }
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar con 403 Forbidden si un entrenador intenta modificar un plan de otro entrenador', async () => {
      await expect(
        finanzasController.actualizarPlan(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          PLAN_B_ID, // Pertenece a COACH_B
          { precioBaseUsd: '99.00' }
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Tasa de Cambio Global (PUT /finanzas/tasas)', () => {
    it('debe permitir al entrenador actualizar su tasa activa en Bs/USD', async () => {
      const payload = {
        tasaOficialBcv: '66.2000',
        tasaParalelo: '74.0000',
        tasaActivaEntrenador: '66.2000',
        fuente: 'oficial_bcv',
      };

      const res = await finanzasController.actualizarTasa(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        payload
      );

      expect(res).toBeDefined();
      expect(res.tasaEfectiva).toBe('66.2000');
      expect(res.entrenadorId).toBe(COACH_A_ID);
    });
  });

  describe('3. Historial de Sesiones del Alumno (GET /sesiones/alumno/:alumnoId/historial)', () => {
    it('debe retornar la lista cronológica de sesiones realizadas por el alumno con ejercicios hidratados', async () => {
      const res = await entrenamientoController.obtenerHistorialSesionesAlumno(
        { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
        ALUMNO_A_PERFIL_ID
      );

      expect(res).toBeDefined();
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].id).toBeDefined();
      expect(res[0].ejercicios).toBeDefined();
    });

    it('debe rechazar con 400 Bad Request si el ID de alumno no es un UUID válido', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          'alumno-no-uuid'
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar con 404 Not Found si el alumno no existe', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          '00000000-0000-4000-8000-000000000000'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar con 403 Forbidden si el entrenador intenta auditar sesiones de un alumno ajeno', async () => {
      await expect(
        entrenamientoController.obtenerHistorialSesionesAlumno(
          { user: { entrenadorId: COACH_A_ID, rol: Rol.ENTRENADOR } },
          ALUMNO_B_PERFIL_ID // Pertenece a COACH_B
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
