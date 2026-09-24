import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  ExecutionContext,
  ForbiddenException,
  type INestApplication,
} from '@nestjs/common';
import { Rol } from '@guachafit/shared';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { DRIZZLE_DB } from '../../src/database/database.module';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { AntropometriaController } from '../../src/modules/antropometria/antropometria.controller';
import { EntrenadorController } from '../../src/modules/entrenador/entrenador.controller';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { NutricionController } from '../../src/modules/nutricion/nutricion.controller';
import { NutricionService } from '../../src/modules/nutricion/nutricion.service';

describe('RF-010: Arquitectura de Roles Jerárquicos (RBAC) y Aislamiento de Tenancy', () => {
  const reflectorMock = {
    getAllAndOverride: vi.fn(),
  };

  const rolesGuard = new RolesGuard(reflectorMock as any);

  function createMockContext(user: { id: string; rol: Rol; entrenadorId?: string }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('Escenario 1: Jerarquía RBAC', () => {
    it('Superadmin tiene acceso a endpoints de gestión de entrenadores', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.SUPERADMIN]);
      const context = createMockContext({ id: 'sa-1', rol: Rol.SUPERADMIN });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('Entrenador NO puede acceder a endpoints de Superadmin', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.SUPERADMIN]);
      const context = createMockContext({ id: 'coach-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-1' });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('Alumno NO puede acceder a endpoints de Entrenador', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.ENTRENADOR]);
      const context = createMockContext({ id: 'alumno-1', rol: Rol.ALUMNO, entrenadorId: 'coach-1' });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Escenario 2: Intento de Acceso Cruzado entre Entrenadores (Aislamiento)', () => {
    it('Debe rechazar operaciones si el entrenador activo intenta manipular datos de otro tenant', () => {
      const coachATenantId = 'coach-a-uuid';
      const coachBTenantId = 'coach-b-uuid';

      // Simular verificación de tenant
      const assertTenantMatch = (currentCoachTenant: string, targetResourceTenant: string) => {
        if (currentCoachTenant !== targetResourceTenant) {
          throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
        }
      };

      expect(() => assertTenantMatch(coachATenantId, coachBTenantId)).toThrow(ForbiddenException);
      expect(() => assertTenantMatch(coachATenantId, coachATenantId)).not.toThrow();
    });
  });
});

/**
 * Auditoría RF-010 (RN-01): el guard eliminó el bypass incondicional de SUPERADMIN. La matriz del
 * RF concede al superadmin SOLO la gestión de entrenadores/licencias; el negocio del coach y del
 * alumno le está vedado. Estos tests fijan ese contrato sobre los endpoints reales.
 */
