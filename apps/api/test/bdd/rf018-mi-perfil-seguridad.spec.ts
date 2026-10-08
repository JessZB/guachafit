/**
 * RF-018 "Mi perfil" — LOTE API · SEGURIDAD de la cuenta (contratos A, E, F, G, H e I del prompt 01).
 *
 * FASE ROJA: el código de producción de RF-018 todavía NO existe. Estos tests lo fijan:
 * - Contratos compartidos: `CambiarPasswordSchema`, `SolicitarCambioCorreoSchema`,
 *   `ConfirmarCambioCorreoSchema` y los 5 mensajes de seguridad de `@guachafit/shared`.
 * - `AuthService` (existente) gana `cambiarPassword`, `solicitarCambioCorreo`,
 *   `cancelarCambioCorreoPendiente` y `confirmarCambioCorreo`.
 * - Eventos `ConfirmacionCambioCorreoEvent`, `AvisoCorreoCambiadoEvent` y `AvisoPasswordCambiadaEvent`
 *   en `eventos-correo-cuenta.ts`; plantillas nuevas en `plantillas-correo.ts`; el payload del aviso
 *   al correo anterior lleva `correoNuevo` (contrato 30; ambigüedad anotada en el reporte).
 * - Rutas: `POST /usuarios/me/password`, `POST /usuarios/me/correo` y
 *   `DELETE /usuarios/me/correo-pendiente` en el `UsuariosController` existente;
 *   `POST /auth/confirmar-cambio-correo` (público) en el `AuthController` existente.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CambiarPasswordSchema,
  ConfirmarCambioCorreoSchema,
  EstadoUsuario,
  MENSAJE_CAMBIO_CORREO_CANCELADO,
  MENSAJE_CORREO_EN_USO,
  MENSAJE_CORREO_IGUAL_AL_ACTUAL,
  MENSAJE_DATO_NO_EDITABLE,
  MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO,
  MENSAJE_PASSWORD_ACTUAL_INCORRECTA,
  MENSAJE_PASSWORD_CAMBIADA,
  MENSAJE_PASSWORD_NUEVA_IGUAL,
  RestablecerPasswordSchema,
  Rol,
  SolicitarCambioCorreoSchema,
  mensajeCambioCorreoSolicitado,
  mensajeCorreoConfirmado,
} from '@guachafit/shared';
import { LIMITE_INTENTOS_CUENTA, LIMITE_INTENTOS_PUBLICO } from '../../src/common/guards/limite-intentos.guard';
import {
  JWT_REFRESH_SECRET_DESARROLLO,
  JWT_SECRET_DESARROLLO,
} from '../../src/common/config/secretos-jwt';
import { MENSAJE_DEMASIADOS_INTENTOS, MENSAJE_SESION_VENCIDA } from '../../src/common/mensajes-acceso';
import { DRIZZLE_DB } from '../../src/database/database.module';
import { CryptoService } from '../../src/common/services/crypto.service';
import { enmascararCorreo } from '../../src/common/enmascarar-correo.util';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';
import {
  AvisoCorreoCambiadoEvent,
  AvisoPasswordCambiadaEvent,
  ConfirmacionCambioCorreoEvent,
  TIPOS_CORREO_CUENTA,
} from '../../src/modules/notificaciones/events/eventos-correo-cuenta';
import { construirCorreoCuenta } from '../../src/modules/notificaciones/correo/plantillas-correo';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { UsuariosController } from '../../src/modules/usuarios/usuarios.controller';
import { UsuariosService } from '../../src/modules/usuarios/usuarios.service';

const entornoOriginal = { ...process.env };
afterEach(() => {
  process.env = { ...entornoOriginal };
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const COACH_ID = '22222222-2222-4222-8222-222222222222';
const OTRO_USUARIO_ID = '99999999-9999-4999-8999-999999999999';
const PASSWORD_ACTUAL = 'clave-actual-segura';
const PASSWORD_NUEVA = 'nueva-clave-segura';
const TOKEN_CAMBIO = 'a'.repeat(64);
const NOW = new Date('2026-10-06T12:00:00.000Z');
const VIGENCIA_CAMBIO_CORREO_MS = 24 * 60 * 60 * 1000;

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

// ============================================================================
// A. Contratos compartidos de seguridad
// ============================================================================
describe('RF-018 · A · contratos compartidos de seguridad', () => {
  it('[A2] CambiarPasswordSchema exige la actual y la misma política que la recuperación', () => {
    expect(
      CambiarPasswordSchema.safeParse({ passwordActual: 'x', passwordNueva: 'nueva-clave-1' }).success
    ).toBe(true);
    expect(CambiarPasswordSchema.safeParse({ passwordActual: '', passwordNueva: 'nueva-clave-1' }).success).toBe(
      false
    );
    expect(CambiarPasswordSchema.safeParse({ passwordActual: 'x' }).success).toBe(false);
    expect(CambiarPasswordSchema.safeParse({ passwordActual: 'x', passwordNueva: 'corta' }).success).toBe(
      false
    );

    // La política de `passwordNueva` es EXACTAMENTE la de `RestablecerPasswordSchema` (8..100).
    for (const password of ['a'.repeat(7), 'a'.repeat(8), 'a'.repeat(100), 'a'.repeat(101)]) {
      const enCambio = CambiarPasswordSchema.safeParse({
        passwordActual: 'x',
        passwordNueva: password,
      }).success;
      const enRecuperacion = RestablecerPasswordSchema.safeParse({
        token: 't'.repeat(32),
        password,
      }).success;
      expect(enCambio, `contraseña de ${password.length} caracteres`).toBe(enRecuperacion);
    }
  });

  it('[A3] SolicitarCambioCorreoSchema normaliza el correo (minúsculas y sin espacios)', () => {
    const ok = SolicitarCambioCorreoSchema.parse({
      correoNuevo: '  NUEVO@GuachaFit.COM ',
      passwordActual: 'x',
    });
    expect(ok.correoNuevo).toBe('nuevo@guachafit.com');

    expect(
      SolicitarCambioCorreoSchema.safeParse({ correoNuevo: 'no-es-correo', passwordActual: 'x' }).success
    ).toBe(false);
    expect(
      SolicitarCambioCorreoSchema.safeParse({ correoNuevo: 'nuevo@guachafit.com', passwordActual: '' }).success
    ).toBe(false);
  });

  it('[A4] ConfirmarCambioCorreoSchema exige un token (mín. 1)', () => {
    expect(ConfirmarCambioCorreoSchema.safeParse({ token: TOKEN_CAMBIO }).success).toBe(true);
    expect(ConfirmarCambioCorreoSchema.safeParse({ token: '' }).success).toBe(false);
    expect(ConfirmarCambioCorreoSchema.safeParse({}).success).toBe(false);
  });

  it('[A5] fija los textos visibles de seguridad (literales)', () => {
    expect(MENSAJE_PASSWORD_ACTUAL_INCORRECTA).toBe('Tu contraseña actual no es correcta.');
    expect(MENSAJE_PASSWORD_NUEVA_IGUAL).toBe('La contraseña nueva debe ser distinta de la actual.');
    expect(MENSAJE_CORREO_EN_USO).toBe('Ese correo ya está en uso.');
    expect(MENSAJE_CORREO_IGUAL_AL_ACTUAL).toBe('Ese ya es tu correo de acceso.');
    expect(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO).toBe(
      'El enlace no es válido o venció. Pide uno nuevo desde Ajustes.'
    );
    expect(MENSAJE_DATO_NO_EDITABLE).toBe('Ese dato no se puede cambiar desde tu perfil.');
  });
});

// ============================================================================
// Utilidades de servicio (AuthService con BD simulada)
// ============================================================================
function usuarioSuperadmin(extra: Record<string, unknown> = {}) {
  return {
    id: USUARIO_ID,
    email: 'admin@guachafit.com',
    rol: Rol.SUPERADMIN,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
    passwordHash: 'hash-viejo',
    passwordCambiadaEn: null,
    correoPendiente: null,
    tokenCambioCorreoHash: null,
    tokenCambioCorreoExpira: null,
    tokenRecuperacionHash: null,
    tokenRecuperacionExpira: null,
    ...extra,
  };
}

function usuarioAlumno(extra: Record<string, unknown> = {}) {
  return usuarioSuperadmin({ id: USUARIO_ID, email: 'ana@guachafit.com', rol: Rol.ALUMNO, ...extra });
}

const perfilAlumno = { usuarioId: USUARIO_ID, entrenadorId: COACH_ID, nombres: 'Ana', deletedAtUtc: null };

function crearCrypto() {
  return {
    comparePassword: vi.fn(async (password: string) => password === PASSWORD_ACTUAL),
    hashPassword: vi.fn(async (password: string) => `bcrypt-${password}`),
    hashSha256: vi.fn((texto: string) => sha256(texto)),
    generarTokenRecuperacion: vi.fn(() => ({
      rawToken: TOKEN_CAMBIO,
      tokenHash: sha256(TOKEN_CAMBIO),
      expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    })),
    // El código nuevo puede añadir un generador propio con la vigencia de 24 h; misma forma.
    generarTokenCambioCorreo: vi.fn(() => ({
      rawToken: TOKEN_CAMBIO,
      tokenHash: sha256(TOKEN_CAMBIO),
      expiresAt: new Date(NOW.getTime() + VIGENCIA_CAMBIO_CORREO_MS),
    })),
  } as any;
}

function crearEmisor(respuesta: any = [{ encolado: true, correoEnCamino: true }]) {
  return { emitAsync: vi.fn(async () => respuesta) } as any;
}

/**
 * BD simulada con respuestas encoladas para `select` (en el orden en que el servicio consulta):
 * 1.º usuario por id/token, 2.º perfil del alumno (si aplica), 3.º correo en uso.
 */
