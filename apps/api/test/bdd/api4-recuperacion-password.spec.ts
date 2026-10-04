import { describe, it, expect, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  Logger,
  NotFoundException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as jwt from 'jsonwebtoken';
import { getTableName } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  Modalidad,
  Rol,
  TipoDocumento,
  RestablecerPasswordSchema,
  SolicitarRecuperacionPasswordSchema,
  EstablecerPasswordConTokenSchema,
} from '@guachafit/shared';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { CryptoService } from '../../src/common/services/crypto.service';
import { JWT_REFRESH_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import {
  LIMITE_INTENTOS_RECUPERACION_POR_CORREO,
  VENTANA_RECUPERACION_MS,
} from '../../src/common/guards/limite-intentos.guard';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
  MENSAJE_RECUPERACION_SOLICITADA,
  MENSAJE_SESION_VENCIDA,
} from '../../src/common/mensajes-acceso';
import {
  BienvenidaAlumnoEvent,
  BienvenidaEntrenadorEvent,
  RecuperacionPasswordSolicitadaEvent,
} from '../../src/modules/notificaciones/events/eventos-correo-cuenta';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';
import { contieneJerga } from '../../src/common/errores/jerga';

/**
 * Recuperación de contraseña y correos de bienvenida.
 *
 * - `POST /auth/recuperar-password` responde SIEMPRE igual (no revela si el correo existe) y solo
 *   genera enlace para cuentas con acceso (cascada coach-alumnos RF-010, archivados, bloqueados).
 * - `POST /auth/restablecer-password` canjea el enlace (hash, un solo uso, 1 hora).
 * - El alta manual de alumno y la creación de entrenador emiten el evento de bienvenida.
 */

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const COACH_ID = '22222222-2222-4222-8222-222222222222';

afterEach(() => vi.restoreAllMocks());

// ============================================================================
// Mensajes y contratos
// ============================================================================
describe('API-4 · mensajes y contratos de la recuperación', () => {
  it('fija los textos visibles (tuteo, sin jerga)', () => {
    expect(MENSAJE_RECUPERACION_SOLICITADA).toBe(
      'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.'
    );
    expect(MENSAJE_ENLACE_RECUPERACION_INVALIDO).toBe(
      'Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo.'
    );
    expect(MENSAJE_PASSWORD_ACTUALIZADA).toBe('Tu contraseña se actualizó. Ya puedes iniciar sesión.');
    for (const texto of [
      MENSAJE_RECUPERACION_SOLICITADA,
      MENSAJE_ENLACE_RECUPERACION_INVALIDO,
      MENSAJE_PASSWORD_ACTUALIZADA,
    ]) {
      expect(contieneJerga(texto), texto).toBe(false);
    }
  });

  it('restablecer reutiliza la política de contraseña de la activación', () => {
    expect(RestablecerPasswordSchema).toBe(EstablecerPasswordConTokenSchema);
    expect(SolicitarRecuperacionPasswordSchema.safeParse({ email: 'no-es-correo' }).success).toBe(false);
    expect(SolicitarRecuperacionPasswordSchema.safeParse({ email: 'ana@guachafit.com' }).success).toBe(true);
  });

  it('el token de recuperación es aleatorio, se guarda solo su hash y vence en 1 hora', () => {
    const crypto = new CryptoService();
    const antes = Date.now();
    const a = crypto.generarTokenRecuperacion();
    const b = crypto.generarTokenRecuperacion();
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).toBe(crypto.hashSha256(a.rawToken));
    const duracion = a.expiresAt.getTime() - antes;
    expect(duracion).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);
    expect(duracion).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });
});

// ============================================================================
// Servicio: solicitar y restablecer
// ============================================================================
interface OpcionesDb {
  usuario?: any;
  perfilAlumno?: any;
  licencia?: EstadoLicencia;
  coachActivo?: boolean;
  filasActualizadas?: number;
}

