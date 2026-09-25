import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { getTableName } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  Modalidad,
  Rol,
  TipoDocumento,
} from '@guachafit/shared';
import { AlumnoHabilitadoGuard } from '../../src/common/guards/alumno-habilitado.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ESTADOS_BLOQUEADOS_ALUMNO_KEY } from '../../src/common/decorators/bloqueo-alumno.decorator';
import { DRIZZLE_DB } from '../../src/database/database.module';
import { EntrenamientoController } from '../../src/modules/entrenamiento/entrenamiento.controller';
import { NutricionController } from '../../src/modules/nutricion/nutricion.controller';
import { NutricionService } from '../../src/modules/nutricion/nutricion.service';
import { AntropometriaController } from '../../src/modules/antropometria/antropometria.controller';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';

/**
 * RF-012 (auditoría RF-012 / WU-D): enforcement real del ciclo de vida del alumno.
 *
 * La suite anterior (`rf012-ciclo-vida.spec.ts`) cubría el sellado del soft delete y la
 * restauración, pero nada verificaba que un alumno pausado/suspendido/archivado dejara de operar.
 * Aquí se prueban las dos capas nuevas:
 *  1. `AlumnoHabilitadoGuard`: bloquea con 403 `ALUMNO_BLOQUEADO` exactamente los endpoints que
 *     el RF declara bloqueados (ni más, ni menos).
 *  2. `AuthService.login/refresh`: la baja lógica revoca el acceso de la cuenta vinculada.
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALUMNO_PERFIL_ID = 'a1111111-1111-4111-8111-111111111111';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'guachafit_jwt_refresh_super_secret_key_2026';

function perfilAlumno(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: ALUMNO_PERFIL_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    entrenadorId: COACH_ID,
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '12345678',
    nombres: 'Ana',
    apellidos: 'Alumna',
    fechaNacimiento: '1996-01-01',
    telefonoWhatsapp: '+584120000000',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    fichaSaludPrivada: null,
    deletedAtUtc: null,
    ...overrides,
  };
}

function crearContexto(
  rol: Rol,
  sub: string,
  handler: (...args: any[]) => any,
  controller: new (...args: any[]) => any
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { sub, rol } }) }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

/** Mock mínimo de Drizzle para el SELECT del perfil del guard (select → from → where → limit). */
function crearDbConPerfil(perfil: any | null) {
  const db: any = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(perfil ? [{ ...perfil }] : []),
        }),
      }),
    }),
    // RNF-003/ADR-011 (etapa 3): el guard lee el perfil (RLS) dentro de withTenant.
    execute: async () => undefined,
  };
  db.transaction = async (cb: any) => cb(db);
  return db;
}

function guardsDelHandler(handler: (...args: any[]) => any): any[] {
  return Reflect.getMetadata('__guards__', handler) ?? [];
}