function crearDbSeguridad(
  opciones: { selects?: any[][]; filasActualizadas?: number; errorActualizacion?: unknown } = {}
) {
  const selects = opciones.selects ?? [];
  const filasActualizadas = opciones.filasActualizadas ?? 1;
  const errorActualizacion = opciones.errorActualizacion;
  const actualizaciones: any[] = [];
  let indice = 0;

  const consulta = (filas: any[]): any => {
    const q: any = {};
    for (const metodo of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy']) {
      q[metodo] = () => q;
    }
    q.limit = () => Promise.resolve(filas);
    q.then = (resolver: any, rechazar: any) => Promise.resolve(filas).then(resolver, rechazar);
    return q;
  };

  const db: any = {
    select: () => consulta(selects[indice++] ?? []),
    update: () => ({
      set: (valores: any) => ({
        where: () => {
          actualizaciones.push(valores);
          return {
            returning: () =>
              errorActualizacion !== undefined
                ? Promise.reject(errorActualizacion)
                : Promise.resolve(
                    Array.from({ length: filasActualizadas }, () => ({ id: USUARIO_ID }))
                  ),
            then: (resolver: any, rechazar: any) => Promise.resolve([] as any[]).then(resolver, rechazar),
          };
        },
      }),
    }),
  };
  return { db, actualizaciones };
}

const withTenantDirecto = (db: any) => (_contexto: any, fn: any) => fn(db);

