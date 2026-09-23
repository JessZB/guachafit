import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Rol, Modalidad, EstadoUsuario, EstadoLicencia } from '@guachafit/shared';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';

/**
 * WU RF-003a (RF-003 RN-03/RN-04): la modalidad del perfil del alumno viaja en el DTO de sesión.
 *
 * La web necesita saber si el alumno es presencial (formulario en solo lectura) sin una petición
 * extra; `POST /auth/login` y `GET /auth/me` la exponen. `/auth/me` la resuelve contra el perfil
 * ACTUAL (no contra el claim del JWT), así un cambio de modalidad se refleja de inmediato.
 */
describe('WU RF-003a: modalidad del alumno en el DTO de sesión', () => {
  const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
  const COACH_ID = 'c1111111-1111-4111-8111-111111111111';

  let authService: AuthService;
  let authController: AuthController;
  let respuestasSelect: any[][];
  let filaUsuario: any;
  let filaPerfil: any;

  function crearDbAuth() {
    let indice = 0;
    const db: any = {
      select: vi.fn(() => {
        const resultado = respuestasSelect[indice++] ?? [];
        const consulta: any = {
          from: vi.fn(() => consulta),
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              then: (resolve: (valor: any) => unknown) => resolve(resultado),
            })),
            then: (resolve: (valor: any) => unknown) => resolve(resultado),
          })),
        };
        return consulta;
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            then: (resolve: (valor: any) => unknown) => resolve([]),
          })),
        })),
      })),
    };
    return db;
  }

  const mockCryptoService = {
    comparePassword: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    filaUsuario = {
      id: ALUMNO_ID,
      email: 'alumno@guachafit.com',
      rol: Rol.ALUMNO,
      estado: EstadoUsuario.ACTIVO,
      activo: true,
      passwordHash: 'hash-de-prueba',
    };
    filaPerfil = {
      usuarioId: ALUMNO_ID,
      entrenadorId: COACH_ID,
      modalidad: Modalidad.REMOTO,
      deletedAtUtc: null,
    };

    respuestasSelect = [[filaUsuario], [filaPerfil]];
    mockCryptoService.comparePassword.mockResolvedValue(true);

    authService = new AuthService(crearDbAuth(), mockCryptoService as any);
    authController = new AuthController(authService);
  });

  it('login del alumno incluye `modalidad` y `entrenadorId` en `usuario`', async () => {
    const resultado = await authService.login({
      email: 'alumno@guachafit.com',
      password: 'secreto-123',
    });

    expect(resultado.accessToken).toBeTruthy();
    expect(resultado.usuario).toEqual({
      id: ALUMNO_ID,
      email: 'alumno@guachafit.com',
      rol: Rol.ALUMNO,
      entrenadorId: COACH_ID,
      modalidad: Modalidad.REMOTO,
    });
  });

  it('login del entrenador expone `modalidad: null` (no tiene perfil de alumno)', async () => {
    filaUsuario = { ...filaUsuario, id: COACH_ID, rol: Rol.ENTRENADOR, email: 'coach@guachafit.com' };
    // RF-010 §6 (WU Admin): el login del coach ahora verifica la licencia contra su perfil.
    respuestasSelect = [[filaUsuario], [{ estadoLicencia: EstadoLicencia.ACTIVA }]];

    const resultado = await authService.login({
      email: 'coach@guachafit.com',
      password: 'secreto-123',
    });

    expect(resultado.usuario.entrenadorId).toBe(COACH_ID);
    expect(resultado.usuario.modalidad).toBeNull();
  });

  it('`/auth/me` responde el envelope `{ usuario }` con la modalidad del perfil actual', async () => {
    const respuesta = await authController.me({ user: { sub: ALUMNO_ID, rol: Rol.ALUMNO } });

    expect(respuesta.usuario.modalidad).toBe(Modalidad.REMOTO);
    expect(respuesta.usuario.id).toBe(ALUMNO_ID);
    expect(respuesta.usuario.entrenadorId).toBe(COACH_ID);
  });

  it('`obtenerSesion` refleja un cambio de modalidad posterior al login (sin esperar al JWT)', async () => {
    filaPerfil = { ...filaPerfil, modalidad: Modalidad.PRESENCIAL };
    respuestasSelect = [[filaUsuario], [filaPerfil]];

    const sesion = await authService.obtenerSesion(ALUMNO_ID);

    expect(sesion.modalidad).toBe(Modalidad.PRESENCIAL);
  });

  it('`obtenerSesion` rechaza al alumno dado de baja lógica (RF-012 RN-02)', async () => {
    filaPerfil = { ...filaPerfil, deletedAtUtc: '2026-01-10T12:00:00.000Z' };
    respuestasSelect = [[filaUsuario], [filaPerfil]];

    await expect(authService.obtenerSesion(ALUMNO_ID)).rejects.toThrow(UnauthorizedException);
  });

  it('`obtenerSesion` rechaza cuentas inactivas o inexistentes', async () => {
    respuestasSelect = [[]];
    await expect(authService.obtenerSesion(ALUMNO_ID)).rejects.toThrow(UnauthorizedException);

    filaUsuario = { ...filaUsuario, activo: false };
    respuestasSelect = [[filaUsuario]];
    await expect(authService.obtenerSesion(ALUMNO_ID)).rejects.toThrow(UnauthorizedException);
  });
});