function crearDb(opciones: OpcionesDb = {}) {
  const actualizaciones: any[] = [];
  const db: any = {
    select: () => ({
      from: (tabla: any) => {
        const nombre = getTableName(tabla);
        const filas =
          nombre === 'usuarios'
            ? opciones.usuario
              ? [opciones.usuario]
              : []
            : nombre === 'perfiles_alumno'
              ? opciones.perfilAlumno
                ? [opciones.perfilAlumno]
                : []
              : nombre === 'perfiles_entrenador'
                ? [
                    {
                      estadoLicencia: opciones.licencia ?? EstadoLicencia.ACTIVA,
                      activo: opciones.coachActivo ?? true,
                    },
                  ]
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
    update: () => ({
      set: (valores: any) => ({
        where: () => {
          actualizaciones.push(valores);
          const filas = Array.from({ length: opciones.filasActualizadas ?? 1 }, () => ({
            id: opciones.usuario?.id ?? USUARIO_ID,
          }));
          return {
            returning: () => Promise.resolve(filas),
            then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
          };
        },
      }),
    }),
  };
  return { db, actualizaciones };
}

const withTenantDirecto = (db: any) => (_ctx: any, fn: any) => fn(db);

function crearCrypto() {
  return {
    hashSha256: vi.fn((texto: string) => `sha256-${texto}`),
    hashPassword: vi.fn(async (password: string) => `bcrypt-${password}`),
    comparePassword: vi.fn(async () => true),
    generarTokenRecuperacion: vi.fn(() => ({
      rawToken: 'a'.repeat(64),
      tokenHash: 'hash-del-token',
      expiresAt: new Date('2026-10-04T13:00:00Z'),
    })),
    generateInvitationToken: vi.fn(() => ({
      rawToken: 'b'.repeat(64),
      tokenHash: 'hash-invitacion',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    })),
  } as any;
}

function crearEmisor(falla = false) {
  return {
    emitAsync: vi.fn(async () => {
      if (falla) throw new Error('Redis caído');
      // Lo que responde el despachador cuando el correo quedó en camino.
      return [{ encolado: true, correoEnCamino: true }];
    }),
  } as any;
}

const alumno = {
  id: USUARIO_ID,
  email: 'ana@guachafit.com',
  rol: Rol.ALUMNO,
  estado: EstadoUsuario.ACTIVO,
  activo: true,
  passwordHash: 'hash-viejo',
};

const perfilAlumno = {
  usuarioId: USUARIO_ID,
  entrenadorId: COACH_ID,
  nombres: 'Ana',
  modalidad: Modalidad.PRESENCIAL,
  deletedAtUtc: null,
};

describe('API-4 · AuthService.solicitarRecuperacionPassword', () => {
  function crear(opciones: OpcionesDb, emisor = crearEmisor()) {
    const { db, actualizaciones } = crearDb(opciones);
    const crypto = crearCrypto();
    const service = new AuthService(db, crypto, withTenantDirecto(db), emisor);
    return { service, actualizaciones, crypto, emisor };
  }

  // La respuesta no espera el trabajo que depende de la cuenta: ese trabajo se verifica
  // directamente con `procesarSolicitudRecuperacion` (lo que corre en segundo plano).
  it('correo no registrado → mismo mensaje, sin escribir ni enviar nada', async () => {
    const { service, actualizaciones, emisor } = crear({ usuario: null });
    const resultado = await service.solicitarRecuperacionPassword({ email: 'nadie@guachafit.com' });
    expect(resultado).toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    await service.procesarSolicitudRecuperacion('nadie@guachafit.com');
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('cuenta con acceso → guarda SOLO el hash con vencimiento y emite el evento con el enlace', async () => {
    const { service, actualizaciones, emisor } = crear({ usuario: alumno, perfilAlumno });

    const resultado = await service.solicitarRecuperacionPassword({ email: ' ANA@guachafit.com ' });

    expect(resultado).toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    // El trabajo en segundo plano normaliza el correo y termina por su cuenta.
    await vi.waitFor(() => expect(emisor.emitAsync).toHaveBeenCalled());
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toEqual({
      tokenRecuperacionHash: 'hash-del-token',
      tokenRecuperacionExpira: new Date('2026-10-04T13:00:00Z'),
    });
    expect(JSON.stringify(actualizaciones[0])).not.toContain('a'.repeat(64));
    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
    const [nombre, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombre).toBe(RecuperacionPasswordSolicitadaEvent.NOMBRE);
    expect(evento).toBeInstanceOf(RecuperacionPasswordSolicitadaEvent);
    expect(evento.payload).toEqual({
      tipo: 'RECUPERACION_PASSWORD',
      usuarioId: USUARIO_ID,
      email: 'ana@guachafit.com',
      nombre: 'Ana',
      token: 'a'.repeat(64),
    });
  });

  it.each([
    ['cuenta desactivada', { usuario: { ...alumno, activo: false }, perfilAlumno }],
    ['cuenta bloqueada', { usuario: { ...alumno, estado: EstadoUsuario.BLOQUEADO }, perfilAlumno }],
    [
      'alumno archivado',
      { usuario: alumno, perfilAlumno: { ...perfilAlumno, deletedAtUtc: new Date() } },
    ],
    ['entrenador del alumno deshabilitado (cascada)', { usuario: alumno, perfilAlumno, coachActivo: false }],
    [
      'licencia del entrenador del alumno suspendida (cascada)',
      { usuario: alumno, perfilAlumno, licencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN },
    ],
    [
      'entrenador con licencia suspendida',
      {
        usuario: { ...alumno, rol: Rol.ENTRENADOR },
        licencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      },
    ],
  ] as const)('%s → mismo mensaje y no se envía enlace', async (_caso, opciones) => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service, actualizaciones, emisor } = crear(opciones as OpcionesDb);
    const resultado = await service.solicitarRecuperacionPassword({ email: 'ana@guachafit.com' });
    expect(resultado).toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    await service.procesarSolicitudRecuperacion('ana@guachafit.com');
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('un fallo del bus de eventos no cambia la respuesta (solo se registra)', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = crear({ usuario: alumno, perfilAlumno }, crearEmisor(true));
    await expect(
      service.solicitarRecuperacionPassword({ email: 'ana@guachafit.com' })
    ).resolves.toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });
});

describe('API-4 · AuthService.restablecerPassword', () => {
  const TOKEN = 'c'.repeat(64);

  it('enlace inexistente, vencido o ya usado → 404 con mensaje claro', async () => {
    const { db } = crearDb({ usuario: null });
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db));
    const error = await service
      .restablecerPassword({ token: TOKEN, password: 'nueva-clave-segura' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
  });

  it('enlace válido → nueva contraseña, enlace consumido y sesiones previas invalidadas', async () => {
    const { db, actualizaciones } = crearDb({
      usuario: { ...alumno, tokenRecuperacionHash: `sha256-${TOKEN}` },
      perfilAlumno,
    });
    const crypto = crearCrypto();
    const service = new AuthService(db, crypto, withTenantDirecto(db));

    const resultado = await service.restablecerPassword({ token: TOKEN, password: 'nueva-clave-segura' });

    expect(resultado).toEqual({ mensaje: MENSAJE_PASSWORD_ACTUALIZADA });
    expect(crypto.hashSha256).toHaveBeenCalledWith(TOKEN);
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0]).toMatchObject({
      passwordHash: 'bcrypt-nueva-clave-segura',
      tokenRecuperacionHash: null,
      tokenRecuperacionExpira: null,
      tokenInvitacionHash: null,
      tokenInvitacionExpira: null,
    });
    expect(actualizaciones[0].passwordCambiadaEn).toBeInstanceOf(Date);
    // No emite sesión: la web lleva a iniciar sesión.
    expect(resultado).not.toHaveProperty('accessToken');
  });

  it('si otro canje ganó la carrera (ninguna fila actualizada) → 404, el enlace ya se usó', async () => {
    const { db } = crearDb({ usuario: alumno, perfilAlumno, filasActualizadas: 0 });
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db));
    await expect(
      service.restablecerPassword({ token: TOKEN, password: 'nueva-clave-segura' })
    ).rejects.toThrow(MENSAJE_ENLACE_RECUPERACION_INVALIDO);
  });

  it('alumno archivado con enlace vigente → no cambia la contraseña', async () => {
    const { db, actualizaciones } = crearDb({
      usuario: alumno,
      perfilAlumno: { ...perfilAlumno, deletedAtUtc: new Date() },
    });
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db));
    await expect(
      service.restablecerPassword({ token: TOKEN, password: 'nueva-clave-segura' })
    ).rejects.toThrow(MENSAJE_CUENTA_ARCHIVADA);
    expect(actualizaciones).toEqual([]);
  });
});