// ============================================================================
// E. Cambio de contraseña
// ============================================================================
describe('RF-018 · E · AuthService.cambiarPassword', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('[E15] actual correcta y nueva válida: hash nuevo, passwordCambiadaEn, enlace borrado, tokens y aviso', async () => {
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [
        [
          usuarioSuperadmin({
            tokenRecuperacionHash: sha256('enlace-pendiente'),
            tokenRecuperacionExpira: new Date(NOW.getTime() + 30 * 60 * 1000),
          }),
        ],
      ],
    });
    const crypto = crearCrypto();
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crypto, withTenantDirecto(db), emisor);

    const resultado = await servicio.cambiarPassword(USUARIO_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });

    expect(resultado.mensaje).toBe(MENSAJE_PASSWORD_CAMBIADA);
    expect(resultado.accessToken).toEqual(expect.any(String));
    expect(resultado.refreshToken).toEqual(expect.any(String));

    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({
      passwordHash: `bcrypt-${PASSWORD_NUEVA}`,
      tokenRecuperacionHash: null,
      tokenRecuperacionExpira: null,
    });
    expect(actualizaciones[0].passwordCambiadaEn).toBeInstanceOf(Date);

    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
    const [nombreEvento, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombreEvento).toBe(AvisoPasswordCambiadaEvent.NOMBRE);
    expect(evento).toBeInstanceOf(AvisoPasswordCambiadaEvent);
    expect(evento.payload).toMatchObject({
      tipo: 'AVISO_PASSWORD_CAMBIADA',
      usuarioId: USUARIO_ID,
      email: 'admin@guachafit.com',
    });
    // El aviso de seguridad no lleva enlace con código.
    expect(evento.payload.token ?? '').toBe('');
  });

  it('[E15][B1] anula también el cambio de correo pendiente (un intruso no puede retomar la cuenta)', async () => {
    // Escenario B1: un intruso plantó un cambio de correo hacia su buzón; la rotación de la
    // contraseña debe dejarlo sin efecto (correoPendiente y token del enlace, borrados).
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [
        [
          usuarioSuperadmin({
            correoPendiente: 'intruso@guachafit.com',
            tokenCambioCorreoHash: sha256('enlace-del-intruso'),
            tokenCambioCorreoExpira: new Date(NOW.getTime() + VIGENCIA_CAMBIO_CORREO_MS),
          }),
        ],
      ],
    });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), crearEmisor());

    await servicio.cambiarPassword(USUARIO_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });

    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({
      correoPendiente: null,
      tokenCambioCorreoHash: null,
      tokenCambioCorreoExpira: null,
    });
  });

  it('[E16] actual incorrecta → 400 claro, sin escribir ni publicar', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioSuperadmin()]] });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio
      .cambiarPassword(USUARIO_ID, { passwordActual: 'equivocada-123', passwordNueva: PASSWORD_NUEVA })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(MENSAJE_PASSWORD_ACTUAL_INCORRECTA);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('[E17] nueva igual a la actual → 400 MENSAJE_PASSWORD_NUEVA_IGUAL, sin escribir ni publicar', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioSuperadmin()]] });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio
      .cambiarPassword(USUARIO_ID, { passwordActual: PASSWORD_ACTUAL, passwordNueva: PASSWORD_ACTUAL })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(MENSAJE_PASSWORD_NUEVA_IGUAL);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('[E18] el refresh devuelto sigue vivo tras el cambio; uno emitido antes se rechaza', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioSuperadmin()]] });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), crearEmisor());

    const resultado = await servicio.cambiarPassword(USUARIO_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });

    const cambioEn = actualizaciones[0].passwordCambiadaEn as Date;
    const decodificado = jwt.decode(resultado.refreshToken) as any;
    expect(decodificado.iat).toBeGreaterThanOrEqual(Math.floor(cambioEn.getTime() / 1000));

    // El refresh devuelto a la sesión actual sigue siendo válido...
    const usuarioTrasCambio = usuarioSuperadmin({ passwordCambiadaEn: cambioEn });
    const { db: dbNuevo } = crearDbSeguridad({ selects: [[usuarioTrasCambio]] });
    const servicioNuevo = new AuthService(dbNuevo, crearCrypto(), withTenantDirecto(dbNuevo));
    await expect(servicioNuevo.refresh(resultado.refreshToken)).resolves.toHaveProperty('accessToken');

    // ...y uno emitido antes del cambio (otra sesión) es rechazado.
    const refreshViejo = jwt.sign(
      {
        sub: USUARIO_ID,
        email: 'admin@guachafit.com',
        rol: Rol.SUPERADMIN,
        iat: Math.floor(cambioEn.getTime() / 1000) - 3600,
      },
      JWT_REFRESH_SECRET_DESARROLLO,
      { expiresIn: '7d' }
    );
    const { db: dbViejo } = crearDbSeguridad({ selects: [[usuarioTrasCambio]] });
    const servicioViejo = new AuthService(dbViejo, crearCrypto(), withTenantDirecto(dbViejo));
    const error = await servicioViejo.refresh(refreshViejo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(MENSAJE_SESION_VENCIDA);
  });

  it('[S3] entrenador: el token de acceso lleva su propio id como entrenadorId y el nombre de su ficha', async () => {
    const coach = usuarioAlumno({ id: COACH_ID, email: 'luis@guachafit.com', rol: Rol.ENTRENADOR });
    const { db } = crearDbSeguridad({ selects: [[coach], [{ nombres: 'Luis' }]] });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const resultado = await servicio.cambiarPassword(COACH_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });

    const acceso = jwt.decode(resultado.accessToken) as any;
    expect(acceso.entrenadorId).toBe(COACH_ID);
    // El refresh solo lleva sub/email/rol: el id del entrenador se re-deriva en cada refresh.
    const refresco = jwt.decode(resultado.refreshToken) as any;
    expect(refresco).toMatchObject({ sub: COACH_ID, rol: Rol.ENTRENADOR });
    const [, evento] = emisor.emitAsync.mock.calls[0];
    expect(evento.payload.nombre).toBe('Luis');
  });

  it('[S3] alumno: los tokens nuevos llevan el entrenadorId de su perfil', async () => {
    const { db } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno]] });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), crearEmisor());

    const resultado = await servicio.cambiarPassword(USUARIO_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });

    const payload = jwt.decode(resultado.accessToken) as any;
    expect(payload.entrenadorId).toBe(COACH_ID);
  });
});

