import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ForbiddenException,
  Logger,
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { getTableName } from '@guachafit/database';
import { EstadoLicencia, EstadoUsuario, Rol } from '@guachafit/shared';
import {
  obtenerSecretosJwt,
  JWT_SECRET_DESARROLLO,
  JWT_REFRESH_SECRET_DESARROLLO,
} from '../../src/common/config/secretos-jwt';
import {
  LIMITE_INTENTOS_LOGIN,
  LIMITE_INTENTOS_LOGIN_POR_IP,
  LIMITE_INTENTOS_PUBLICO,
  LIMITE_INTENTOS_REFRESH,
  crearOpcionesLimiteIntentos,
  enmascararTracker,
} from '../../src/common/guards/limite-intentos.guard';
import { parsearTrustProxy, aplicarTrustProxy } from '../../src/common/config/trust-proxy';
import {
  MENSAJE_SESION_VENCIDA,
  MENSAJE_SIN_PERMISO,
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_CUENTA_DESACTIVADA,
  MENSAJE_DEMASIADOS_INTENTOS,
} from '../../src/common/mensajes-acceso';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AuthService } from '../../src/modules/auth/auth.service';
import { RONDAS_BCRYPT } from '../../src/common/services/crypto.service';
import { AuthController } from '../../src/modules/auth/auth.controller';

/**
 * LOTE API-1 — Seguridad de autenticación.
 *
 * - A3: los secretos JWT salen de una única función; en producción falta o valor de ejemplo
 *   => error al arrancar.
 * - A5: límite de intentos en login (429 con mensaje claro).
 * - A6: el login no revela el estado de la cuenta sin contraseña correcta.
 * - B2/B3/B4/B9: mensajes de sesión y permisos en lenguaje claro.
 */

// Los tests de cableado importan los mensajes de `mensajes-acceso.ts` (fuente única); el texto
// exacto que ve el usuario se fija una sola vez en el bloque "B9: textos visibles".
const MENSAJE_CREDENCIALES = MENSAJE_CREDENCIALES_INCORRECTAS;

// ============================================================================
// B9. Textos visibles al usuario
// ============================================================================
describe('B9: textos visibles al usuario', () => {
  it('fija el texto exacto (literal a propósito: es el contrato con la web y con el usuario)', () => {
    expect(MENSAJE_SESION_VENCIDA).toBe('Tu sesión venció. Inicia sesión de nuevo.');
    expect(MENSAJE_SIN_PERMISO).toBe('No tienes permiso para ver esta sección.');
    expect(MENSAJE_CREDENCIALES_INCORRECTAS).toBe('Correo o contraseña incorrectos.');
    expect(MENSAJE_CUENTA_DESACTIVADA).toBe('Tu cuenta está desactivada. Contacta a tu entrenador.');
    expect(MENSAJE_DEMASIADOS_INTENTOS).toBe(
      'Hiciste demasiados intentos. Espera un momento y vuelve a intentarlo.'
    );
  });
});

