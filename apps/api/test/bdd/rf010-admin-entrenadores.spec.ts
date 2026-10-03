import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { EstadoLicencia, EstadoUsuario, Modalidad, Rol } from '@guachafit/shared';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JWT_REFRESH_SECRET_DESARROLLO, JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';

/**
 * RF-010 (WU Admin): gestión de entrenadores desde el panel maestro y revocación de sesión (§6).
 *
 * Cubre el contrato REAL de:
 * - `GET /auth/entrenadores` (listado paginado del panel, solo Superadmin).
 * - `PATCH /auth/entrenadores/:id/estado` (deshabilitar/reactivar cuenta, idempotente, sin
 *   auto-deshabilitación y solo sobre entrenadores).
 * - `PATCH /auth/entrenadores/:id/licencia` (activar/suspender licencia, idempotente).
 * - Invalidación: login y refresh rechazan cuentas deshabilitadas y licencias suspendidas.
 */

const COACH_USUARIO_ID = 'c1111111-1111-4111-8111-111111111111';
const OTRO_COACH_ID = 'c2222222-2222-4222-8222-222222222222';
const PERFIL_ID = 'p1111111-1111-4111-8111-111111111111';
const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
const SUPERADMIN_ID = '50000000-0000-4000-8000-000000000001';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || JWT_REFRESH_SECRET_DESARROLLO;

/** Fila de `usuarios` tal como la devuelve el `select()` completo del servicio. */
function filaUsuario(parcial: Record<string, unknown> = {}) {
  return {
    id: COACH_USUARIO_ID,
    email: 'coach@guachafit.com',
    rol: Rol.ENTRENADOR,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
    passwordHash: 'hash-de-prueba',
    createdAtUtc: new Date('2026-09-01T12:00:00.000Z'),
    ...parcial,
  };
}

/** Fila de `perfiles_entrenador` tal como la devuelve el `select()` completo del servicio. */
function filaPerfil(parcial: Record<string, unknown> = {}) {
  return {
    id: PERFIL_ID,
    usuarioId: COACH_USUARIO_ID,
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: 'Marcos Fitness',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    capacidadMaxima: 50,
    telefonoContacto: '+584120000001',
    createdAtUtc: new Date('2026-09-01T12:00:00.000Z'),
    ...parcial,
  };
}

/** Fila del `select()` con columnas del listado del panel. */
function filaListado(parcial: Record<string, unknown> = {}) {
  return {
    usuarioId: COACH_USUARIO_ID,
    perfilId: PERFIL_ID,
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: 'Marcos Fitness',
    email: 'coach@guachafit.com',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: true,
    fechaAltaUtc: new Date('2026-09-01T12:00:00.000Z'),
    ...parcial,
  };
}

/**
 * Mock de Drizzle para el AuthService: cada `select()` consume la siguiente respuesta en orden y
 * la cadena es "thenable" en cualquier punto (`where`, `limit`, `offset`), igual que el builder
 * real. Los `update()` capturan la tabla y los valores escritos.
 */
function crearDbAdmin() {
  let respuestas: unknown[][] = [];
  let indice = 0;
  const updates: Array<{ tabla: unknown; valores: Record<string, unknown> }> = [];

  const crearConsulta = (resultado: unknown[]) => {
    const consulta: any = {
      from: vi.fn(() => consulta),
      innerJoin: vi.fn(() => consulta),
      where: vi.fn(() => consulta),
      orderBy: vi.fn(() => consulta),
      limit: vi.fn(() => consulta),
      offset: vi.fn(() => consulta),
      then: (resolve: (valor: unknown) => unknown) => resolve(resultado),
    };
    return consulta;
  };

  const db: any = {
    select: vi.fn(() => crearConsulta(respuestas[indice++] ?? [])),
    update: vi.fn((tabla: unknown) => ({
      set: vi.fn((valores: Record<string, unknown>) => {
        updates.push({ tabla, valores });
        return {
          where: vi.fn(() => ({
            then: (resolve: (valor: unknown) => unknown) => resolve([]),
          })),
        };
      }),
    })),
  };

  return {
    db,
    updates,
    setRespuestas: (nuevas: unknown[][]) => {
      respuestas = nuevas;
      indice = 0;
    },
  };
}