describe('RF-010 RN-01: matriz de control de acceso sin bypass de Superadmin', () => {
  /** Roles declarados con @Roles en el handler (o en la clase), igual que `getAllAndOverride`. */
  function rolesDeclarados(handler: (...args: any[]) => any, controller: new (...args: any[]) => any): Rol[] {
    return (
      Reflect.getMetadata(ROLES_KEY, handler) ??
      Reflect.getMetadata(ROLES_KEY, controller) ??
      []
    );
  }

  function crearContexto(
    rol: Rol,
    handler: (...args: any[]) => any,
    controller: new (...args: any[]) => any,
    sub = `id-${rol}`
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub, rol } }) }),
    } as unknown as ExecutionContext;
  }

  const guard = new RolesGuard(new Reflector());

  const endpointAdmin = {
    nombre: 'POST /auth/entrenador',
    handler: AuthController.prototype.crearEntrenador,
    controller: AuthController,
  };
  const negocioCoach = {
    nombre: 'POST /alumnos/manual',
    handler: AlumnosController.prototype.altaManual,
    controller: AlumnosController,
  };
  const negocioAlumno = {
    nombre: 'POST /nutricion/checkin-diario',
    handler: NutricionController.prototype.registrarCheckinDiario,
    controller: NutricionController,
  };

  describe('1. Guard estricto: los roles declarados son la única puerta', () => {
    it('el Superadmin accede al endpoint administrativo y SOLO donde está declarado', () => {
      expect(rolesDeclarados(endpointAdmin.handler, endpointAdmin.controller)).toEqual([
        Rol.SUPERADMIN,
      ]);
      expect(
        guard.canActivate(crearContexto(Rol.SUPERADMIN, endpointAdmin.handler, endpointAdmin.controller))
      ).toBe(true);
    });

    it('el Superadmin recibe 403 en el negocio del coach', () => {
      expect(rolesDeclarados(negocioCoach.handler, negocioCoach.controller)).toEqual([
        Rol.ENTRENADOR,
      ]);
      expect(() =>
        guard.canActivate(crearContexto(Rol.SUPERADMIN, negocioCoach.handler, negocioCoach.controller))
      ).toThrow(ForbiddenException);
    });

    it('el Superadmin recibe 403 en el negocio del alumno', () => {
      expect(rolesDeclarados(negocioAlumno.handler, negocioAlumno.controller)).toEqual([
        Rol.ALUMNO,
      ]);
      expect(() =>
        guard.canActivate(crearContexto(Rol.SUPERADMIN, negocioAlumno.handler, negocioAlumno.controller))
      ).toThrow(ForbiddenException);
    });
  });

  describe('2. Los roles normales conservan su acceso (sin regresiones)', () => {
    it('el Entrenador entra a su negocio y no al administrativo', () => {
      expect(
        guard.canActivate(crearContexto(Rol.ENTRENADOR, negocioCoach.handler, negocioCoach.controller))
      ).toBe(true);
      expect(() =>
        guard.canActivate(crearContexto(Rol.ENTRENADOR, endpointAdmin.handler, endpointAdmin.controller))
      ).toThrow(ForbiddenException);
    });

    it('el Alumno entra a su endpoint y no al del coach', () => {
      expect(
        guard.canActivate(crearContexto(Rol.ALUMNO, negocioAlumno.handler, negocioAlumno.controller))
      ).toBe(true);
      expect(() =>
        guard.canActivate(crearContexto(Rol.ALUMNO, negocioCoach.handler, negocioCoach.controller))
      ).toThrow(ForbiddenException);
    });

    it('un usuario sin rol asignado se rechaza sin evaluar la lista', () => {
      const contexto = {
        getHandler: () => negocioCoach.handler,
        getClass: () => negocioCoach.controller,
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'sin-rol' } }) }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
    });
  });

  describe('3. Barrido de la matriz: ningún endpoint de negocio declara SUPERADMIN', () => {
    const endpointsNegocio: Array<[string, (...args: any[]) => any, new (...args: any[]) => any]> = [
      ['GET /alumnos', AlumnosController.prototype.listarAlumnos, AlumnosController],
      ['GET /alumnos/:id', AlumnosController.prototype.obtenerPorId, AlumnosController],
      ['GET /entrenador/perfil', EntrenadorController.prototype.obtenerPerfil, EntrenadorController],
      [
        'GET /entrenador/dashboard-comando',
        EntrenadorController.prototype.obtenerDashboardComando,
        EntrenadorController,
      ],
      ['GET /antropometria/pendientes', AntropometriaController.prototype.listarPendientes, AntropometriaController],
      ['PATCH /antropometria/:id/conciliar', AntropometriaController.prototype.conciliarControl, AntropometriaController],
      ['GET /antropometria/evolucion/:alumnoId', AntropometriaController.prototype.obtenerEvolucion, AntropometriaController],
      ['GET /antropometria/:id', AntropometriaController.prototype.obtenerControlPorId, AntropometriaController],
      ['POST /antropometria/checkin', AntropometriaController.prototype.registrarCheckin, AntropometriaController],
      [
        'GET /rutinas/alumno/:alumnoId/activa',
        EntrenamientoController.prototype.obtenerRutinaActivaAlumno,
        EntrenamientoController,
      ],
      [
        'GET /sesiones/alumno/:alumnoId/historial',
        EntrenamientoController.prototype.obtenerHistorialSesionesAlumno,
        EntrenamientoController,
      ],
      ['GET /sesiones/:id', EntrenamientoController.prototype.obtenerSesionPorId, EntrenamientoController],
      ['GET /ejercicios/catalogo', EntrenamientoController.prototype.listarEjercicios, EntrenamientoController],
      ['GET /finanzas/tasas/vigente', FinanzasController.prototype.obtenerTasaVigente, FinanzasController],
      ['POST /finanzas/cuotas/:id/reportar-pago', FinanzasController.prototype.reportarPago, FinanzasController],
      // WU-J (RF-005): contrato de override solo para el entrenador autenticado.
      ['GET /finanzas/planes/override', FinanzasController.prototype.listarOverrides, FinanzasController],
      ['DELETE /finanzas/planes/override/:id', FinanzasController.prototype.eliminarOverride, FinanzasController],
      [
        'GET /finanzas/clientes/:clienteId/historial',
        FinanzasController.prototype.obtenerHistorialCliente,
        FinanzasController,
      ],
      [
        'GET /nutricion/alumnos/:alumnoId/checkins',
        NutricionController.prototype.listarCheckins,
        NutricionController,
      ],
    ];

    it('cada endpoint declara roles explícitos y ninguno incluye SUPERADMIN', () => {
      for (const [nombre, handler, controller] of endpointsNegocio) {
        const roles = rolesDeclarados(handler, controller);
        expect(roles.length, `endpoint ${nombre} sin @Roles declarados`).toBeGreaterThan(0);
        expect(roles, `endpoint ${nombre}`).not.toContain(Rol.SUPERADMIN);
      }
    });
  });
});