// ============================================================================
// A3. Secretos JWT centralizados
// ============================================================================
describe('A3: obtenerSecretosJwt', () => {
  const SECRETO_FUERTE = 'x'.repeat(48);
  const REFRESH_FUERTE = 'y'.repeat(48);

  it('en producción sin JWT_SECRET falla al arrancar con un mensaje claro para el operador', () => {
    expect(() =>
      obtenerSecretosJwt({ NODE_ENV: 'production', JWT_REFRESH_SECRET: REFRESH_FUERTE })
    ).toThrow(/JWT_SECRET/);
  });

  it('en producción sin JWT_REFRESH_SECRET falla al arrancar', () => {
    expect(() =>
      obtenerSecretosJwt({ NODE_ENV: 'production', JWT_SECRET: SECRETO_FUERTE })
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('en producción rechaza los valores de ejemplo', () => {
    expect(() =>
      obtenerSecretosJwt({
        NODE_ENV: 'production',
        JWT_SECRET: JWT_SECRET_DESARROLLO,
        JWT_REFRESH_SECRET: REFRESH_FUERTE,
      })
    ).toThrow(/JWT_SECRET/);
    expect(() =>
      obtenerSecretosJwt({
        NODE_ENV: 'production',
        JWT_SECRET: SECRETO_FUERTE,
        JWT_REFRESH_SECRET: JWT_REFRESH_SECRET_DESARROLLO,
      })
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('en producción con secretos reales los devuelve tal cual', () => {
    expect(
      obtenerSecretosJwt({
        NODE_ENV: 'production',
        JWT_SECRET: SECRETO_FUERTE,
        JWT_REFRESH_SECRET: REFRESH_FUERTE,
      })
    ).toEqual({ jwtSecret: SECRETO_FUERTE, refreshSecret: REFRESH_FUERTE });
  });

  it('en desarrollo y test usa el valor por defecto solo si falta la variable', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(obtenerSecretosJwt({ NODE_ENV })).toEqual({
        jwtSecret: JWT_SECRET_DESARROLLO,
        refreshSecret: JWT_REFRESH_SECRET_DESARROLLO,
      });
    }
    expect(
      obtenerSecretosJwt({ NODE_ENV: 'development', JWT_SECRET: 'propio', JWT_REFRESH_SECRET: 'otro' })
    ).toEqual({ jwtSecret: 'propio', refreshSecret: 'otro' });
  });
});

// ============================================================================
// B3. JwtAuthGuard: mensaje claro de sesión vencida
// ============================================================================
describe('B3: JwtAuthGuard responde con lenguaje claro', () => {
  function contexto(authorization?: string): ExecutionContext {
    const req: any = { headers: authorization ? { authorization } : {} };
    return { switchToHttp: () => ({ getRequest: () => req }) } as any;
  }

  it.each([
    ['sin encabezado', undefined],
    ['formato inválido', 'Basic abc'],
    ['token vencido', `Bearer ${jwt.sign({ sub: 'u' }, JWT_SECRET_DESARROLLO, { expiresIn: -10 })}`],
    ['token firmado con otro secreto', `Bearer ${jwt.sign({ sub: 'u' }, 'otro-secreto')}`],
  ])('%s => "%s"', (_caso, authorization) => {
    const guard = new JwtAuthGuard();
    let error: unknown;
    try {
      guard.canActivate(contexto(authorization));
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(MENSAJE_SESION_VENCIDA);
  });
});

// ============================================================================
// B2. RolesGuard: sin jerga de roles
// ============================================================================
describe('B2: RolesGuard responde con lenguaje claro', () => {
  it('rol no autorizado => "No tienes permiso para ver esta sección."', () => {
    const reflector = { getAllAndOverride: () => [Rol.ENTRENADOR] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const req = { user: { sub: 'u', rol: Rol.ALUMNO } };
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(MENSAJE_SIN_PERMISO);
  });

  it('el acceso denegado queda en logs como warn (con el detalle técnico, no visible al usuario)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const reflector = { getAllAndOverride: () => [Rol.ENTRENADOR] } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u', rol: Rol.ALUMNO } }) }),
    } as any;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Acceso denegado'));
    warn.mockRestore();
  });
});