describe('RF-010 (WU Admin): gestión de entrenadores desde el panel maestro', () => {
  let mock: ReturnType<typeof crearDbAdmin>;
  let authService: AuthService;

  const mockCryptoService = {
    comparePassword: vi.fn().mockResolvedValue(true),
    hashSha256: vi.fn((token: string) => `sha256-${token}`),
    hashPassword: vi.fn(async (password: string) => `hash-${password}`),
  };

  beforeEach(() => {
    mock = crearDbAdmin();
    mockCryptoService.comparePassword.mockClear();
    mockCryptoService.comparePassword.mockResolvedValue(true);
    // RNF-003/ADR-011 (etapa 3): las rutas del alumno leen su perfil con RLS dentro de withTenant.
    // El mock lo resuelve como passthrough sobre la misma superficie de select() espiada.
    const withTenant = async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(mock.db);
    authService = new AuthService(mock.db, mockCryptoService as any, withTenant as any);
  });

  describe('1. Listado del panel (GET /auth/entrenadores)', () => {
    it('devuelve el envelope paginado con la fila completa y `fechaAltaUtc` en ISO', async () => {
      mock.setRespuestas([[{ total: 1 }], [filaListado()]]);

      const resultado = await authService.listarEntrenadores({ limit: 25, offset: 0 });

      expect(resultado).toEqual({
        items: [
          {
            usuarioId: COACH_USUARIO_ID,
            perfilId: PERFIL_ID,
            nombres: 'Marcos',
            apellidos: 'Fitness',
            nombreComercial: 'Marcos Fitness',
            email: 'coach@guachafit.com',
            coachCode: 'MARCOS-921',
            estadoLicencia: EstadoLicencia.ACTIVA,
            activo: true,
            fechaAltaUtc: '2026-09-01T12:00:00.000Z',
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      });
    });

    it('declara el estado real: cuenta deshabilitada y licencia suspendida viajan tal cual', async () => {
      mock.setRespuestas([
        [{ total: 2 }],
        [
          filaListado({ activo: false }),
          filaListado({
            usuarioId: OTRO_COACH_ID,
            email: 'otro@guachafit.com',
            coachCode: 'OTRO-100',
            estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
          }),
        ],
      ]);

      const resultado = await authService.listarEntrenadores({ limit: 25, offset: 0 });

      expect(resultado.total).toBe(2);
      expect(resultado.items[0].activo).toBe(false);
      expect(resultado.items[1].estadoLicencia).toBe(EstadoLicencia.SUSPENDIDA_SUPERADMIN);
    });

    it('un listado vacío devuelve `total: 0` sin inventar filas', async () => {
      mock.setRespuestas([[], []]);

      const resultado = await authService.listarEntrenadores({ limit: 25, offset: 0 });

      expect(resultado.items).toEqual([]);
      expect(resultado.total).toBe(0);
    });
  });

  describe('2. Deshabilitar/reactivar cuenta (PATCH /auth/entrenadores/:id/estado)', () => {
    it('deshabilita la cuenta y persiste `activo: false`', async () => {
      mock.setRespuestas([[filaUsuario()]]);

      const resultado = await authService.cambiarEstadoEntrenador(
        COACH_USUARIO_ID,
        { activo: false },
        SUPERADMIN_ID
      );

      expect(resultado).toMatchObject({ usuarioId: COACH_USUARIO_ID, activo: false, cambioAplicado: true });
      expect(resultado.mensaje).toContain('deshabilitado');
      expect(mock.updates).toHaveLength(1);
      expect(mock.updates[0].valores).toMatchObject({ activo: false });
    });

    it('reactiva la cuenta y persiste `activo: true`', async () => {
      mock.setRespuestas([[filaUsuario({ activo: false })]]);

      const resultado = await authService.cambiarEstadoEntrenador(
        COACH_USUARIO_ID,
        { activo: true },
        SUPERADMIN_ID
      );

      expect(resultado).toMatchObject({ activo: true, cambioAplicado: true });
      expect(mock.updates[0].valores).toMatchObject({ activo: true });
    });

    it('es idempotente: repetir el mismo estado no escribe', async () => {
      mock.setRespuestas([[filaUsuario({ activo: false })]]);

      const resultado = await authService.cambiarEstadoEntrenador(
        COACH_USUARIO_ID,
        { activo: false },
        SUPERADMIN_ID
      );

      expect(resultado).toMatchObject({ activo: false, cambioAplicado: false });
      expect(resultado.mensaje).toContain('ya estaba');
      expect(mock.updates).toHaveLength(0);
    });

    it('el Superadmin no puede deshabilitarse a sí mismo (400)', async () => {
      mock.setRespuestas([[filaUsuario()]]);

      await expect(
        authService.cambiarEstadoEntrenador(COACH_USUARIO_ID, { activo: false }, COACH_USUARIO_ID)
      ).rejects.toThrow(BadRequestException);
      expect(mock.updates).toHaveLength(0);
    });

    it('no aplica a alumnos (404: la colección es de entrenadores)', async () => {
      mock.setRespuestas([[filaUsuario({ id: ALUMNO_ID, rol: Rol.ALUMNO })]]);

      await expect(
        authService.cambiarEstadoEntrenador(ALUMNO_ID, { activo: false }, SUPERADMIN_ID)
      ).rejects.toThrow(NotFoundException);
      expect(mock.updates).toHaveLength(0);
    });

    it('un usuario inexistente responde 404', async () => {
      mock.setRespuestas([[]]);

      await expect(
        authService.cambiarEstadoEntrenador(OTRO_COACH_ID, { activo: false }, SUPERADMIN_ID)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Licencia (PATCH /auth/entrenadores/:id/licencia)', () => {
    it('suspende la licencia y persiste el enum real', async () => {
      mock.setRespuestas([[filaPerfil()]]);

      const resultado = await authService.cambiarLicenciaEntrenador(COACH_USUARIO_ID, {
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      });

      expect(resultado).toMatchObject({
        usuarioId: COACH_USUARIO_ID,
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
        cambioAplicado: true,
      });
      expect(mock.updates[0].valores).toMatchObject({
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      });
    });

    it('activa la licencia suspendida', async () => {
      mock.setRespuestas([[filaPerfil({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })]]);

      const resultado = await authService.cambiarLicenciaEntrenador(COACH_USUARIO_ID, {
        estadoLicencia: EstadoLicencia.ACTIVA,
      });

      expect(resultado).toMatchObject({ estadoLicencia: EstadoLicencia.ACTIVA, cambioAplicado: true });
      expect(resultado.mensaje).toContain('activa');
    });

    it('es idempotente: repetir la misma licencia no escribe', async () => {
      mock.setRespuestas([[filaPerfil({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })]]);

      const resultado = await authService.cambiarLicenciaEntrenador(COACH_USUARIO_ID, {
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      });

      expect(resultado.cambioAplicado).toBe(false);
      expect(resultado.mensaje).toContain('ya estaba');
      expect(mock.updates).toHaveLength(0);
    });

    it('un usuario sin perfil de entrenador responde 404', async () => {
      mock.setRespuestas([[]]);

      await expect(
        authService.cambiarLicenciaEntrenador(ALUMNO_ID, { estadoLicencia: EstadoLicencia.ACTIVA })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. Invalidación de sesión (RF-010 §6)', () => {
    it('login rechaza la cuenta deshabilitada DESPUÉS de comparar la contraseña (A6: sin enumeración)', async () => {
      mock.setRespuestas([[filaUsuario({ activo: false })]]);

      await expect(
        authService.login({ email: 'coach@guachafit.com', password: 'secreto-123' })
      ).rejects.toThrow(UnauthorizedException);
      expect(mockCryptoService.comparePassword).toHaveBeenCalledTimes(1);
    });

    it('login rechaza al coach con licencia suspendida (mensaje claro)', async () => {
      mock.setRespuestas([
        [filaUsuario()],
        [{ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN }],
      ]);

      await expect(
        authService.login({ email: 'coach@guachafit.com', password: 'secreto-123' })
      ).rejects.toThrow(/licencia de esta cuenta no está activa/i);
    });

    it('login de un coach sin perfil de entrenador también se rechaza (cuenta inconsistente)', async () => {
      mock.setRespuestas([[filaUsuario()], []]);

      await expect(
        authService.login({ email: 'coach@guachafit.com', password: 'secreto-123' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refresh rechaza la cuenta deshabilitada', async () => {
      const refreshToken = jwt.sign(
        { sub: COACH_USUARIO_ID, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      mock.setRespuestas([[filaUsuario({ activo: false })]]);

      await expect(authService.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('refresh rechaza la licencia suspendida', async () => {
      const refreshToken = jwt.sign(
        { sub: COACH_USUARIO_ID, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      mock.setRespuestas([
        [filaUsuario()],
        [{ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN }],
      ]);

      await expect(authService.refresh(refreshToken)).rejects.toThrow(
        /licencia de esta cuenta no está activa/i
      );
    });

    it('refresh renueva tokens cuando la licencia está activa (sin regresión)', async () => {
      const refreshToken = jwt.sign(
        { sub: COACH_USUARIO_ID, email: 'coach@guachafit.com', rol: Rol.ENTRENADOR },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      mock.setRespuestas([[filaUsuario()], [{ estadoLicencia: EstadoLicencia.ACTIVA }]]);

      const resultado = await authService.refresh(refreshToken);

      expect(resultado.accessToken).toBeTruthy();
      expect(resultado.refreshToken).toBeTruthy();
    });

    it('`/auth/me` cierra la sesión del coach con licencia suspendida', async () => {
      mock.setRespuestas([
        [filaUsuario()],
        [{ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN }],
      ]);

      await expect(authService.obtenerSesion(COACH_USUARIO_ID)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('`/auth/me` sigue resolviendo la sesión del coach con licencia activa', async () => {
      mock.setRespuestas([[filaUsuario()], [{ estadoLicencia: EstadoLicencia.ACTIVA }]]);

      const sesion = await authService.obtenerSesion(COACH_USUARIO_ID);

      expect(sesion).toMatchObject({ id: COACH_USUARIO_ID, rol: Rol.ENTRENADOR, entrenadorId: COACH_USUARIO_ID });
    });

    it('el canje de invitación del coach rechaza la licencia suspendida sin consumir el token', async () => {
      mock.setRespuestas([
        [
          filaUsuario({
            passwordHash: null,
            tokenInvitacionHash: 'sha256-token-valido',
            tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
          }),
        ],
        [{ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN }],
      ]);

      await expect(
        authService.establecerPasswordConToken({
          token: 'token-valido',
          password: 'nueva-clave-2026',
        })
      ).rejects.toThrow(/licencia/i);
      expect(mock.updates).toHaveLength(0);
    });

    it('el canje de invitación del coach con licencia activa emite sesión (sin regresión)', async () => {
      mock.setRespuestas([
        [
          filaUsuario({
            passwordHash: null,
            tokenInvitacionHash: 'sha256-token-valido',
            tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
          }),
        ],
        [{ estadoLicencia: EstadoLicencia.ACTIVA }],
      ]);

      const resultado = await authService.establecerPasswordConToken({
        token: 'token-valido',
        password: 'nueva-clave-2026',
      });

      expect(resultado.accessToken).toBeTruthy();
      expect(mock.updates[0].valores).toMatchObject({ passwordHash: 'hash-nueva-clave-2026' });
    });
  });

  describe('5. Cascada hacia los alumnos (RF-010 §6)', () => {
    const MENSAJE_ENTRENADOR_NO_OPERABLE =
      'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.';

    /** Fila de `usuarios` para el alumno que intenta iniciar sesión. */
    function filaUsuarioAlumno(parcial: Record<string, unknown> = {}) {
      return filaUsuario({
        id: ALUMNO_ID,
        email: 'alumno@guachafit.com',
        rol: Rol.ALUMNO,
        ...parcial,
      });
    }

    /** Fila de `perfiles_alumno` con la vinculación al coach. */
    function filaPerfilAlumno(parcial: Record<string, unknown> = {}) {
      return {
        usuarioId: ALUMNO_ID,
        entrenadorId: COACH_USUARIO_ID,
        modalidad: Modalidad.PRESENCIAL,
        deletedAtUtc: null,
        ...parcial,
      };
    }

    /** Fila que devuelve el chequeo unificado de operabilidad del entrenador. */
    function filaEntrenadorOperable(parcial: Record<string, unknown> = {}) {
      return { activo: true, estadoLicencia: EstadoLicencia.ACTIVA, ...parcial };
    }

    async function capturarError(promesa: Promise<unknown>): Promise<UnauthorizedException> {
      try {
        await promesa;
      } catch (error) {
        return error as UnauthorizedException;
      }
      throw new Error('Se esperaba una excepción y la promesa resolvió.');
    }

    it('login del alumno: cuenta del coach deshabilitada se bloquea con el mensaje único', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ activo: false })],
      ]);

      const error = await capturarError(
        authService.login({ email: 'alumno@guachafit.com', password: 'secreto-123' })
      );

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error.getResponse() as any).message).toBe(MENSAJE_ENTRENADOR_NO_OPERABLE);
    });

    it('login del alumno: licencia suspendida del coach se bloquea con el mismo mensaje', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })],
      ]);

      const error = await capturarError(
        authService.login({ email: 'alumno@guachafit.com', password: 'secreto-123' })
      );

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error.getResponse() as any).message).toBe(MENSAJE_ENTRENADOR_NO_OPERABLE);
    });

    it('reactivar la cuenta del coach desbloquea el login del alumno (desbloqueo inmediato)', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ activo: false })],
      ]);
      await expect(
        authService.login({ email: 'alumno@guachafit.com', password: 'secreto-123' })
      ).rejects.toThrow(UnauthorizedException);

      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ activo: true })],
      ]);
      const resultado = await authService.login({
        email: 'alumno@guachafit.com',
        password: 'secreto-123',
      });

      expect(resultado.accessToken).toBeTruthy();
      expect(resultado.usuario.entrenadorId).toBe(COACH_USUARIO_ID);
    });

    it('reactivar la licencia del coach desbloquea el login del alumno (desbloqueo inmediato)', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })],
      ]);
      await expect(
        authService.login({ email: 'alumno@guachafit.com', password: 'secreto-123' })
      ).rejects.toThrow(UnauthorizedException);

      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ estadoLicencia: EstadoLicencia.ACTIVA })],
      ]);
      const resultado = await authService.login({
        email: 'alumno@guachafit.com',
        password: 'secreto-123',
      });

      expect(resultado.accessToken).toBeTruthy();
    });

    it('login de fila legacy sin coach vinculado no paga el chequeo (sin cambio de comportamiento)', async () => {
      mock.setRespuestas([[filaUsuarioAlumno()], [filaPerfilAlumno({ entrenadorId: null })]]);

      const resultado = await authService.login({
        email: 'alumno@guachafit.com',
        password: 'secreto-123',
      });

      expect(resultado.accessToken).toBeTruthy();
      expect(resultado.usuario.entrenadorId).toBeNull();
    });

    it('`/auth/me` del alumno se bloquea si la cuenta del coach está deshabilitada', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ activo: false })],
      ]);

      const error = await capturarError(authService.obtenerSesion(ALUMNO_ID));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error.getResponse() as any).message).toBe(MENSAJE_ENTRENADOR_NO_OPERABLE);
    });

    it('`/auth/me` del alumno sigue resolviendo la sesión con el coach operable (sin regresión)', async () => {
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable()],
      ]);

      const sesion = await authService.obtenerSesion(ALUMNO_ID);

      expect(sesion).toMatchObject({
        id: ALUMNO_ID,
        rol: Rol.ALUMNO,
        entrenadorId: COACH_USUARIO_ID,
        modalidad: Modalidad.PRESENCIAL,
      });
    });

    it('refresh del alumno se bloquea si la licencia del coach está suspendida', async () => {
      const refreshToken = jwt.sign(
        { sub: ALUMNO_ID, email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN })],
      ]);

      const error = await capturarError(authService.refresh(refreshToken));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error.getResponse() as any).message).toBe(MENSAJE_ENTRENADOR_NO_OPERABLE);
    });

    it('refresh del alumno renueva tokens con el coach operable (sin regresión)', async () => {
      const refreshToken = jwt.sign(
        { sub: ALUMNO_ID, email: 'alumno@guachafit.com', rol: Rol.ALUMNO },
        REFRESH_SECRET,
        { expiresIn: '7d' }
      );
      mock.setRespuestas([
        [filaUsuarioAlumno()],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable()],
      ]);

      const resultado = await authService.refresh(refreshToken);

      expect(resultado.accessToken).toBeTruthy();
      expect(resultado.refreshToken).toBeTruthy();
    });

    it('el canje del alumno se bloquea con el coach deshabilitado y no consume el token', async () => {
      mock.setRespuestas([
        [
          filaUsuarioAlumno({
            passwordHash: null,
            tokenInvitacionHash: 'sha256-token-valido',
            tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
          }),
        ],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable({ activo: false })],
      ]);

      const error = await capturarError(
        authService.establecerPasswordConToken({
          token: 'token-valido',
          password: 'nueva-clave-2026',
        })
      );

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error.getResponse() as any).message).toBe(MENSAJE_ENTRENADOR_NO_OPERABLE);
      expect(mock.updates).toHaveLength(0);
    });

    it('el canje del alumno emite sesión con el coach operable (sin regresión)', async () => {
      mock.setRespuestas([
        [
          filaUsuarioAlumno({
            passwordHash: null,
            tokenInvitacionHash: 'sha256-token-valido',
            tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
          }),
        ],
        [filaPerfilAlumno()],
        [filaEntrenadorOperable()],
      ]);

      const resultado = await authService.establecerPasswordConToken({
        token: 'token-valido',
        password: 'nueva-clave-2026',
      });

      expect(resultado.accessToken).toBeTruthy();
      expect(resultado.usuario.entrenadorId).toBe(COACH_USUARIO_ID);
      expect(mock.updates[0].valores).toMatchObject({ passwordHash: 'hash-nueva-clave-2026' });
    });
  });
});