describe('RF-012 / WU-D: Enforcement de acceso por estado de activación (AlumnoHabilitadoGuard)', () => {
  const reflector = new Reflector();

  /**
   * Endpoints de planificación/checklist: pausado Y suspendido quedan fuera (RF-012 §4.A:
   * "No puede iniciar nuevas sesiones" y "Bloqueo de visualización de nuevas rutinas y checklist
   * interactivo").
   */
  const endpointsEntrenamiento: Array<{ nombre: string; handler: (...args: any[]) => any }> = [
    { nombre: 'obtenerSesionHoy', handler: EntrenamientoController.prototype.obtenerSesionHoy },
    { nombre: 'entrenarBloqueHoy', handler: EntrenamientoController.prototype.entrenarBloqueHoy },
    {
      nombre: 'obtenerSemanaActualProgreso',
      handler: EntrenamientoController.prototype.obtenerSemanaActualProgreso,
    },
    {
      nombre: 'obtenerRutinaActivaAlumno',
      handler: EntrenamientoController.prototype.obtenerRutinaActivaAlumno,
    },
    { nombre: 'iniciarSesion', handler: EntrenamientoController.prototype.iniciarSesion },
    { nombre: 'sincronizarSeries', handler: EntrenamientoController.prototype.sincronizarSeries },
    { nombre: 'finalizarSesion', handler: EntrenamientoController.prototype.finalizarSesion },
  ];

  describe('1. Registro del guard en los endpoints correctos (ni más ni menos)', () => {
    it('aplica AlumnoHabilitadoGuard a los 7 endpoints de planificación del alumno', () => {
      for (const { nombre, handler } of endpointsEntrenamiento) {
        expect(guardsDelHandler(handler), `endpoint ${nombre}`).toContain(
          AlumnoHabilitadoGuard
        );
      }
      expect(guardsDelHandler(NutricionController.prototype.registrarCheckinDiario)).toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(AntropometriaController.prototype.registrarCheckin)).toContain(
        AlumnoHabilitadoGuard
      );
    });

    it('NO aplica el guard a las lecturas de historial permitidas al pausado (RF-012 §4.A "modo lectura")', () => {
      expect(guardsDelHandler(EntrenamientoController.prototype.obtenerHistorialSesionesAlumno)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(EntrenamientoController.prototype.obtenerSesionPorId)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(NutricionController.prototype.listarCheckins)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(NutricionController.prototype.obtenerCheckinHoy)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(AntropometriaController.prototype.obtenerEvolucion)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(
        guardsDelHandler(AntropometriaController.prototype.obtenerComparativaFotografica)
      ).not.toContain(AlumnoHabilitadoGuard);
    });

    it('NO aplica el guard a Payos: el alumno suspendido conserva el reporte de pago', () => {
      expect(guardsDelHandler(FinanzasController.prototype.reportarPago)).not.toContain(
        AlumnoHabilitadoGuard
      );
      expect(guardsDelHandler(FinanzasController.prototype.obtenerHistorialCliente)).not.toContain(
        AlumnoHabilitadoGuard
      );
    });

    it('declara la metadata de estados bloqueados por endpoint', () => {
      expect(
        Reflect.getMetadata(
          ESTADOS_BLOQUEADOS_ALUMNO_KEY,
          EntrenamientoController.prototype.obtenerSesionHoy
        )
      ).toEqual([EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO]);

      // Nutrición: sólo pausado bloquea reportes; el suspendido por pago todavía reporta.
      expect(
        Reflect.getMetadata(
          ESTADOS_BLOQUEADOS_ALUMNO_KEY,
          NutricionController.prototype.registrarCheckinDiario
        )
      ).toEqual([EstadoAlumno.INACTIVO_PAUSADO]);
    });
  });

  describe('2. Comportamiento del guard por estado', () => {
    it('ACTIVO: deja pasar los 7 endpoints (sin falso bloqueo)', async () => {
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno()),
        reflector
      );

      for (const { handler } of endpointsEntrenamiento) {
        const contexto = crearContexto(
          Rol.ALUMNO,
          ALUMNO_USUARIO_ID,
          handler,
          EntrenamientoController
        );
        await expect(guard.canActivate(contexto)).resolves.toBe(true);
      }
    });

    it('INACTIVO_PAUSADO: 403 ALUMNO_BLOQUEADO en planificación, con mensaje claro', async () => {
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO })),
        reflector
      );

      let error: ForbiddenException | undefined;
      try {
        await guard.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            EntrenamientoController.prototype.obtenerSesionHoy,
            EntrenamientoController
          )
        );
      } catch (err) {
        error = err as ForbiddenException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error!.getResponse()).toMatchObject({
        statusCode: 403,
        code: 'ALUMNO_BLOQUEADO',
        estado: EstadoAlumno.INACTIVO_PAUSADO,
        motivo: 'ESTADO_ACTIVACION',
      });
      expect((error!.getResponse() as any).message).toContain('pausado');
    });

    it('SUSPENDIDO_PAGO: 403 con el texto de RF-012 sobre la mensualidad pendiente', async () => {
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO })),
        reflector
      );

      let error: ForbiddenException | undefined;
      try {
        await guard.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            EntrenamientoController.prototype.finalizarSesion,
            EntrenamientoController
          )
        );
      } catch (err) {
        error = err as ForbiddenException;
      }

      const cuerpo = error!.getResponse() as any;
      expect(cuerpo).toMatchObject({
        statusCode: 403,
        code: 'ALUMNO_BLOQUEADO',
        estado: EstadoAlumno.SUSPENDIDO_PAGO,
      });
      expect(cuerpo.message).toContain('mensualidad pendiente');
    });

    it('archivado (deletedAtUtc): bloquea SIEMPRE, incluso con estado activo', async () => {
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(
          perfilAlumno({
            estadoActivacion: EstadoAlumno.ACTIVO,
            deletedAtUtc: new Date('2026-01-10T12:00:00Z'),
          })
        ),
        reflector
      );

      let error: ForbiddenException | undefined;
      try {
        await guard.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            NutricionController.prototype.registrarCheckinDiario,
            NutricionController
          )
        );
      } catch (err) {
        error = err as ForbiddenException;
      }

      expect(error!.getResponse()).toMatchObject({
        statusCode: 403,
        code: 'ALUMNO_BLOQUEADO',
        estado: 'archivado',
        motivo: 'CUENTA_ARCHIVADA',
      });
    });

    it('pausado bloquea reportes (nutrición/antropometría) pero suspendido por pago NO', async () => {
      const perfilPausado = perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO });
      const perfilSuspendido = perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO });

      const guardPausado = new AlumnoHabilitadoGuard(crearDbConPerfil(perfilPausado), reflector);
      const guardSuspendido = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilSuspendido),
        reflector
      );

      await expect(
        guardPausado.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            NutricionController.prototype.registrarCheckinDiario,
            NutricionController
          )
        )
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        guardPausado.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            AntropometriaController.prototype.registrarCheckin,
            AntropometriaController
          )
        )
      ).rejects.toBeInstanceOf(ForbiddenException);

      // RF-012 §4.A suspendido: su bloqueo es de planificación, no de reportes.
      await expect(
        guardSuspendido.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            NutricionController.prototype.registrarCheckinDiario,
            NutricionController
          )
        )
      ).resolves.toBe(true);

      await expect(
        guardSuspendido.canActivate(
          crearContexto(
            Rol.ALUMNO,
            ALUMNO_USUARIO_ID,
            AntropometriaController.prototype.registrarCheckin,
            AntropometriaController
          )
        )
      ).resolves.toBe(true);
    });

    it('el historial en modo lectura sigue disponible para el pausado (sin bloqueo de lectura)', async () => {
      const guard = new AlumnoHabilitadoGuard(
        crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO })),
        reflector
      );

      for (const [handler, controller] of [
        [
          EntrenamientoController.prototype.obtenerHistorialSesionesAlumno,
          EntrenamientoController,
        ],
        [EntrenamientoController.prototype.obtenerSesionPorId, EntrenamientoController],
        [NutricionController.prototype.listarCheckins, NutricionController],
        [AntropometriaController.prototype.obtenerEvolucion, AntropometriaController],
      ] as const) {
        await expect(
          guard.canActivate(
            crearContexto(Rol.ALUMNO, ALUMNO_USUARIO_ID, handler as any, controller as any)
          )
        ).resolves.toBe(true);
      }
    });

    it('no interfiere con el coach: el mismo endpoint pasa aunque consulte a un alumno bloqueado', async () => {
      // El perfil devuelto por el mock pertenece al alumno; al ser rol ENTRENADOR el guard ni
      // siquiera consulta la BD (no debe afectar la operación del coach sobre la ficha).
      const db = crearDbConPerfil(perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO }));
      const guard = new AlumnoHabilitadoGuard(db, reflector);

      await expect(
        guard.canActivate(
          crearContexto(
            Rol.ENTRENADOR,
            COACH_ID,
            EntrenamientoController.prototype.obtenerRutinaActivaAlumno,
            EntrenamientoController
          )
        )
      ).resolves.toBe(true);
    });
  });

  describe('3. Soft delete revoca login/refresh (AuthService)', () => {
    /** RF-010 §6 (CASCADA-COACH): el entrenador del alumno es operable en el camino feliz. */
    const coachOperable = {
      usuarioId: COACH_ID,
      estadoLicencia: EstadoLicencia.ACTIVA,
      activo: true,
    };

    function crearDbAuth(store: { usuario: any; perfil: any }) {
      const db: any = {
        select: () => ({
          from: (table: any) => {
            const nombre = getTableName(table);
            const consulta: any = {
              innerJoin: () => consulta,
              // El chequeo de operabilidad usa `.limit(1)`; el resto de lecturas resuelve directo.
              where: () => {
                const filas =
                  nombre === 'usuarios'
                    ? [store.usuario]
                    : nombre === 'perfiles_entrenador'
                    ? [coachOperable]
                    : [store.perfil];
                return {
                  limit: () => Promise.resolve(filas),
                  then: (resolve: any, reject: any) => Promise.resolve(filas).then(resolve, reject),
                };
              },
            };
            return consulta;
          },
        }),
        update: () => ({
          set: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): login/refresh leen el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      db.transaction = async (cb: any) => cb(db);
      return db;
    }

    const crypto = {
      comparePassword: async () => true,
      hashPassword: async (p: string) => `hash-${p}`,
      hashSha256: (v: string) => v,
    } as any;

    const usuarioAlumno = {
      id: ALUMNO_USUARIO_ID,
      email: 'ana@guachafit.com',
      rol: Rol.ALUMNO,
      estado: EstadoUsuario.ACTIVO,
      activo: true,
      passwordHash: 'hash-secreta',
    };

    it('login: el alumno archivado NO puede iniciar sesión (mensaje claro, sin datos)', async () => {
      const service = new AuthService(
        crearDbAuth({
          usuario: { ...usuarioAlumno },
          perfil: perfilAlumno({ deletedAtUtc: new Date('2026-01-10T12:00:00Z') }),
        }),
        crypto
      );

      let error: UnauthorizedException | undefined;
      try {
        await service.login({ email: 'ana@guachafit.com', password: 'secreta' } as any);
      } catch (err) {
        error = err as UnauthorizedException;
      }

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error!.getResponse() as any).message).toContain('dada de baja');
    });

    it('login: el alumno pausado y el suspendido por pago SÍ entran (conservan su cuenta y Payos)', async () => {
      for (const estado of [EstadoAlumno.INACTIVO_PAUSADO, EstadoAlumno.SUSPENDIDO_PAGO]) {
        const service = new AuthService(
          crearDbAuth({
            usuario: { ...usuarioAlumno },
            perfil: perfilAlumno({ estadoActivacion: estado }),
          }),
          crypto
        );

        const res = await service.login({
          email: 'ana@guachafit.com',
          password: 'secreta',
        } as any);
        expect(res.accessToken).toBeTruthy();
        expect(res.usuario.entrenadorId).toBe(COACH_ID);
      }
    });

    it('refresh: el alumno archivado no renueva tokens y recibe el mensaje de baja (no el genérico)', async () => {
      const service = new AuthService(
        crearDbAuth({
          usuario: { ...usuarioAlumno },
          perfil: perfilAlumno({ deletedAtUtc: new Date('2026-01-10T12:00:00Z') }),
        }),
        crypto
      );

      const token = jwt.sign(
        { sub: ALUMNO_USUARIO_ID, email: usuarioAlumno.email, rol: Rol.ALUMNO },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      let error: UnauthorizedException | undefined;
      try {
        await service.refresh(token);
      } catch (err) {
        error = err as UnauthorizedException;
      }

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error!.getResponse() as any).message).toContain('dada de baja');
    });

    it('refresh: un bloqueado total (activo=true pero estado=bloqueado) tampoco renueva', async () => {
      const service = new AuthService(
        crearDbAuth({
          usuario: { ...usuarioAlumno, estado: EstadoUsuario.BLOQUEADO, activo: true },
          perfil: perfilAlumno(),
        }),
        crypto
      );

      const token = jwt.sign(
        { sub: ALUMNO_USUARIO_ID, email: usuarioAlumno.email, rol: Rol.ALUMNO },
        REFRESH_SECRET
      );

      await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refresh: token inválido conserva el mensaje genérico (sin filtrar estado del perfil)', async () => {
      const service = new AuthService(
        crearDbAuth({ usuario: { ...usuarioAlumno }, perfil: perfilAlumno() }),
        crypto
      );

      await expect(service.refresh('no-es-un-jwt')).rejects.toThrow(
        'Refresh token expirado o inválido.'
      );
    });

    it('reactivar restaura: tras la restauración el alumno vuelve a iniciar sesión', async () => {
      const store = {
        usuario: {
          ...usuarioAlumno,
          activo: false,
          estado: EstadoUsuario.INACTIVO,
        },
        perfil: perfilAlumno({
          estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
          deletedAtUtc: new Date('2026-01-10T12:00:00Z'),
        }),
      };

      const db: any = {
        select: () => ({
          from: (table: any) => {
            const nombre = getTableName(table);
            const consulta: any = {
              innerJoin: () => consulta,
              // El chequeo de operabilidad usa `.limit(1)`; el resto de lecturas resuelve directo.
              where: () => {
                const filas =
                  nombre === 'usuarios'
                    ? [store.usuario]
                    : nombre === 'perfiles_entrenador'
                    ? [coachOperable]
                    : [store.perfil];
                return {
                  limit: () => Promise.resolve(filas),
                  then: (resolve: any, reject: any) => Promise.resolve(filas).then(resolve, reject),
                };
              },
            };
            return consulta;
          },
        }),
        update: (table: any) => ({
          set: (valores: any) => ({
            where: () => {
              const destino = getTableName(table) === 'usuarios' ? store.usuario : store.perfil;
              Object.assign(destino, valores);
              return Promise.resolve([destino]);
            },
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): restaurar/login leen el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      db.transaction = async (cb: any) => cb(db);

      const alumnosService = new AlumnosService(db, crypto);
      await alumnosService.restaurarAlumno(COACH_ID, ALUMNO_PERFIL_ID);

      expect(store.perfil.deletedAtUtc).toBeNull();
      expect(store.perfil.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(store.usuario.activo).toBe(true);

      const authService = new AuthService(db, crypto);
      const res = await authService.login({
        email: usuarioAlumno.email,
        password: 'secreta',
      } as any);
      expect(res.accessToken).toBeTruthy();
    });
  });

  describe('4. Acciones del coach sobre archivados (RF-012 RN-02/RN-04)', () => {
    const crypto = {} as any;

    it('PATCH /alumnos/:id/estado soporta SUSPENDIDO_PAGO (endpoint real de la ficha)', async () => {
      const db: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([perfilAlumno()]),
          }),
        }),
        update: () => ({
          set: (valores: any) => ({
            where: () => ({
              returning: () =>
                Promise.resolve([
                  perfilAlumno({ estadoActivacion: valores.estadoActivacion }),
                ]),
            }),
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): cambiarEstado lee/escribe el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      db.transaction = async (cb: any) => cb(db);

      const service = new AlumnosService(db, crypto);
      const res = await service.cambiarEstado(COACH_ID, ALUMNO_PERFIL_ID, {
        nuevoEstado: EstadoAlumno.SUSPENDIDO_PAGO,
      } as any);

      expect(res.estadoActivacion).toBe(EstadoAlumno.SUSPENDIDO_PAGO);
      expect(res.mensaje).toContain('suspendido por pago');
    });

    it('un coach no puede editar el expediente de un alumno archivado: solo restaurarlo', async () => {
      const db: any = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () =>
                Promise.resolve([
                  {
                    ...perfilAlumno({ deletedAtUtc: new Date('2026-01-10T12:00:00Z') }),
                    email: 'ana@guachafit.com',
                  },
                ]),
            }),
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): actualizarAlumno lee el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      db.transaction = async (cb: any) => cb(db);

      const service = new AlumnosService(db, crypto);
      await expect(
        service.actualizarAlumno(COACH_ID, ALUMNO_PERFIL_ID, { nombres: 'Nuevo' } as any)
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('5. Verificación HTTP real (Nest + supertest): cuerpo 403 y cableado del guard', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'guachafit_jwt_super_secret_key_2026';

    async function crearApp(perfil: any | null): Promise<INestApplication> {
      const moduleRef = await Test.createTestingModule({
        controllers: [NutricionController],
        providers: [
          NutricionService,
          { provide: DRIZZLE_DB, useValue: crearDbConPerfil(perfil) },
        ],
      })
        // esbuild/vitest no emite `design:paramtypes`: RolesGuard (DI por tipo) se inyecta aquí
        // explícitamente. AlumnoHabilitadoGuard no lo necesita: declara tokens explícitos.
        .overrideGuard(RolesGuard)
        .useValue(new RolesGuard(new Reflector()))
        .compile();

      const app = moduleRef.createNestApplication();
      await app.init();
      return app;
    }

    function tokenAlumno() {
      return jwt.sign(
        { sub: ALUMNO_USUARIO_ID, email: 'ana@guachafit.com', rol: Rol.ALUMNO, entrenadorId: COACH_ID },
        JWT_SECRET,
        { expiresIn: '15m' }
      );
    }

    it('POST /nutricion/checkin-diario responde 403 con code/estado/motivo cuando el alumno está pausado', async () => {
      const app = await crearApp(
        perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO })
      );

      const res = await request(app.getHttpServer())
        .post('/nutricion/checkin-diario')
        .set('Authorization', `Bearer ${tokenAlumno()}`)
        .send({ fecha: '2026-09-21', semaforo: 'cumplido' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        code: 'ALUMNO_BLOQUEADO',
        estado: EstadoAlumno.INACTIVO_PAUSADO,
        motivo: 'ESTADO_ACTIVACION',
      });
      expect(res.body.message).toContain('pausado');

      await app.close();
    });

    it('el perfil archivado responde 403 aunque el estado de activación siga en activo', async () => {
      const app = await crearApp(
        perfilAlumno({
          estadoActivacion: EstadoAlumno.ACTIVO,
          deletedAtUtc: new Date('2026-01-10T12:00:00Z'),
        })
      );

      const res = await request(app.getHttpServer())
        .post('/nutricion/checkin-diario')
        .set('Authorization', `Bearer ${tokenAlumno()}`)
        .send({ fecha: '2026-09-21', semaforo: 'cumplido' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'ALUMNO_BLOQUEADO', estado: 'archivado' });

      await app.close();
    });

    it('un coach en el mismo endpoint no recibe ALUMNO_BLOQUEADO (el guard sólo evalúa al alumno)', async () => {
      const app = await crearApp(perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO }));

      const tokenCoach = jwt.sign(
        { sub: COACH_ID, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR, entrenadorId: COACH_ID },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app.getHttpServer())
        .post('/nutricion/checkin-diario')
        .set('Authorization', `Bearer ${tokenCoach}`)
        .send({ fecha: '2026-09-21', semaforo: 'cumplido' });

      // RolesGuard rechaza al entrenador (404 del endpoint es sólo para alumno), pero NUNCA con
      // el código de bloqueo de ciclo de vida.
      expect(res.status).toBe(403);
      expect(res.body.code).not.toBe('ALUMNO_BLOQUEADO');

      await app.close();
    });
  });
});