describe('API-4 · el refresh rechaza sesiones anteriores al cambio de contraseña', () => {
  const superadmin = {
    id: USUARIO_ID,
    email: 'admin@guachafit.com',
    rol: Rol.SUPERADMIN,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
  };

  function refreshEmitidoHace(segundos: number) {
    const iat = Math.floor(Date.now() / 1000) - segundos;
    return jwt.sign(
      { sub: USUARIO_ID, email: superadmin.email, rol: Rol.SUPERADMIN, iat },
      JWT_REFRESH_SECRET_DESARROLLO,
      { expiresIn: '7d' }
    );
  }

  it('refresh emitido antes del restablecimiento → sesión vencida', async () => {
    const { db } = crearDb({
      usuario: { ...superadmin, passwordCambiadaEn: new Date(Date.now() - 60_000) },
    });
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db));
    const error = await service.refresh(refreshEmitidoHace(3600)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toBe(MENSAJE_SESION_VENCIDA);
  });

  it('refresh emitido después del restablecimiento (o sin cambio) → sigue funcionando', async () => {
    const { db } = crearDb({
      usuario: { ...superadmin, passwordCambiadaEn: new Date(Date.now() - 3_600_000) },
    });
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db));
    await expect(service.refresh(refreshEmitidoHace(60))).resolves.toHaveProperty('accessToken');

    const sinCambio = crearDb({ usuario: { ...superadmin, passwordCambiadaEn: null } });
    const service2 = new AuthService(sinCambio.db, crearCrypto(), withTenantDirecto(sinCambio.db));
    await expect(service2.refresh(refreshEmitidoHace(3600))).resolves.toHaveProperty('accessToken');
  });
});