// ============================================================================
// A6 + B9. Login: sin enumeración de estado y mensajes claros
// ============================================================================
describe('A6: login verifica la contraseña antes de revelar el estado de la cuenta', () => {
  const USUARIO_ID = '11111111-1111-4111-8111-111111111111';

  function crearDb(usuario: any) {
    const db: any = {
      select: () => ({
        from: (table: any) => {
          const nombre = getTableName(table);
          const filas =
            nombre === 'usuarios'
              ? usuario
                ? [usuario]
                : []
              : nombre === 'perfiles_entrenador'
                ? [{ estadoLicencia: EstadoLicencia.ACTIVA, activo: true }]
                : [];
          const consulta: any = {
            innerJoin: () => consulta,
            where: () => ({
              limit: () => Promise.resolve(filas),
              then: (resolve: any, reject: any) => Promise.resolve(filas).then(resolve, reject),
            }),
          };
          return consulta;
        },
      }),
      update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
      execute: async () => undefined,
    };
    db.transaction = async (cb: any) => cb(db);
    return db;
  }

  function crearCrypto(coincide: boolean) {
    return { comparePassword: vi.fn(async () => coincide) } as any;
  }

  const entrenador = {
    id: USUARIO_ID,
    email: 'coach@guachafit.com',
    rol: Rol.ENTRENADOR,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
    passwordHash: 'hash-real',
  };

  it('cuenta inactiva + contraseña incorrecta => mensaje genérico de credenciales', async () => {
    for (const parche of [{ activo: false }, { estado: EstadoUsuario.BLOQUEADO }]) {
      const service = new AuthService(crearDb({ ...entrenador, ...parche }), crearCrypto(false));
      await expect(
        service.login({ email: 'coach@guachafit.com', password: 'mala' } as any)
      ).rejects.toThrow(MENSAJE_CREDENCIALES);
    }
  });

  it('cuenta inactiva + contraseña correcta => informa la cuenta desactivada', async () => {
    for (const parche of [{ activo: false }, { estado: EstadoUsuario.BLOQUEADO }]) {
      const service = new AuthService(crearDb({ ...entrenador, ...parche }), crearCrypto(true));
      await expect(
        service.login({ email: 'coach@guachafit.com', password: 'buena' } as any)
      ).rejects.toThrow(MENSAJE_CUENTA_DESACTIVADA);
    }
  });

  it('usuario inexistente => compara contra un hash ficticio y responde el mensaje genérico', async () => {
    const crypto = crearCrypto(true);
    const service = new AuthService(crearDb(null), crypto);
    await expect(
      service.login({ email: 'nadie@guachafit.com', password: 'cualquiera' } as any)
    ).rejects.toThrow(MENSAJE_CREDENCIALES);
    expect(crypto.comparePassword).toHaveBeenCalledTimes(1);
    // Mismo costo que los hashes reales: el tiempo de respuesta no delata si el correo existe.
    const costo = String(RONDAS_BCRYPT).padStart(2, '0');
    expect(crypto.comparePassword.mock.calls[0][1].startsWith(`$2b$${costo}$`)).toBe(true);
  });

  it('cuenta sin contraseña aún (invitación pendiente) => compara y responde el mensaje genérico', async () => {
    const crypto = crearCrypto(true);
    const service = new AuthService(crearDb({ ...entrenador, passwordHash: null }), crypto);
    await expect(
      service.login({ email: 'coach@guachafit.com', password: 'x' } as any)
    ).rejects.toThrow(MENSAJE_CREDENCIALES);
    expect(crypto.comparePassword).toHaveBeenCalledTimes(1);
  });

  it('refresh con token inválido => "Tu sesión venció. Inicia sesión de nuevo."', async () => {
    const service = new AuthService(crearDb(entrenador), crearCrypto(true));
    await expect(service.refresh('no-es-un-jwt')).rejects.toThrow(MENSAJE_SESION_VENCIDA);
  });

  it('refresh de un usuario inactivo => "Tu sesión venció. Inicia sesión de nuevo."', async () => {
    const service = new AuthService(crearDb({ ...entrenador, activo: false }), crearCrypto(true));
    const token = jwt.sign(
      { sub: USUARIO_ID, email: entrenador.email, rol: Rol.ENTRENADOR },
      JWT_REFRESH_SECRET_DESARROLLO
    );
    await expect(service.refresh(token)).rejects.toThrow(MENSAJE_SESION_VENCIDA);
  });

  it('/auth/me de un usuario inactivo => "Tu sesión venció. Inicia sesión de nuevo."', async () => {
    const service = new AuthService(crearDb({ ...entrenador, activo: false }), crearCrypto(true));
    await expect(service.obtenerSesion(USUARIO_ID)).rejects.toThrow(MENSAJE_SESION_VENCIDA);
  });
});