/**
 * Verificación HTTP real (Nest + supertest): roles del panel maestro, validación de params/body y
 * llamada exacta al servicio. El `AuthService` va mockeado: aquí se fija el contrato del controller.
 */
describe('RF-010 (WU Admin): verificación HTTP real del panel maestro', () => {
  const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;

  function token(rol: Rol, sub: string): string {
    return jwt.sign({ sub, email: `${rol}@guachafit.com`, rol }, JWT_SECRET, { expiresIn: '15m' });
  }

  async function crearApp(servicio: Record<string, unknown>): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: servicio }],
    })
      // esbuild/vitest no emite `design:paramtypes`: el guard real se inyecta con su Reflector.
      .overrideGuard(RolesGuard)
      .useValue(new RolesGuard(new Reflector()))
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  describe('1. GET /auth/entrenadores', () => {
    it('Superadmin → 200 con la paginación por defecto aplicada', async () => {
      const listarEntrenadores = vi.fn(async () => ({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
      }));
      const app = await crearApp({ listarEntrenadores });

      const res = await request(app.getHttpServer())
        .get('/auth/entrenadores')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`);

      expect(res.status).toBe(200);
      expect(listarEntrenadores).toHaveBeenCalledWith({ limit: 25, offset: 0 });

      await app.close();
    });

    it('Entrenador → 403 y el servicio nunca se invoca', async () => {
      const listarEntrenadores = vi.fn();
      const app = await crearApp({ listarEntrenadores });

      const res = await request(app.getHttpServer())
        .get('/auth/entrenadores')
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_USUARIO_ID)}`);

      expect(res.status).toBe(403);
      expect(listarEntrenadores).not.toHaveBeenCalled();

      await app.close();
    });

    it('Alumno → 403', async () => {
      const listarEntrenadores = vi.fn();
      const app = await crearApp({ listarEntrenadores });

      const res = await request(app.getHttpServer())
        .get('/auth/entrenadores')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_ID)}`);

      expect(res.status).toBe(403);

      await app.close();
    });

    it('limit fuera del techo → 400 con el mensaje del contrato', async () => {
      const listarEntrenadores = vi.fn();
      const app = await crearApp({ listarEntrenadores });

      const res = await request(app.getHttpServer())
        .get('/auth/entrenadores?limit=999')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`);

      expect(res.status).toBe(400);
      expect(listarEntrenadores).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe('2. PATCH /auth/entrenadores/:id/estado', () => {
    it('Superadmin → 200 y el servicio recibe el UUID, el body y el solicitante', async () => {
      const cambiarEstadoEntrenador = vi.fn(async () => ({
        usuarioId: COACH_USUARIO_ID,
        activo: false,
        cambioAplicado: true,
        mensaje: 'Entrenador deshabilitado.',
      }));
      const app = await crearApp({ cambiarEstadoEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/estado`)
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ activo: false });

      expect(res.status).toBe(200);
      expect(cambiarEstadoEntrenador).toHaveBeenCalledWith(
        COACH_USUARIO_ID,
        { activo: false },
        SUPERADMIN_ID
      );

      await app.close();
    });

    it('Entrenador → 403 y el servicio nunca se invoca', async () => {
      const cambiarEstadoEntrenador = vi.fn();
      const app = await crearApp({ cambiarEstadoEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/estado`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_USUARIO_ID)}`)
        .send({ activo: false });

      expect(res.status).toBe(403);
      expect(cambiarEstadoEntrenador).not.toHaveBeenCalled();

      await app.close();
    });

    it('id no UUID → 400', async () => {
      const cambiarEstadoEntrenador = vi.fn();
      const app = await crearApp({ cambiarEstadoEntrenador });

      const res = await request(app.getHttpServer())
        .patch('/auth/entrenadores/no-es-uuid/estado')
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ activo: false });

      expect(res.status).toBe(400);
      expect(cambiarEstadoEntrenador).not.toHaveBeenCalled();

      await app.close();
    });

    it('body sin booleano → 400 con el mensaje del contrato', async () => {
      const cambiarEstadoEntrenador = vi.fn();
      const app = await crearApp({ cambiarEstadoEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/estado`)
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ activo: 'sí' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/booleano/i);
      expect(cambiarEstadoEntrenador).not.toHaveBeenCalled();

      await app.close();
    });
  });

  describe('3. PATCH /auth/entrenadores/:id/licencia', () => {
    it('Superadmin → 200 con el enum real', async () => {
      const cambiarLicenciaEntrenador = vi.fn(async () => ({
        usuarioId: COACH_USUARIO_ID,
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
        cambioAplicado: true,
        mensaje: 'Licencia suspendida.',
      }));
      const app = await crearApp({ cambiarLicenciaEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/licencia`)
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN });

      expect(res.status).toBe(200);
      expect(cambiarLicenciaEntrenador).toHaveBeenCalledWith(COACH_USUARIO_ID, {
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      });

      await app.close();
    });

    it('Alumno → 403', async () => {
      const cambiarLicenciaEntrenador = vi.fn();
      const app = await crearApp({ cambiarLicenciaEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/licencia`)
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_ID)}`)
        .send({ estadoLicencia: EstadoLicencia.ACTIVA });

      expect(res.status).toBe(403);

      await app.close();
    });

    it('licencia fuera del enum → 400', async () => {
      const cambiarLicenciaEntrenador = vi.fn();
      const app = await crearApp({ cambiarLicenciaEntrenador });

      const res = await request(app.getHttpServer())
        .patch(`/auth/entrenadores/${COACH_USUARIO_ID}/licencia`)
        .set('Authorization', `Bearer ${token(Rol.SUPERADMIN, SUPERADMIN_ID)}`)
        .send({ estadoLicencia: 'vencida' });

      expect(res.status).toBe(400);
      expect(cambiarLicenciaEntrenador).not.toHaveBeenCalled();

      await app.close();
    });
  });
});