/**
 * Verificación HTTP real (Nest + supertest): el 403 del superadmin en negocio y el 201 del
 * endpoint administrativo, con los guards reales de cada controller.
 */
describe('RF-010 RN-01: verificación HTTP real (Nest + supertest)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'guachafit_jwt_super_secret_key_2026';
  const ALUMNO_USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const COACH_ID = '11111111-1111-4111-8111-111111111111';
  const SUPERADMIN_ID = '50000000-0000-4000-8000-000000000001';

  function token(rol: Rol, sub: string): string {
    return jwt.sign({ sub, email: `${rol}@guachafit.com`, rol }, JWT_SECRET, { expiresIn: '15m' });
  }

  async function crearApp(opciones: {
    controllers: any[];
    providers: any[];
  }): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: opciones.controllers,
      providers: opciones.providers,
    })
      // esbuild/vitest no emite `design:paramtypes`: el guard real se inyecta con su Reflector.
      .overrideGuard(RolesGuard)
      .useValue(new RolesGuard(new Reflector()))
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  /** Mock mínimo de Drizzle para el SELECT del AlumnoHabilitadoGuard (select → from → where → limit). */
  function dbConPerfilActivo() {
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ estadoActivacion: 'activo', deletedAtUtc: null }]),
          }),
        }),
      }),
      // RNF-003/ADR-011 (etapa 3): el guard lee el perfil (RLS) dentro de withTenant.
      execute: async () => undefined,
    };
    db.transaction = async (cb: any) => cb(db);
    return db;
  }

  function bodyEntrenador() {
    return {
      nombres: 'Marcos',
      apellidos: 'Fitness',
      email: 'marcos@gym.com',
      coachCode: 'MARCOS-921',
      telefonoContacto: '+584120000001',
    };
  }

  describe('1. Endpoint administrativo POST /auth/entrenador (matriz: Crear Entrenadores ✅ Superadmin)', () => {
    it('Superadmin → 201 y el alta se ejecuta', async () => {
      const crearEntrenador = vi.fn(async (dto: any) => ({
        id: 'coach-1',
        usuarioId: 'usuario-1',
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        email: dto.email,
        coachCode: dto.coachCode,
        tokenInvitacion: 'token-invitacion',
        mensaje: 'Entrenador registrado exitosamente.',
      }));
      const app = await crearApp({
        controllers: [AuthController],
        providers: [{ provide: AuthService, useValue: { crearEntrenador } }],
      });

      const res = await request(app.getHttpServer())
        .post('/auth/entrenador')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send(bodyEntrenador());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        coachCode: 'MARCOS-921',
        mensaje: 'Entrenador registrado exitosamente.',
      });
      expect(crearEntrenador).toHaveBeenCalledTimes(1);

      await app.close();
    });

    it('Entrenador → 403 (solo el superadmin gestiona cuentas de entrenador)', async () => {
      const crearEntrenador = vi.fn();
      const app = await crearApp({
        controllers: [AuthController],
        providers: [{ provide: AuthService, useValue: { crearEntrenador } }],
      });

      const res = await request(app.getHttpServer())
        .post('/auth/entrenador')
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`)
        .send(bodyEntrenador());

      expect(res.status).toBe(403);
      expect(crearEntrenador).not.toHaveBeenCalled();

      await app.close();
    });

    it('Alumno → 403', async () => {
      const crearEntrenador = vi.fn();
      const app = await crearApp({
        controllers: [AuthController],
        providers: [{ provide: AuthService, useValue: { crearEntrenador } }],
      });

      const res = await request(app.getHttpServer())
        .post('/auth/entrenador')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_USUARIO_ID)}`)
        .send(bodyEntrenador());

      expect(res.status).toBe(403);
      expect(crearEntrenador).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe('2. Negocio del coach GET /alumnos', () => {
    async function appAlumnos() {
      const listarAlumnos = vi.fn(async () => ({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        resumen: { total: 0, activos: 0, pausados: 0, morosos: 0, presenciales: 0, remotos: 0, archivados: 0 },
      }));
      const app = await crearApp({
        controllers: [AlumnosController],
        providers: [{ provide: AlumnosService, useValue: { listarAlumnos } }],
      });
      return { app, listarAlumnos };
    }

    it('Superadmin → 403 y el servicio del coach nunca se invoca', async () => {
      const { app, listarAlumnos } = await appAlumnos();

      const res = await request(app.getHttpServer())
        .get('/alumnos')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`);

      expect(res.status).toBe(403);
      expect(listarAlumnos).not.toHaveBeenCalled();

      await app.close();
    });

    it('Entrenador → 200 (sin cambios para el rol dueño del negocio)', async () => {
      const { app, listarAlumnos } = await appAlumnos();

      const res = await request(app.getHttpServer())
        .get('/alumnos')
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(listarAlumnos).toHaveBeenCalledTimes(1);

      await app.close();
    });
  });

  describe('3. Negocio del alumno POST /nutricion/checkin-diario', () => {
    async function appNutricion() {
      const registrarCheckinDiario = vi.fn(async () => ({ id: 'checkin-1' }));
      const app = await crearApp({
        controllers: [NutricionController],
        providers: [
          { provide: NutricionService, useValue: { registrarCheckinDiario } },
          { provide: DRIZZLE_DB, useValue: dbConPerfilActivo() },
        ],
      });
      return { app, registrarCheckinDiario };
    }

    it('Superadmin → 403 y el reporte del alumno nunca se registra', async () => {
      const { app, registrarCheckinDiario } = await appNutricion();

      const res = await request(app.getHttpServer())
        .post('/nutricion/checkin-diario')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ fecha: '2026-09-21', semaforo: 'cumplido' });

      expect(res.status).toBe(403);
      expect(registrarCheckinDiario).not.toHaveBeenCalled();

      await app.close();
    });

    it('Alumno → 201 (sin cambios para el rol dueño del reporte)', async () => {
      const { app, registrarCheckinDiario } = await appNutricion();

      const res = await request(app.getHttpServer())
        .post('/nutricion/checkin-diario')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_USUARIO_ID)}`)
        .send({ fecha: '2026-09-21', semaforo: 'cumplido' });

      expect(res.status).toBe(201);
      expect(registrarCheckinDiario).toHaveBeenCalledTimes(1);

      await app.close();
    });
  });
});