// ============================================================================
// Controlador: rutas públicas con límite de intentos
// ============================================================================
describe('API-4 · rutas públicas de recuperación', () => {
  async function crearApp() {
    const authService = {
      solicitarRecuperacionPassword: vi.fn(async () => ({ mensaje: MENSAJE_RECUPERACION_SOLICITADA })),
      restablecerPassword: vi.fn(async () => ({ mensaje: MENSAJE_PASSWORD_ACTUALIZADA })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configurarErroresGlobales(app);
    await app.init();
    return { app: app as INestApplication, authService };
  }

  it('POST /auth/recuperar-password responde 200 con el mensaje genérico (correo recortado)', async () => {
    const { app, authService } = await crearApp();
    const res = await request(app.getHttpServer())
      .post('/auth/recuperar-password')
      .send({ email: ' ana@guachafit.com ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    expect(authService.solicitarRecuperacionPassword).toHaveBeenCalledWith({
      email: 'ana@guachafit.com',
    });
    await app.close();
  });

  it('correo con formato inválido → 400 claro', async () => {
    const { app } = await crearApp();
    const res = await request(app.getHttpServer())
      .post('/auth/recuperar-password')
      .send({ email: 'no es correo' });
    expect(res.status).toBe(400);
    await app.close();
  });

  it('límite por IP + correo: tras 3 pedidos en 15 minutos responde 429 con mensaje claro', async () => {
    expect(LIMITE_INTENTOS_RECUPERACION_POR_CORREO).toBe(3);
    expect(VENTANA_RECUPERACION_MS).toBe(15 * 60 * 1000);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { app } = await crearApp();
    const servidor = app.getHttpServer();
    for (let i = 0; i < LIMITE_INTENTOS_RECUPERACION_POR_CORREO; i++) {
      expect(
        (await request(servidor).post('/auth/recuperar-password').send({ email: 'ana@guachafit.com' }))
          .status
      ).toBe(200);
    }
    const bloqueada = await request(servidor)
      .post('/auth/recuperar-password')
      .send({ email: 'ana@guachafit.com' });
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    // Otro correo desde la misma IP no queda bloqueado.
    expect(
      (await request(servidor).post('/auth/recuperar-password').send({ email: 'otro@guachafit.com' }))
        .status
    ).toBe(200);
    await app.close();
  });

  it('POST /auth/restablecer-password valida con la política de la activación', async () => {
    const { app, authService } = await crearApp();
    const corta = await request(app.getHttpServer())
      .post('/auth/restablecer-password')
      .send({ token: 'c'.repeat(64), password: 'corta' });
    expect(corta.status).toBe(400);

    const ok = await request(app.getHttpServer())
      .post('/auth/restablecer-password')
      .send({ token: 'c'.repeat(64), password: 'nueva-clave-segura' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ mensaje: MENSAJE_PASSWORD_ACTUALIZADA });
    expect(authService.restablecerPassword).toHaveBeenCalledWith({
      token: 'c'.repeat(64),
      password: 'nueva-clave-segura',
    });
    await app.close();
  });
});

// ============================================================================
// Disparo de bienvenidas (evento de dominio, nunca envío directo)
// ============================================================================
describe('API-4 · correos de bienvenida', () => {
  function crearDbAlta(filasInsertadas: Record<string, any>) {
    const db: any = {
      select: () => ({
        from: () => {
          const consulta: any = {
            where: () => ({
              limit: () => Promise.resolve([]),
              then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
            }),
          };
          return consulta;
        },
      }),
      insert: (tabla: any) => ({
        values: () => ({
          returning: () => Promise.resolve([filasInsertadas[getTableName(tabla)]]),
        }),
      }),
    };
    return db;
  }

  const dtoEntrenador = {
    nombres: 'Luis',
    apellidos: 'Pérez',
    email: 'luis@guachafit.com',
    coachCode: 'LUISFIT',
    capacidadMaxima: 50,
    tasaCambioGlobal: '65.0000',
    telefonoContacto: '+584121234567',
  };

  const filasEntrenador = {
    usuarios: { id: COACH_ID, email: 'luis@guachafit.com' },
    perfiles_entrenador: { id: 'perfil-1', nombres: 'Luis', apellidos: 'Pérez', coachCode: 'LUISFIT' },
  };

  it('entrenador creado sin contraseña → emite la bienvenida con su enlace de activación', async () => {
    const db = crearDbAlta(filasEntrenador);
    const emisor = crearEmisor();
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);

    const resultado = await service.crearEntrenador(dtoEntrenador as any);

    expect(resultado.tokenInvitacion).toBe('b'.repeat(64));
    expect(resultado.correoEnviado).toBe(true);
    expect(resultado.mensaje).toMatch(/Le enviamos un correo/);
    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
    const [nombre, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombre).toBe(BienvenidaEntrenadorEvent.NOMBRE);
    expect(evento.payload).toEqual({
      tipo: 'BIENVENIDA_ENTRENADOR',
      usuarioId: COACH_ID,
      email: 'luis@guachafit.com',
      nombre: 'Luis',
      token: 'b'.repeat(64),
    });
  });

  it('entrenador creado con contraseña directa → no hay enlace que enviar', async () => {
    const db = crearDbAlta(filasEntrenador);
    const emisor = crearEmisor();
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db), emisor);
    const resultado = await service.crearEntrenador({ ...dtoEntrenador, password: 'clave-directa-1' } as any);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
    expect(resultado.mensaje).not.toMatch(/correo/);
  });

  it('el fallo del bus no tumba la creación del entrenador', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = crearDbAlta(filasEntrenador);
    const service = new AuthService(db, crearCrypto(), withTenantDirecto(db), crearEmisor(true));
    await expect(service.crearEntrenador(dtoEntrenador as any)).resolves.toHaveProperty('id');
  });

  const dtoAlumno = {
    nombres: 'Marcos',
    apellidos: 'Pérez',
    email: 'marcos@guachafit.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '18456123',
    fechaNacimiento: '1994-05-15',
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.PRESENCIAL,
  };

  const filasAlumno = {
    usuarios: { id: USUARIO_ID, email: 'marcos@guachafit.com' },
    perfiles_alumno: {
      id: 'perfil-alumno-1',
      nombres: 'Marcos',
      apellidos: 'Pérez',
      fechaNacimiento: '1994-05-15',
      modalidad: Modalidad.PRESENCIAL,
      estadoActivacion: EstadoAlumno.ACTIVO,
    },
  };

  it('alta manual de alumno → tras la transacción emite la bienvenida con el enlace', async () => {
    const db = crearDbAlta(filasAlumno);
    const emisor = crearEmisor();
    const orden: string[] = [];
    const withTenant = async (_ctx: any, fn: any) => {
      orden.push('transaccion-inicio');
      const r = await fn(db);
      orden.push('transaccion-fin');
      return r;
    };
    emisor.emitAsync.mockImplementation(async () => {
      orden.push('evento');
      return [{ encolado: true, correoEnCamino: true }];
    });
    const service = new AlumnosService(db, crearCrypto(), emisor, withTenant as any);

    const resultado = await service.crearAlumnoManual(COACH_ID, dtoAlumno as any);

    expect(orden).toEqual(['transaccion-inicio', 'transaccion-fin', 'evento']);
    expect(resultado.mensaje).toMatch(/Le enviamos un correo/);
    const [nombre, evento] = emisor.emitAsync.mock.calls[0];
    expect(nombre).toBe(BienvenidaAlumnoEvent.NOMBRE);
    expect(evento.payload).toEqual({
      tipo: 'BIENVENIDA_ALUMNO',
      usuarioId: USUARIO_ID,
      email: 'marcos@guachafit.com',
      nombre: 'Marcos',
      token: 'b'.repeat(64),
    });
  });

  it('el fallo del bus no tumba el alta del alumno', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const db = crearDbAlta(filasAlumno);
    const service = new AlumnosService(db, crearCrypto(), crearEmisor(true), withTenantDirecto(db) as any);
    await expect(service.crearAlumnoManual(COACH_ID, dtoAlumno as any)).resolves.toHaveProperty(
      'tokenInvitacion'
    );
  });
});