// ============================================================================
// F. Solicitar cambio de correo
// ============================================================================
describe('RF-018 · F · AuthService.solicitarCambioCorreo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('[F19][H29] contraseña correcta y correo libre: guarda el pendiente con hash y emite la confirmación al correo NUEVO', async () => {
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioAlumno()], [perfilAlumno], []],
    });
    const crypto = crearCrypto();
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: true }]);
    const servicio = new AuthService(db, crypto, withTenantDirecto(db), emisor);

    const resultado = await servicio.solicitarCambioCorreo(USUARIO_ID, {
      correoNuevo: 'nuevo@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });

    expect(resultado.correoPendiente).toBe('nuevo@guachafit.com');
    expect(new Date(resultado.expiraUtc).getTime()).toBe(NOW.getTime() + VIGENCIA_CAMBIO_CORREO_MS);
    expect(resultado.correoEnviado).toBe(true);
    expect(resultado.enlaceConfirmacion).toBeUndefined();

    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({ correoPendiente: 'nuevo@guachafit.com' });
    expect((actualizaciones[0].tokenCambioCorreoExpira as Date).getTime()).toBe(
      NOW.getTime() + VIGENCIA_CAMBIO_CORREO_MS
    );

    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
    const [nombreEvento, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombreEvento).toBe(ConfirmacionCambioCorreoEvent.NOMBRE);
    expect(evento).toBeInstanceOf(ConfirmacionCambioCorreoEvent);
    const token = evento.payload.token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(evento.payload).toMatchObject({
      tipo: 'CONFIRMACION_CAMBIO_CORREO',
      usuarioId: USUARIO_ID,
      email: 'nuevo@guachafit.com',
    });
    // Solo se guarda el hash SHA-256, nunca el token en claro.
    expect(actualizaciones[0].tokenCambioCorreoHash).toBe(sha256(token));
    expect(JSON.stringify(actualizaciones[0])).not.toContain(token);
  });

  it('[F20] sin proveedor de correo (no quedó en camino) y en desarrollo → enlace copiable', async () => {
    const { db } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno], []] });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: false }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const resultado = await servicio.solicitarCambioCorreo(USUARIO_ID, {
      correoNuevo: 'nuevo@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });

    expect(resultado.correoEnviado).toBe(false);
    expect(resultado.enlaceConfirmacion).toContain('/confirmar-correo?token=');
    const token = emisor.emitAsync.mock.calls[0][1].payload.token as string;
    expect(resultado.enlaceConfirmacion).toContain(encodeURIComponent(token));
  });

  it('[F20] en producción NUNCA se devuelve el enlace', async () => {
    const { db } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno], []] });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: false }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    // El servicio se construye antes de cambiar el entorno (los secretos se leen al construir).
    process.env.NODE_ENV = 'production';

    const resultado = await servicio.solicitarCambioCorreo(USUARIO_ID, {
      correoNuevo: 'nuevo@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });

    expect(resultado.correoEnviado).toBe(false);
    expect(resultado.enlaceConfirmacion).toBeUndefined();
  });

  it('[F21] contraseña incorrecta → 400 MENSAJE_PASSWORD_ACTUAL_INCORRECTA, sin escribir ni publicar', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno]] });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio
      .solicitarCambioCorreo(USUARIO_ID, {
        correoNuevo: 'nuevo@guachafit.com',
        passwordActual: 'equivocada-123',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(MENSAJE_PASSWORD_ACTUAL_INCORRECTA);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('[F21] correo de otra cuenta → 409 MENSAJE_CORREO_EN_USO, sin escribir ni publicar', async () => {
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioAlumno()], [perfilAlumno], [{ id: OTRO_USUARIO_ID }]],
    });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio
      .solicitarCambioCorreo(USUARIO_ID, {
        correoNuevo: 'ocupado@guachafit.com',
        passwordActual: PASSWORD_ACTUAL,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(MENSAJE_CORREO_EN_USO);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('[F21] correo igual al actual → 400 MENSAJE_CORREO_IGUAL_AL_ACTUAL, sin escribir', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno]] });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio
      .solicitarCambioCorreo(USUARIO_ID, {
        correoNuevo: 'ana@guachafit.com',
        passwordActual: PASSWORD_ACTUAL,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(MENSAJE_CORREO_IGUAL_AL_ACTUAL);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('[F22] una solicitud nueva reemplaza a la anterior (el hash viejo deja de servir)', async () => {
    const usuarioConPendiente = usuarioAlumno({
      correoPendiente: 'viejo@guachafit.com',
      tokenCambioCorreoHash: sha256('token-viejo'),
      tokenCambioCorreoExpira: new Date(NOW.getTime() + 60 * 60 * 1000),
    });
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioConPendiente], [perfilAlumno], []],
    });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: true }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    await servicio.solicitarCambioCorreo(USUARIO_ID, {
      correoNuevo: 'nuevo2@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });

    const tokenNuevo = emisor.emitAsync.mock.calls[0][1].payload.token as string;
    expect(actualizaciones[0]).toMatchObject({ correoPendiente: 'nuevo2@guachafit.com' });
    expect(actualizaciones[0].tokenCambioCorreoHash).toBe(sha256(tokenNuevo));
    expect(actualizaciones[0].tokenCambioCorreoHash).not.toBe(sha256('token-viejo'));
  });

  it('[S3] entrenador: el saludo de la confirmación sale de perfiles_entrenador', async () => {
    const coach = usuarioAlumno({ id: COACH_ID, email: 'luis@guachafit.com', rol: Rol.ENTRENADOR });
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[coach], [{ nombres: 'Luis' }], []],
    });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: true }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    await servicio.solicitarCambioCorreo(COACH_ID, {
      correoNuevo: 'luis.nuevo@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });

    expect(actualizaciones[0]).toMatchObject({ correoPendiente: 'luis.nuevo@guachafit.com' });
    const [, evento] = emisor.emitAsync.mock.calls[0];
    expect(evento.payload).toMatchObject({
      email: 'luis.nuevo@guachafit.com',
      nombre: 'Luis',
    });
  });

  it('[S3] el servicio normaliza el correo antes de compararlo y guardarlo', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioAlumno()], [perfilAlumno], []] });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: true }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    await servicio.solicitarCambioCorreo(USUARIO_ID, {
      correoNuevo: '  NUEVO@GuachaFit.COM ',
      passwordActual: PASSWORD_ACTUAL,
    });

    expect(actualizaciones[0]).toMatchObject({ correoPendiente: 'nuevo@guachafit.com' });
    const [, evento] = emisor.emitAsync.mock.calls[0];
    expect(evento.payload.email).toBe('nuevo@guachafit.com');
  });
});