// ============================================================================
// A5. Límite de intentos (login por IP + correo, refresh holgado, rutas públicas)
// ============================================================================
describe('A5: límite de intentos', () => {
  const entornoOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...entornoOriginal };
    vi.restoreAllMocks();
  });

  async function crearApp(entorno: { TRUST_PROXY?: string } = {}): Promise<INestApplication> {
    const authService = {
      login: vi.fn(async () => {
        throw new UnauthorizedException(MENSAJE_CREDENCIALES);
      }),
      refresh: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    aplicarTrustProxy(app, entorno);
    await app.init();
    return app;
  }

  function login(servidor: any, email: string, ip?: string) {
    const peticion = request(servidor).post('/auth/login');
    if (ip) peticion.set('X-Forwarded-For', ip);
    return peticion.send({ email, password: 'mala-clave-123' });
  }

  it('los límites son razonables: por correo estricto, por IP y refresh holgados', () => {
    expect(LIMITE_INTENTOS_LOGIN).toBe(5);
    expect(LIMITE_INTENTOS_LOGIN_POR_IP).toBe(60);
    expect(LIMITE_INTENTOS_REFRESH).toBe(60);
    expect(LIMITE_INTENTOS_PUBLICO).toBe(20);
  });

  it('POST /auth/login responde 429 con mensaje claro tras 5 intentos del mismo correo', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      expect((await login(servidor, 'coach@guachafit.com')).status).toBe(401);
    }

    const bloqueada = await login(servidor, 'coach@guachafit.com');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);

    await app.close();
  });

  it('el correo se normaliza (mayúsculas y espacios cuentan como el mismo correo)', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();
    const variantes = ['coach@guachafit.com', ' COACH@guachafit.com', 'Coach@Guachafit.com '];

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      // Solo importa que no se bloquee antes de tiempo (el contrato rechaza espacios con otro código).
      expect((await login(servidor, variantes[i % variantes.length])).status).not.toBe(429);
    }
    expect((await login(servidor, 'COACH@GUACHAFIT.COM')).status).toBe(429);

    await app.close();
  });

  it('dos correos distintos desde la misma IP (wifi del gimnasio) no se bloquean entre sí', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      expect((await login(servidor, 'ana@guachafit.com')).status).toBe(401);
    }
    expect((await login(servidor, 'ana@guachafit.com')).status).toBe(429);
    expect((await login(servidor, 'beto@guachafit.com')).status).toBe(401);

    await app.close();
  });

  it('tope por IP: frena el rociado de muchos correos desde una misma IP', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN_POR_IP; i++) {
      expect((await login(servidor, `alumno${i}@guachafit.com`)).status).toBe(401);
    }
    expect((await login(servidor, 'otro@guachafit.com')).status).toBe(429);

    await app.close();
  });

  it('refresh no consume el cupo del login y admite muchas renovaciones desde una IP', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      await login(servidor, 'coach@guachafit.com');
    }
    expect((await login(servidor, 'coach@guachafit.com')).status).toBe(429);

    for (let i = 0; i < LIMITE_INTENTOS_REFRESH; i++) {
      const res = await request(servidor).post('/auth/refresh').send({ refreshToken: 'refresh-token-de-prueba' });
      expect(res.status).toBe(200);
    }
    const bloqueada = await request(servidor).post('/auth/refresh').send({ refreshToken: 'refresh-token-de-prueba' });
    expect(bloqueada.status).toBe(429);

    await app.close();
  });

  it('sin TRUST_PROXY se ignora X-Forwarded-For (no se puede evadir el límite falseándolo)', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      expect((await login(servidor, 'coach@guachafit.com', `203.0.113.${i + 1}`)).status).toBe(401);
    }
    expect((await login(servidor, 'coach@guachafit.com', '198.51.100.7')).status).toBe(429);

    await app.close();
  });

  it('con TRUST_PROXY=1 se usa la IP real del cliente que reporta el proxy', async () => {
    const app = await crearApp({ TRUST_PROXY: '1' });
    const servidor = app.getHttpServer();

    for (let i = 0; i < LIMITE_INTENTOS_LOGIN; i++) {
      expect((await login(servidor, 'coach@guachafit.com', '203.0.113.1')).status).toBe(401);
    }
    expect((await login(servidor, 'coach@guachafit.com', '203.0.113.1')).status).toBe(429);
    expect((await login(servidor, 'coach@guachafit.com', '198.51.100.7')).status).toBe(401);

    await app.close();
  });

  it('al rechazar registra un warn con la ruta y el tracker enmascarado (sin el correo completo)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const app = await crearApp();
    const servidor = app.getHttpServer();

    for (let i = 0; i <= LIMITE_INTENTOS_LOGIN; i++) {
      await login(servidor, 'juana@guachafit.com');
    }

    const mensajes = warn.mock.calls.map((llamada) => String(llamada[0]));
    const rechazo = mensajes.find((m) => m.includes('/auth/login'));
    expect(rechazo).toBeDefined();
    expect(rechazo).toContain('j***@guachafit.com');
    expect(rechazo).not.toContain('juana@');

    await app.close();
  });

  it('enmascararTracker oculta el usuario del correo y deja la IP', () => {
    expect(enmascararTracker('10.0.0.1|juana@guachafit.com')).toBe('10.0.0.1|j***@guachafit.com');
    expect(enmascararTracker('10.0.0.1|')).toBe('10.0.0.1|(sin correo)');
    expect(enmascararTracker('10.0.0.1|sin-arroba')).toBe('10.0.0.1|***');
    expect(enmascararTracker('10.0.0.1')).toBe('10.0.0.1');
  });

  it('en NODE_ENV=test se puede desactivar de forma explícita; en producción no', () => {
    const contexto = {} as ExecutionContext;
    const enTest = crearOpcionesLimiteIntentos({
      NODE_ENV: 'test',
      LIMITE_INTENTOS_DESACTIVADO: 'true',
    });
    expect(enTest.skipIf?.(contexto)).toBe(true);

    const enProduccion = crearOpcionesLimiteIntentos({
      NODE_ENV: 'production',
      LIMITE_INTENTOS_DESACTIVADO: 'true',
    });
    expect(enProduccion.skipIf?.(contexto)).toBe(false);

    const enTestSinBandera = crearOpcionesLimiteIntentos({ NODE_ENV: 'test' });
    expect(enTestSinBandera.skipIf?.(contexto)).toBe(false);
  });
});