// ============================================================================
// G. Cancelar y confirmar el cambio de correo
// ============================================================================
describe('RF-018 · G · AuthService.cancelarCambioCorreoPendiente', () => {
  it('[G23] limpia los tres campos y confirma el mensaje', async () => {
    const { db, actualizaciones } = crearDbSeguridad({ selects: [[usuarioAlumno()]] });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db));

    const resultado = await servicio.cancelarCambioCorreoPendiente(USUARIO_ID);

    expect(resultado).toEqual({ mensaje: MENSAJE_CAMBIO_CORREO_CANCELADO });
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({
      correoPendiente: null,
      tokenCambioCorreoHash: null,
      tokenCambioCorreoExpira: null,
    });
  });

  it('[G23] sin cambio pendiente también responde 200 (idempotente)', async () => {
    const { db } = crearDbSeguridad({ selects: [[usuarioAlumno()]], filasActualizadas: 0 });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db));

    await expect(servicio.cancelarCambioCorreoPendiente(USUARIO_ID)).resolves.toEqual({
      mensaje: MENSAJE_CAMBIO_CORREO_CANCELADO,
    });
  });
});

describe('RF-018 · G · AuthService.confirmarCambioCorreo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  function usuarioConPendiente(extra: Record<string, unknown> = {}) {
    return usuarioAlumno({
      correoPendiente: 'nuevo@guachafit.com',
      tokenCambioCorreoHash: sha256(TOKEN_CAMBIO),
      tokenCambioCorreoExpira: new Date(NOW.getTime() + 60 * 60 * 1000),
      ...extra,
    });
  }

  it('[G24][H30] token vigente: el email pasa al pendiente, se limpian los dos cambios y se avisa al correo ANTERIOR', async () => {
    // W1: el enlace de recuperación pendiente viajó al buzón ANTERIOR; la mudanza debe anularlo.
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [
        [
          usuarioConPendiente({
            tokenRecuperacionHash: sha256('recuperacion-al-buzon-viejo'),
            tokenRecuperacionExpira: new Date(NOW.getTime() + 30 * 60 * 1000),
          }),
        ],
        [],
        [usuarioConPendiente()],
      ],
    });
    const emisor = crearEmisor([{ encolado: true, correoEnCamino: true }]);
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const resultado = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO });

    expect(resultado).toEqual({ mensaje: mensajeCorreoConfirmado('nuevo@guachafit.com') });
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({
      email: 'nuevo@guachafit.com',
      correoPendiente: null,
      tokenCambioCorreoHash: null,
      tokenCambioCorreoExpira: null,
      tokenRecuperacionHash: null,
      tokenRecuperacionExpira: null,
    });

    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
    const [nombreEvento, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombreEvento).toBe(AvisoCorreoCambiadoEvent.NOMBRE);
    expect(evento).toBeInstanceOf(AvisoCorreoCambiadoEvent);
    expect(evento.payload).toMatchObject({
      tipo: 'AVISO_CORREO_CAMBIADO',
      usuarioId: USUARIO_ID,
      email: 'ana@guachafit.com',
      correoNuevo: 'nuevo@guachafit.com',
    });
  });

  it.each(['inexistente', 'vencido', 'cancelado', 'ya usado'] as const)(
    '[G25] token %s → 404 MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO, sin cambiar el email',
    async (_caso) => {
      const { db, actualizaciones } = crearDbSeguridad({ selects: [[]] });
      const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db));

      const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
      expect(actualizaciones).toEqual([]);
    }
  );

  it('[G25/G27] si otro canje ganó la carrera (0 filas) → 404: el enlace ya se usó', async () => {
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioConPendiente()], [], [usuarioConPendiente()]],
      filasActualizadas: 0,
    });
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db));

    const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
    // El UPDATE condicionado al hash se intentó, pero ninguna fila cambió: el email no se aplica.
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({ email: 'nuevo@guachafit.com' });
  });

  it('[G26] si el correo pendiente ya pertenece a otra cuenta → 409 MENSAJE_CORREO_EN_USO, sin cambiar el email', async () => {
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioConPendiente()], [{ id: OTRO_USUARIO_ID }]],
    });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(MENSAJE_CORREO_EN_USO);
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it.each([{ code: '23505' }, { cause: { code: '23505' } }] as const)(
    '[S1] si el UPDATE choca con el índice único (%o) → 409 MENSAJE_CORREO_EN_USO',
    async (errorUnicidad) => {
      // Carrera S1: otra cuenta tomó el correo entre `exigirCorreoLibre` y el UPDATE.
      const { db, actualizaciones } = crearDbSeguridad({
        selects: [[usuarioConPendiente()], [], [usuarioConPendiente()]],
        errorActualizacion: errorUnicidad,
      });
      const emisor = crearEmisor();
      const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

      const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(MENSAJE_CORREO_EN_USO);
      // El UPDATE se intentó (y falló): el email no se aplicó y no salió ningún aviso.
      expect(actualizaciones).toHaveLength(1);
      expect(emisor.emitAsync).not.toHaveBeenCalled();
    }
  );

  it('[S1] otro error de BD en el UPDATE se propaga tal cual (sin convertirlo en 409)', async () => {
    const errorBd = new Error('BD caída');
    const { db, actualizaciones } = crearDbSeguridad({
      selects: [[usuarioConPendiente()], [], [usuarioConPendiente()]],
      errorActualizacion: errorBd,
    });
    const emisor = crearEmisor();
    const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

    expect(error).toBe(errorBd);
    expect(actualizaciones).toHaveLength(1);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it.each(['deshabilitada', 'archivada'] as const)(
    '[S1] cuenta %s → 404 MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO, sin UPDATE ni aviso',
    async (caso) => {
      const { db, actualizaciones } = crearDbSeguridad({
        selects:
          caso === 'deshabilitada'
            ? [[usuarioConPendiente({ activo: false })], []]
            : [[usuarioConPendiente()], [], [{ ...perfilAlumno, deletedAtUtc: NOW }]],
      });
      const emisor = crearEmisor();
      const servicio = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

      const error = await servicio.confirmarCambioCorreo({ token: TOKEN_CAMBIO }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
      expect(actualizaciones).toEqual([]);
      expect(emisor.emitAsync).not.toHaveBeenCalled();
    }
  );
});

// ============================================================================
// H. Correos de cuenta: tipos, plantillas y avisos
// ============================================================================
describe('RF-018 · H · correos de cuenta del cambio de correo y de contraseña', () => {
  const URL_WEB = 'https://app.guachafit.com';

  it('[H28] TIPOS_CORREO_CUENTA incluye los tres tipos nuevos', () => {
    expect(TIPOS_CORREO_CUENTA).toContain('CONFIRMACION_CAMBIO_CORREO');
    expect(TIPOS_CORREO_CUENTA).toContain('AVISO_CORREO_CAMBIADO');
    expect(TIPOS_CORREO_CUENTA).toContain('AVISO_PASSWORD_CAMBIADA');
  });

  it('[H32] la confirmación arma asunto y cuerpo con el enlace /confirmar-correo?token=', () => {
    const correo = construirCorreoCuenta(
      {
        tipo: 'CONFIRMACION_CAMBIO_CORREO',
        usuarioId: USUARIO_ID,
        email: 'nuevo@guachafit.com',
        nombre: 'Ana',
        token: TOKEN_CAMBIO,
      },
      URL_WEB
    );

    expect(correo.asunto.length).toBeGreaterThan(0);
    expect(correo.texto.length).toBeGreaterThan(0);
    expect(correo.texto).toContain(`${URL_WEB}/confirmar-correo?token=${TOKEN_CAMBIO}`);
    expect(correo.html).toContain(`${URL_WEB}/confirmar-correo?token=`);
  });

  it('[H30] el aviso al correo anterior menciona el NUEVO enmascarado y no lleva enlace con código', () => {
    const correoNuevo = 'nuevo@guachafit.com';
    const correo = construirCorreoCuenta(
      {
        tipo: 'AVISO_CORREO_CAMBIADO',
        usuarioId: USUARIO_ID,
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
        correoNuevo,
      },
      URL_WEB
    );

    const todo = `${correo.asunto}\n${correo.html}\n${correo.texto}`;
    expect(correo.asunto.length).toBeGreaterThan(0);
    expect(correo.texto.length).toBeGreaterThan(0);
    expect(todo).toContain(enmascararCorreo(correoNuevo));
    expect(todo).not.toContain(correoNuevo);
    expect(todo).not.toContain('/confirmar-correo?token=');
  });

  it('[S2] sin `correoNuevo` el aviso no muestra "***": dice que el correo cambió', () => {
    const correo = construirCorreoCuenta(
      {
        tipo: 'AVISO_CORREO_CAMBIADO',
        usuarioId: USUARIO_ID,
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
      },
      URL_WEB
    );

    const todo = `${correo.asunto}\n${correo.html}\n${correo.texto}`;
    expect(todo).not.toContain('***');
    expect(todo).toContain('Tu correo de acceso a GUACHAFIT cambió.');
  });

  it('[H31][H32] el aviso de contraseña cambiada arma asunto/cuerpo sin enlace con código', () => {
    const correo = construirCorreoCuenta(
      {
        tipo: 'AVISO_PASSWORD_CAMBIADA',
        usuarioId: USUARIO_ID,
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
      },
      URL_WEB
    );

    expect(correo.asunto.length).toBeGreaterThan(0);
    expect(correo.texto.length).toBeGreaterThan(0);
    expect(`${correo.html}\n${correo.texto}`).not.toContain('?token=');
  });
});

// ============================================================================
// Rutas HTTP de seguridad (Nest + supertest, servicios simulados)
// ============================================================================
const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;

function token(rol: Rol, sub: string): string {
  return jwt.sign({ sub, email: 'cuenta@guachafit.com', rol }, JWT_SECRET, { expiresIn: '15m' });
}

async function crearAppUsuarios(authMock: Record<string, unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [UsuariosController],
    providers: [
      { provide: DRIZZLE_DB, useValue: {} },
      { provide: UsuariosService, useValue: {} },
      { provide: AuthService, useValue: authMock },
      { provide: CryptoService, useValue: {} },
      { provide: EventEmitter2, useValue: { emitAsync: vi.fn(async () => []) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configurarErroresGlobales(app);
  await app.init();
  return app;
}

async function crearAppAuth(authMock: Record<string, unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [{ provide: AuthService, useValue: authMock }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configurarErroresGlobales(app);
  await app.init();
  return app;
}

describe('RF-018 · E/F/G · rutas autenticadas /usuarios/me (password, correo y cancelación)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  function authMockBase(extra: Record<string, unknown> = {}) {
    return {
      cambiarPassword: vi.fn(async () => ({
        mensaje: MENSAJE_PASSWORD_CAMBIADA,
        accessToken: 'access-token-de-prueba',
        refreshToken: 'refresh-token-de-prueba',
      })),
      solicitarCambioCorreo: vi.fn(async () => ({
        mensaje: mensajeCambioCorreoSolicitado('nuevo@guachafit.com', true),
        correoPendiente: 'nuevo@guachafit.com',
        expiraUtc: '2026-10-07T12:00:00.000Z',
        correoEnviado: true,
      })),
      cancelarCambioCorreoPendiente: vi.fn(async () => ({
        mensaje: MENSAJE_CAMBIO_CORREO_CANCELADO,
      })),
      ...extra,
    };
  }

  it('[E15] POST /usuarios/me/password delega con el id del token y responde 200', async () => {
    const authMock = authMockBase();
    const app = await crearAppUsuarios(authMock);

    const res = await request(app.getHttpServer())
      .post('/usuarios/me/password')
      .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`)
      .send({ passwordActual: PASSWORD_ACTUAL, passwordNueva: PASSWORD_NUEVA });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe(MENSAJE_PASSWORD_CAMBIADA);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(authMock.cambiarPassword).toHaveBeenCalledWith(USUARIO_ID, {
      passwordActual: PASSWORD_ACTUAL,
      passwordNueva: PASSWORD_NUEVA,
    });
    await app.close();
  });

  it('[F19] POST /usuarios/me/correo delega con el id del token y devuelve la forma del contrato', async () => {
    const authMock = authMockBase();
    const app = await crearAppUsuarios(authMock);

    const res = await request(app.getHttpServer())
      .post('/usuarios/me/correo')
      .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`)
      .send({ correoNuevo: 'nuevo@guachafit.com', passwordActual: PASSWORD_ACTUAL });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mensaje: mensajeCambioCorreoSolicitado('nuevo@guachafit.com', true),
      correoPendiente: 'nuevo@guachafit.com',
      expiraUtc: '2026-10-07T12:00:00.000Z',
      correoEnviado: true,
    });
    expect(authMock.solicitarCambioCorreo).toHaveBeenCalledWith(USUARIO_ID, {
      correoNuevo: 'nuevo@guachafit.com',
      passwordActual: PASSWORD_ACTUAL,
    });
    await app.close();
  });

  it('[F21] correo nuevo con formato inválido → 400 y el servicio no se invoca', async () => {
    const authMock = authMockBase();
    const app = await crearAppUsuarios(authMock);

    const res = await request(app.getHttpServer())
      .post('/usuarios/me/correo')
      .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`)
      .send({ correoNuevo: 'no-es-correo', passwordActual: PASSWORD_ACTUAL });

    expect(res.status).toBe(400);
    expect(authMock.solicitarCambioCorreo).not.toHaveBeenCalled();
    await app.close();
  });

  it('[G23] DELETE /usuarios/me/correo-pendiente responde 200 con el mensaje', async () => {
    const authMock = authMockBase();
    const app = await crearAppUsuarios(authMock);

    const res = await request(app.getHttpServer())
      .delete('/usuarios/me/correo-pendiente')
      .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensaje: MENSAJE_CAMBIO_CORREO_CANCELADO });
    expect(authMock.cancelarCambioCorreoPendiente).toHaveBeenCalledWith(USUARIO_ID);
    await app.close();
  });

  it('[C9] sin token → 401 en las rutas de seguridad', async () => {
    const authMock = authMockBase();
    const app = await crearAppUsuarios(authMock);

    // Cada petición se construye y se espera dentro del bucle: supertest cierra el servidor
    // efímero que arranca la primera, así que preconstruirlas deja a las siguientes con
    // ECONNREFUSED (defecto del test detectado en las revisiones 03/04/05/06).
    const peticiones = [
      () =>
        request(app.getHttpServer()).post('/usuarios/me/password').send({
          passwordActual: PASSWORD_ACTUAL,
          passwordNueva: PASSWORD_NUEVA,
        }),
      () =>
        request(app.getHttpServer())
          .post('/usuarios/me/correo')
          .send({ correoNuevo: 'nuevo@guachafit.com', passwordActual: PASSWORD_ACTUAL }),
      () => request(app.getHttpServer()).delete('/usuarios/me/correo-pendiente'),
    ];

    for (const armarPeticion of peticiones) {
      const res = await armarPeticion();
      expect(res.status).toBe(401);
      expect(res.body.message).toBe(MENSAJE_SESION_VENCIDA);
    }
    expect(authMock.cambiarPassword).not.toHaveBeenCalled();
    expect(authMock.solicitarCambioCorreo).not.toHaveBeenCalled();
    expect(authMock.cancelarCambioCorreoPendiente).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('RF-018 · G · POST /auth/confirmar-cambio-correo (público)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('[G24] token válido → 200 con el mensaje del correo nuevo', async () => {
    const authMock = {
      confirmarCambioCorreo: vi.fn(async () => ({
        mensaje: mensajeCorreoConfirmado('nuevo@guachafit.com'),
      })),
    };
    const app = await crearAppAuth(authMock);

    const res = await request(app.getHttpServer())
      .post('/auth/confirmar-cambio-correo')
      .send({ token: TOKEN_CAMBIO });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensaje: mensajeCorreoConfirmado('nuevo@guachafit.com') });
    expect(authMock.confirmarCambioCorreo).toHaveBeenCalledWith({ token: TOKEN_CAMBIO });
    await app.close();
  });

  it('[G25] token vacío → 400 y el servicio no se invoca', async () => {
    const authMock = { confirmarCambioCorreo: vi.fn(async () => ({ mensaje: 'ok' })) };
    const app = await crearAppAuth(authMock);

    const res = await request(app.getHttpServer()).post('/auth/confirmar-cambio-correo').send({ token: '' });

    expect(res.status).toBe(400);
    expect(authMock.confirmarCambioCorreo).not.toHaveBeenCalled();
    await app.close();
  });

  it('[G25] token inválido → 404 con MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO', async () => {
    const authMock = {
      confirmarCambioCorreo: vi.fn(async () => {
        throw new NotFoundException(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
      }),
    };
    const app = await crearAppAuth(authMock);

    const res = await request(app.getHttpServer())
      .post('/auth/confirmar-cambio-correo')
      .send({ token: TOKEN_CAMBIO });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
    await app.close();
  });
});

// ============================================================================
// I. Límite de intentos (throttler) de las rutas de seguridad
// ============================================================================
describe('RF-018 · I · límite de intentos de las rutas de seguridad', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('[I33] POST /usuarios/me/password bloquea el 6.º intento del mismo usuario en 15 minutos', async () => {
    const authMock = {
      cambiarPassword: vi.fn(async () => ({
        mensaje: MENSAJE_PASSWORD_CAMBIADA,
        accessToken: 'a',
        refreshToken: 'r',
      })),
    };
    const app = await crearAppUsuarios(authMock);
    const servidor = app.getHttpServer();
    const cabecera = `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`;
    const cuerpo = { passwordActual: PASSWORD_ACTUAL, passwordNueva: PASSWORD_NUEVA };

    for (let intento = 1; intento <= 5; intento++) {
      const res = await request(servidor)
        .post('/usuarios/me/password')
        .set('Authorization', cabecera)
        .send(cuerpo);
      expect(res.status, `intento ${intento}`).toBe(200);
    }

    const bloqueada = await request(servidor)
      .post('/usuarios/me/password')
      .set('Authorization', cabecera)
      .send(cuerpo);
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    await app.close();
  });

  it('[I33] POST /usuarios/me/correo bloquea el 6.º intento del mismo usuario en 15 minutos', async () => {
    const authMock = {
      solicitarCambioCorreo: vi.fn(async () => ({
        mensaje: mensajeCambioCorreoSolicitado('nuevo@guachafit.com', true),
        correoPendiente: 'nuevo@guachafit.com',
        expiraUtc: '2026-10-07T12:00:00.000Z',
        correoEnviado: true,
      })),
    };
    const app = await crearAppUsuarios(authMock);
    const servidor = app.getHttpServer();
    const cabecera = `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`;
    const cuerpo = { correoNuevo: 'nuevo@guachafit.com', passwordActual: PASSWORD_ACTUAL };

    for (let intento = 1; intento <= 5; intento++) {
      const res = await request(servidor)
        .post('/usuarios/me/correo')
        .set('Authorization', cabecera)
        .send(cuerpo);
      expect(res.status, `intento ${intento}`).toBe(200);
    }

    const bloqueada = await request(servidor)
      .post('/usuarios/me/correo')
      .set('Authorization', cabecera)
      .send(cuerpo);
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    await app.close();
  });

  it('[I33] POST /auth/confirmar-cambio-correo usa el mismo límite que restablecer-password', async () => {
    const authMock = {
      confirmarCambioCorreo: vi.fn(async () => ({
        mensaje: mensajeCorreoConfirmado('nuevo@guachafit.com'),
      })),
    };
    const app = await crearAppAuth(authMock);
    const servidor = app.getHttpServer();

    for (let intento = 1; intento <= LIMITE_INTENTOS_PUBLICO; intento++) {
      const res = await request(servidor)
        .post('/auth/confirmar-cambio-correo')
        .send({ token: TOKEN_CAMBIO });
      expect(res.status, `intento ${intento}`).toBe(200);
    }

    const bloqueada = await request(servidor)
      .post('/auth/confirmar-cambio-correo')
      .send({ token: TOKEN_CAMBIO });
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    await app.close();
  });

  it('[I33] el límite es por usuario: el 6.º intento de A no bloquea el 1.º de B', async () => {
    const authMock = {
      cambiarPassword: vi.fn(async () => ({
        mensaje: MENSAJE_PASSWORD_CAMBIADA,
        accessToken: 'a',
        refreshToken: 'r',
      })),
    };
    const app = await crearAppUsuarios(authMock);
    const servidor = app.getHttpServer();
    const cuerpo = { passwordActual: PASSWORD_ACTUAL, passwordNueva: PASSWORD_NUEVA };
    const cabeceraA = `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`;
    const cabeceraB = `Bearer ${token(Rol.ALUMNO, OTRO_USUARIO_ID)}`;

    for (let intento = 1; intento <= LIMITE_INTENTOS_CUENTA; intento++) {
      const res = await request(servidor)
        .post('/usuarios/me/password')
        .set('Authorization', cabeceraA)
        .send(cuerpo);
      expect(res.status, `intento ${intento} de A`).toBe(200);
    }

    const bloqueadaA = await request(servidor)
      .post('/usuarios/me/password')
      .set('Authorization', cabeceraA)
      .send(cuerpo);
    expect(bloqueadaA.status).toBe(429);

    const primeraB = await request(servidor)
      .post('/usuarios/me/password')
      .set('Authorization', cabeceraB)
      .send(cuerpo);
    expect(primeraB.status).toBe(200);
    await app.close();
  });
});