// ============================================================================
// A5. TRUST_PROXY: cuántos proxies (o qué subredes) son de confianza
// ============================================================================
describe('A5: parsearTrustProxy', () => {
  it('sin valor, vacío, "false" o "0" => desactivado (no se confía en X-Forwarded-For)', () => {
    for (const valor of [undefined, '', '   ', 'false', '0']) {
      expect(parsearTrustProxy(valor)).toBe(false);
    }
  });

  it('un entero => número de saltos de proxy', () => {
    expect(parsearTrustProxy('1')).toBe(1);
    expect(parsearTrustProxy(' 2 ')).toBe(2);
  });

  it('lista separada por comas => subredes/IPs de confianza (sin vacíos)', () => {
    expect(parsearTrustProxy('loopback, 173.245.48.0/20,,10.0.0.0/8')).toEqual([
      'loopback',
      '173.245.48.0/20',
      '10.0.0.0/8',
    ]);
  });

  it('"true" se rechaza: confiar en cualquier proxy permitiría falsear la IP', () => {
    expect(() => parsearTrustProxy('true')).toThrow(/TRUST_PROXY/);
  });

  it('un número negativo o decimal se rechaza con un mensaje para el operador', () => {
    expect(() => parsearTrustProxy('-1')).toThrow(/TRUST_PROXY/);
    expect(() => parsearTrustProxy('1.5')).toThrow(/TRUST_PROXY/);
  });
});
