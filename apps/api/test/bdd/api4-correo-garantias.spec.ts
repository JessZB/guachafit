import { describe, it, expect, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getTableName } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  Modalidad,
  Rol,
  TipoDocumento,
  VIGENCIA_ENLACE_ACTIVACION_MS,
  VIGENCIA_ENLACE_RECUPERACION_MS,
  textoVigencia,
  MENSAJE_RECUPERACION_SOLICITADA as MENSAJE_RECUPERACION_COMPARTIDO,
  MENSAJE_ENLACE_RECUPERACION_INVALIDO as MENSAJE_ENLACE_INVALIDO_COMPARTIDO,
  MENSAJE_PASSWORD_ACTUALIZADA as MENSAJE_PASSWORD_COMPARTIDO,
} from '@guachafit/shared';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { CryptoService } from '../../src/common/services/crypto.service';
import {
  LIMITE_RECUPERACION_SOLO_CORREO,
  VENTANA_RECUPERACION_SOLO_CORREO_MS,
} from '../../src/common/guards/limite-intentos.guard';
import {
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_ENLACE_RECUPERACION_INVALIDO,
  MENSAJE_PASSWORD_ACTUALIZADA,
  MENSAJE_RECUPERACION_SOLICITADA,
} from '../../src/common/mensajes-acceso';
import {
  RecuperacionPasswordSolicitadaEvent,
  BienvenidaAlumnoEvent,
  TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS,
} from '../../src/modules/notificaciones/events/eventos-correo-cuenta';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import { EmailNotificationProcessor } from '../../src/modules/notificaciones/processors/email-notification.processor';
import { moverJobADeadLetter } from '../../src/modules/notificaciones/dead-letter';
import {
  RETENCION_DLQ,
  RETENCION_FALLIDOS_CORREO_CUENTA,
} from '../../src/modules/notificaciones/notificaciones.config';
import * as moduloAdaptador from '../../src/modules/notificaciones/correo/adaptador-correo';
import { AdaptadorCorreoBrevo } from '../../src/modules/notificaciones/correo/adaptador-correo-brevo';
import { AdaptadorCorreoSimulado } from '../../src/modules/notificaciones/correo/adaptador-correo-simulado';
import {
  plantillaBienvenidaAlumno,
  plantillaBienvenidaEntrenador,
  plantillaRecuperacionPassword,
} from '../../src/modules/notificaciones/correo/plantillas-correo';
import { esperarConLimite } from '../../src/common/esperar-con-limite.util';
import { enmascararCorreo } from '../../src/common/enmascarar-correo.util';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';
import { contieneJerga } from '../../src/common/errores/jerga';

/**
 * Correos de cuenta: garantías tras la revisión.
 *
 * 1. El alta solo afirma "te enviamos un correo" si el correo quedó realmente en camino.
 * 2. Con Redis caído el encolado no queda colgado: hay tiempo límite.
 * 3. Los enlaces con código no se retienen en la cola de fallidos ni en la DLQ.
 * 4. Un tercero no puede anular el enlace vigente de otra persona ni saturar su buzón.
 * 5. La respuesta de la recuperación no delata por tiempo si la cuenta existe.
 * 6. Vigencias y textos compartidos en una sola fuente.
 */

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const COACH_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a'.repeat(64);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function diferido<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
}

const nuncaResuelve = () => new Promise<never>(() => undefined);

// ============================================================================
// Utilidades
// ============================================================================
describe('Garantías · utilidades', () => {
  it('esperarConLimite: devuelve el valor si llega a tiempo', async () => {
    await expect(esperarConLimite(Promise.resolve(7), 1000)).resolves.toEqual({ ok: true, valor: 7 });
  });

  it('esperarConLimite: un error se informa sin lanzar', async () => {
    const r = await esperarConLimite(Promise.reject(new Error('caído')), 1000);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ motivo: 'error' });
  });

  it('esperarConLimite: vence a tiempo, limpia el temporizador y avisa la cancelación', async () => {
    vi.useFakeTimers();
    const alCancelar = vi.fn();
    const pendiente = esperarConLimite(nuncaResuelve(), 500, alCancelar);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pendiente).resolves.toMatchObject({ ok: false, motivo: 'tiempo' });
    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enmascararCorreo: deja la primera letra y el dominio', () => {
    expect(enmascararCorreo('ana@guachafit.com')).toBe('a***@guachafit.com');
    expect(enmascararCorreo('sin-arroba')).toBe('***');
    expect(enmascararCorreo('')).toBe('***');
  });
});

// ============================================================================
// 1 y 2. Despachador: confirma el encolado con tiempo límite
// ============================================================================
describe('Garantías · el despachador confirma el encolado de los correos de cuenta', () => {
  function crear(opciones: { add?: any; entregaReal?: boolean; cliente?: any } = {}) {
    const emailQueue: any = { add: opciones.add ?? vi.fn(async () => ({})) };
    if (opciones.cliente) emailQueue.client = Promise.resolve(opciones.cliente);
    const adaptador =
      opciones.entregaReal === undefined
        ? undefined
        : { entregaReal: opciones.entregaReal, enviar: vi.fn() };
    const dispatcher = new NotificationDispatcherService(
      { insert: vi.fn(), select: vi.fn() } as any,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      emailQueue,
      adaptador as any
    );
    return { dispatcher, emailQueue };
  }

  const evento = () =>
    new RecuperacionPasswordSolicitadaEvent({
      tipo: 'RECUPERACION_PASSWORD',
      usuarioId: USUARIO_ID,
      email: 'ana@guachafit.com',
      nombre: 'Ana',
      token: TOKEN,
    });

  it('con Brevo configurado y encolado confirmado → el correo está en camino', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { dispatcher } = crear({ entregaReal: true });
    await expect(dispatcher.alEventoCorreoCuenta(evento())).resolves.toEqual({
      encolado: true,
      correoEnCamino: true,
    });
  });

  it('en modo simulado (sin Brevo) se encola pero NO se considera en camino', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { dispatcher } = crear({ entregaReal: false });
    await expect(dispatcher.alEventoCorreoCuenta(evento())).resolves.toEqual({
      encolado: true,
      correoEnCamino: false,
    });
  });

  it('sin adaptador inyectado decide por la configuración (sin BREVO_API_KEY → simulado)', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.stubEnv('BREVO_API_KEY', '');
    const { dispatcher } = crear();
    await expect(dispatcher.alEventoCorreoCuenta(evento())).resolves.toMatchObject({
      correoEnCamino: false,
    });
  });

  it('Redis no responde: vence el tiempo límite, registra un error sin el código ni el correo completo', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { dispatcher } = crear({ entregaReal: true, add: vi.fn(nuncaResuelve) });

    const pendiente = dispatcher.alEventoCorreoCuenta(evento());
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS);

    await expect(pendiente).resolves.toEqual({ encolado: false, correoEnCamino: false });
    expect(error).toHaveBeenCalledTimes(1);
    const linea = String(error.mock.calls[0][0]);
    expect(linea).not.toContain(TOKEN);
    expect(linea).not.toContain('ana@guachafit.com');
    expect(linea).toContain('a***@guachafit.com');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Redis reconectando: no deja el código en la cola de comandos pendientes (no llama a add)', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { dispatcher, emailQueue } = crear({
      entregaReal: true,
      cliente: { status: 'reconnecting' },
    });
    await expect(dispatcher.alEventoCorreoCuenta(evento())).resolves.toEqual({
      encolado: false,
      correoEnCamino: false,
    });
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('un fallo de bienvenida se registra como aviso', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { dispatcher } = crear({
      entregaReal: true,
      add: vi.fn(async () => {
        throw new Error('Connection is closed.');
      }),
    });
    const resultado = await dispatcher.alEventoCorreoCuenta(
      new BienvenidaAlumnoEvent({
        tipo: 'BIENVENIDA_ALUMNO',
        usuarioId: USUARIO_ID,
        email: 'marcos@guachafit.com',
        nombre: 'Marcos',
        token: TOKEN,
      })
    );
    expect(resultado).toEqual({ encolado: false, correoEnCamino: false });
    expect(String(warn.mock.calls[0][0])).not.toContain(TOKEN);
  });

  it('los correos de cuenta fallidos se retienen poco tiempo (24 h)', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { dispatcher, emailQueue } = crear({ entregaReal: true });
    await dispatcher.alEventoCorreoCuenta(evento());
    const opciones = emailQueue.add.mock.calls[0][2];
    expect(opciones.removeOnFail).toEqual(RETENCION_FALLIDOS_CORREO_CUENTA);
    expect(RETENCION_FALLIDOS_CORREO_CUENTA.age).toBe(24 * 60 * 60);
  });
});

// ============================================================================
// 1. Altas: el mensaje solo afirma el envío si el correo está en camino
// ============================================================================
describe('Garantías · el alta solo afirma el envío si el correo quedó en camino', () => {
  function crearDbAlta(filasInsertadas: Record<string, any>) {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
            then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
          }),
        }),
      }),
      insert: (tabla: any) => ({
        values: () => ({ returning: () => Promise.resolve([filasInsertadas[getTableName(tabla)]]) }),
      }),
    } as any;
  }

  const crypto = () =>
    ({
      generateInvitationToken: () => ({
        rawToken: 'b'.repeat(64),
        tokenHash: 'h',
        expiresAt: new Date(Date.now() + VIGENCIA_ENLACE_ACTIVACION_MS),
      }),
      encryptHealthRecord: (t: string) => t,
      hashPassword: async (p: string) => p,
    }) as any;

  const emisorQueResponde = (resultados: unknown) =>
    ({ emitAsync: vi.fn(async () => resultados) }) as any;

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
  const dtoAlumno = {
    nombres: 'Marcos',
    apellidos: 'Pérez',
    email: 'marcos@guachafit.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '18456123',
    fechaNacimiento: '1994-05-15',
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.PRESENCIAL,
  } as any;

  const filasEntrenador = {
    usuarios: { id: COACH_ID, email: 'luis@guachafit.com' },
    perfiles_entrenador: { id: 'perfil-1', nombres: 'Luis', apellidos: 'Pérez', coachCode: 'LUISFIT' },
  };
  const dtoEntrenador = {
    nombres: 'Luis',
    apellidos: 'Pérez',
    email: 'luis@guachafit.com',
    coachCode: 'LUISFIT',
    capacidadMaxima: 50,
    tasaCambioGlobal: '65.0000',
    telefonoContacto: '+584121234567',
  } as any;

  const crearAlumnos = (emisor: any) => {
    const db = crearDbAlta(filasAlumno);
    return new AlumnosService(db, crypto(), emisor, ((_c: any, fn: any) => fn(db)) as any);
  };
  const crearAuth = (emisor: any) => {
    const db = crearDbAlta(filasEntrenador);
    return new AuthService(db, crypto(), ((_c: any, fn: any) => fn(db)) as any, emisor);
  };

  it('alumno: correo en camino → correoEnviado y mensaje con el envío', async () => {
    const r = await crearAlumnos(emisorQueResponde([{ encolado: true, correoEnCamino: true }]))
      .crearAlumnoManual(COACH_ID, dtoAlumno);
    expect(r.correoEnviado).toBe(true);
    expect(r.mensaje).toContain('Le enviamos un correo');
  });

  it('alumno: modo simulado → no afirma un envío inexistente', async () => {
    const r = await crearAlumnos(emisorQueResponde([{ encolado: true, correoEnCamino: false }]))
      .crearAlumnoManual(COACH_ID, dtoAlumno);
    expect(r.correoEnviado).toBe(false);
    expect(r.mensaje).toContain('Comparte el enlace de activación');
    expect(r.mensaje.toLowerCase()).not.toContain('correo');
  });

  it('alumno: el encolado no confirma a tiempo → correoEnviado false y aviso en el log', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const pendiente = crearAlumnos({ emitAsync: vi.fn(nuncaResuelve) }).crearAlumnoManual(
      COACH_ID,
      dtoAlumno
    );
    await vi.advanceTimersByTimeAsync(TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS + 1000);
    const r = await pendiente;
    expect(r.correoEnviado).toBe(false);
    expect(r.tokenInvitacion).toBe('b'.repeat(64));
    expect(warn).toHaveBeenCalled();
  });

  it('entrenador: correo en camino → correoEnviado y mensaje con el envío', async () => {
    const r = await crearAuth(emisorQueResponde([{ encolado: true, correoEnCamino: true }]))
      .crearEntrenador(dtoEntrenador);
    expect(r.correoEnviado).toBe(true);
    expect(r.mensaje).toContain('Le enviamos un correo');
  });

  it('entrenador: modo simulado o fallo → comparte el enlace, sin afirmar el envío', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    for (const emisor of [
      emisorQueResponde([{ encolado: true, correoEnCamino: false }]),
      { emitAsync: vi.fn(async () => Promise.reject(new Error('Redis caído'))) },
    ]) {
      const r = await crearAuth(emisor).crearEntrenador(dtoEntrenador);
      expect(r.correoEnviado).toBe(false);
      expect(r.mensaje).toContain('Comparte el enlace de activación');
      expect(r.mensaje.toLowerCase()).not.toContain('correo');
    }
  });

  it('entrenador con contraseña directa → no hay correo que enviar', async () => {
    const r = await crearAuth(emisorQueResponde([])).crearEntrenador({
      ...dtoEntrenador,
      password: 'clave-directa-1',
    });
    expect(r.correoEnviado).toBe(false);
  });

  it('los mensajes de alta no usan jerga', async () => {
    for (const correoEnCamino of [true, false]) {
      const emisor = emisorQueResponde([{ encolado: true, correoEnCamino }]);
      const a = await crearAlumnos(emisor).crearAlumnoManual(COACH_ID, dtoAlumno);
      const e = await crearAuth(emisor).crearEntrenador(dtoEntrenador);
      expect(contieneJerga(a.mensaje), a.mensaje).toBe(false);
      expect(contieneJerga(e.mensaje), e.mensaje).toBe(false);
    }
  });
});

// ============================================================================
// 3. Enlaces con código fuera de la DLQ y de los registros de fallos
// ============================================================================
describe('Garantías · la DLQ no guarda enlaces con código', () => {
  const datosCuenta = {
    usuarioId: USUARIO_ID,
    email: 'ana@guachafit.com',
    nombreDestinatario: 'Ana',
    asunto: 'Restablece tu contraseña de GUACHAFIT',
    cuerpo: `https://app.x/restablecer?token=${TOKEN}`,
    html: `<a href="https://app.x/restablecer?token=${TOKEN}">x</a>`,
    tipoEvento: 'RECUPERACION_PASSWORD',
    esCriticoSeguridad: true,
  };
  const job = (data: any) => ({
    id: 'cuenta_x',
    name: 'enviar-email',
    attemptsMade: 4,
    opts: { attempts: 4 },
    data,
  });

  it('correo de cuenta → solo tipo, usuario y destinatario enmascarado', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dlq = { name: 'dlq', add: vi.fn(async () => undefined), clean: vi.fn(async () => []) };
    await moverJobADeadLetter(dlq as any, 'notificaciones-email', job(datosCuenta) as any, new Error('x'));
    const payload = (dlq.add.mock.calls[0] as any[])[1];
    expect(payload.datos).toEqual({
      tipoEvento: 'RECUPERACION_PASSWORD',
      usuarioId: USUARIO_ID,
      email: 'a***@guachafit.com',
    });
    expect(JSON.stringify(payload)).not.toContain(TOKEN);
  });

  it('otros avisos conservan sus datos para el reencolado manual', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dlq = { name: 'dlq', add: vi.fn(async () => undefined) };
    const datos = { usuarioId: 'u', email: 'b@x.com', asunto: 'Pago', cuerpo: 'ok', tipoEvento: 'PAGO_APROBADO' };
    await moverJobADeadLetter(dlq as any, 'notificaciones-email', job(datos) as any, new Error('x'));
    expect((dlq.add.mock.calls[0] as any[])[1].datos).toEqual(datos);
  });

  it('la DLQ se poda: borra los registros en espera más viejos que la retención', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dlq = { name: 'dlq', add: vi.fn(async () => undefined), clean: vi.fn(async () => []) };
    await moverJobADeadLetter(dlq as any, 'notificaciones-email', job(datosCuenta) as any, new Error('x'));
    expect(dlq.clean).toHaveBeenCalledWith(RETENCION_DLQ.age * 1000, RETENCION_DLQ.count, 'wait');
    expect(RETENCION_DLQ.age).toBeGreaterThan(0);
    expect(RETENCION_DLQ.count).toBeGreaterThan(0);
  });

  it('un fallo al podar no impide mover el job', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const dlq = {
      name: 'dlq',
      add: vi.fn(async () => undefined),
      clean: vi.fn(async () => {
        throw new Error('caído');
      }),
    };
    await expect(
      moverJobADeadLetter(dlq as any, 'notificaciones-email', job(datosCuenta) as any, new Error('x'))
    ).resolves.toBe(true);
  });

  it('el worker registra los fallos sin el correo completo', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, {
      entregaReal: true,
      enviar: vi.fn(async () => {
        throw new Error('503');
      }),
    });
    await processor.process(job(datosCuenta) as any).catch(() => undefined);
    const lineas = error.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lineas).not.toContain('ana@guachafit.com');
    expect(lineas).not.toContain(TOKEN);
  });
});

// ============================================================================
// 4 y 5. Recuperación: no anula enlaces ajenos y responde sin esperar
// ============================================================================
describe('Garantías · recuperación de contraseña', () => {
  function crearDb(usuario: any, perfiles: { alumno?: any; entrenador?: any } = {}) {
    const actualizaciones: any[] = [];
    const db: any = {
      select: () => ({
        from: (tabla: any) => {
          const nombre = getTableName(tabla);
          const filas =
            nombre === 'usuarios'
              ? usuario
                ? [usuario]
                : []
              : nombre === 'perfiles_alumno'
                ? perfiles.alumno
                  ? [perfiles.alumno]
                  : []
                : nombre === 'perfiles_entrenador'
                  ? [perfiles.entrenador ?? { estadoLicencia: EstadoLicencia.ACTIVA, activo: true }]
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
            return { returning: () => Promise.resolve([{ id: usuario?.id ?? USUARIO_ID }]) };
          },
        }),
      }),
    };
    return { db, actualizaciones };
  }

  const cryptoMock = () =>
    ({
      generarTokenRecuperacion: vi.fn(() => ({
        rawToken: TOKEN,
        tokenHash: 'hash-nuevo',
        expiresAt: new Date(Date.now() + VIGENCIA_ENLACE_RECUPERACION_MS),
      })),
    }) as any;

  const alumno = {
    id: USUARIO_ID,
    email: 'ana@guachafit.com',
    rol: Rol.ALUMNO,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
  };
  const perfilAlumno = { usuarioId: USUARIO_ID, entrenadorId: COACH_ID, nombres: 'Ana', deletedAtUtc: null };

  function crear(usuario: any, perfiles: { alumno?: any; entrenador?: any } = { alumno: perfilAlumno }) {
    const { db, actualizaciones } = crearDb(usuario, perfiles);
    const emisor = { emitAsync: vi.fn(async () => [{ encolado: true, correoEnCamino: true }]) } as any;
    const service = new AuthService(db, cryptoMock(), ((_c: any, fn: any) => fn(db)) as any, emisor);
    return { service, actualizaciones, emisor };
  }

  const minutos = (m: number) => m * 60_000;

  it('enlace vigente emitido hace menos de 15 minutos → no lo rota ni envía otro correo', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    // Emitido hace 10 minutos: vence dentro de 50.
    const expira = new Date(Date.now() + VIGENCIA_ENLACE_RECUPERACION_MS - minutos(10));
    const { service, actualizaciones, emisor } = crear({ ...alumno, tokenRecuperacionExpira: expira });
    await service.procesarSolicitudRecuperacion('ana@guachafit.com');
    expect(actualizaciones).toEqual([]);
    expect(emisor.emitAsync).not.toHaveBeenCalled();
  });

  it('enlace emitido hace más de 15 minutos → emite uno nuevo (el anterior deja de servir)', async () => {
    const expira = new Date(Date.now() + VIGENCIA_ENLACE_RECUPERACION_MS - minutos(20));
    const { service, actualizaciones, emisor } = crear({ ...alumno, tokenRecuperacionExpira: expira });
    await service.procesarSolicitudRecuperacion('ana@guachafit.com');
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].tokenRecuperacionHash).toBe('hash-nuevo');
    expect(emisor.emitAsync).toHaveBeenCalledTimes(1);
  });

  it('entrenador: el correo de recuperación lo saluda por su nombre', async () => {
    const { service, emisor } = crear(
      { ...alumno, rol: Rol.ENTRENADOR, email: 'luis@guachafit.com' },
      { entrenador: { estadoLicencia: EstadoLicencia.ACTIVA, nombres: 'Luis' } }
    );
    await service.procesarSolicitudRecuperacion('luis@guachafit.com');
    const evento = (emisor.emitAsync.mock.calls[0] as any[])[1];
    expect(evento.payload.nombre).toBe('Luis');
  });

  it('responde sin esperar la búsqueda de la cuenta, el código ni el correo', async () => {
    const consulta = diferido<any[]>();
    const db: any = {
      select: () => ({ from: () => ({ where: () => consulta.promesa }) }),
      update: vi.fn(),
    };
    const emisor = { emitAsync: vi.fn(async () => []) } as any;
    const service = new AuthService(db, cryptoMock(), ((_c: any, fn: any) => fn(db)) as any, emisor);

    const respuesta = await service.solicitarRecuperacionPassword({ email: 'ana@guachafit.com' });

    expect(respuesta).toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    // La consulta sigue pendiente: la respuesta no dependió de si la cuenta existe.
    expect(db.update).not.toHaveBeenCalled();
    expect(emisor.emitAsync).not.toHaveBeenCalled();
    consulta.resolver([]);
  });

  it('un error en segundo plano solo se registra (la respuesta ya salió)', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const db: any = {
      select: () => ({ from: () => ({ where: () => Promise.reject(new Error('BD caída')) }) }),
    };
    const service = new AuthService(db, cryptoMock(), ((_c: any, fn: any) => fn(db)) as any);
    await expect(
      service.solicitarRecuperacionPassword({ email: 'ana@guachafit.com' })
    ).resolves.toEqual({ mensaje: MENSAJE_RECUPERACION_SOLICITADA });
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0][0])).not.toContain('ana@guachafit.com');
  });
});

describe('Garantías · límite de recuperación solo por correo (independiente de la IP)', () => {
  async function crearApp() {
    const authService = {
      solicitarRecuperacionPassword: vi.fn(async () => ({ mensaje: MENSAJE_RECUPERACION_SOLICITADA })),
      login: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', true);
    configurarErroresGlobales(app);
    await app.init();
    return app as INestApplication;
  }

  it('3 pedidos por hora para el mismo correo aunque cambie la IP', async () => {
    expect(LIMITE_RECUPERACION_SOLO_CORREO).toBe(3);
    expect(VENTANA_RECUPERACION_SOLO_CORREO_MS).toBe(60 * 60 * 1000);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const app = await crearApp();
    const servidor = app.getHttpServer();
    const pedir = (ip: string, email = 'ana@guachafit.com') =>
      request(servidor).post('/auth/recuperar-password').set('X-Forwarded-For', ip).send({ email });

    for (let i = 0; i < LIMITE_RECUPERACION_SOLO_CORREO; i++) {
      expect((await pedir(`10.0.0.${i + 1}`)).status).toBe(200);
    }
    const bloqueada = await pedir('10.0.0.99', ' ANA@guachafit.com ');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.message).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    // Otro correo sigue pudiendo pedir su enlace.
    expect((await pedir('10.0.0.99', 'otro@guachafit.com')).status).toBe(200);
    await app.close();
  });

  it('el límite solo por correo no afecta al inicio de sesión', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer();
    for (let i = 0; i < 4; i++) {
      const res = await request(servidor)
        .post('/auth/login')
        .set('X-Forwarded-For', `10.1.0.${i + 1}`)
        .send({ email: 'ana@guachafit.com', password: 'clave-segura-1' });
      expect(res.status).toBe(200);
    }
    await app.close();
  });
});

// ============================================================================
// 6. Una sola fuente para vigencias, textos compartidos y URL
// ============================================================================
describe('Garantías · fuentes únicas', () => {
  it('vigencias compartidas: 48 horas la activación y 1 hora la recuperación', () => {
    expect(VIGENCIA_ENLACE_ACTIVACION_MS).toBe(48 * 60 * 60 * 1000);
    expect(VIGENCIA_ENLACE_RECUPERACION_MS).toBe(60 * 60 * 1000);
    expect(textoVigencia(VIGENCIA_ENLACE_ACTIVACION_MS)).toBe('48 horas');
    expect(textoVigencia(VIGENCIA_ENLACE_RECUPERACION_MS)).toBe('1 hora');
  });

  it('crypto usa las vigencias compartidas', () => {
    const crypto = new CryptoService();
    const antes = Date.now();
    const inv = crypto.generateInvitationToken();
    const rec = crypto.generarTokenRecuperacion();
    expect(inv.expiresAt.getTime() - antes).toBeGreaterThanOrEqual(VIGENCIA_ENLACE_ACTIVACION_MS - 50);
    expect(inv.expiresAt.getTime() - antes).toBeLessThanOrEqual(VIGENCIA_ENLACE_ACTIVACION_MS + 1000);
    expect(rec.expiresAt.getTime() - antes).toBeLessThanOrEqual(VIGENCIA_ENLACE_RECUPERACION_MS + 1000);
  });

  it('las plantillas citan la vigencia desde la constante', () => {
    const base = { nombre: 'Ana', token: 't', urlWeb: 'https://app.x' };
    const vigActivacion = textoVigencia(VIGENCIA_ENLACE_ACTIVACION_MS);
    expect(plantillaBienvenidaAlumno(base).texto).toContain(`vence en ${vigActivacion}`);
    expect(plantillaBienvenidaEntrenador(base).texto).toContain(`vence en ${vigActivacion}`);
    expect(plantillaRecuperacionPassword(base).texto).toContain(
      `vence en ${textoVigencia(VIGENCIA_ENLACE_RECUPERACION_MS)}`
    );
  });

  it('asunto de bienvenida neutro en género', () => {
    expect(plantillaBienvenidaAlumno({ nombre: 'Ana', token: 't', urlWeb: 'https://x' }).asunto).toBe(
      'Te damos la bienvenida a GUACHAFIT: crea tu contraseña'
    );
  });

  it('los textos que la web compara por igualdad salen de @guachafit/shared', () => {
    expect(MENSAJE_RECUPERACION_SOLICITADA).toBe(MENSAJE_RECUPERACION_COMPARTIDO);
    expect(MENSAJE_ENLACE_RECUPERACION_INVALIDO).toBe(MENSAJE_ENLACE_INVALIDO_COMPARTIDO);
    expect(MENSAJE_PASSWORD_ACTUALIZADA).toBe(MENSAJE_PASSWORD_COMPARTIDO);
  });

  it('no queda el punto de extensión muerto de la URL: el worker usa APP_URL', async () => {
    expect((moduloAdaptador as Record<string, unknown>).URL_WEB_CORREO).toBeUndefined();
    vi.stubEnv('APP_URL', 'https://web.guachafit.com/');
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const adaptador = { entregaReal: true, enviar: vi.fn(async () => ({ idMensaje: null })) };
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, adaptador);
    await processor.process({
      id: 'j',
      name: 'enviar-email',
      attemptsMade: 0,
      opts: { attempts: 4 },
      data: { usuarioId: 'u', email: 'b@x.com', asunto: 'Pago', cuerpo: 'ok', tipoEvento: 'PAGO', linkAccion: '/app/pagos' },
    } as any);
    expect((adaptador.enviar.mock.calls[0] as any[])[0].html).toContain(
      'href="https://web.guachafit.com/app/pagos"'
    );
  });

  it('adaptadores: Brevo entrega de verdad; el simulado no', () => {
    expect(
      new AdaptadorCorreoBrevo({ apiKey: 'k', remitente: { email: 'a@b.c', nombre: 'G' } }).entregaReal
    ).toBe(true);
    expect(new AdaptadorCorreoSimulado().entregaReal).toBe(false);
  });

  it('el error de Brevo se registra acotado y sin el destinatario', async () => {
    const largo = `email ana@guachafit.com is not valid ${'x'.repeat(300)}`;
    const brevo = new AdaptadorCorreoBrevo({
      apiKey: 'k',
      remitente: { email: 'a@b.c', nombre: 'G' },
      fetch: async () =>
        new Response(JSON.stringify({ code: 'invalid_parameter', message: largo }), { status: 400 }),
    });
    const error = (await brevo
      .enviar({ para: { email: 'ana@guachafit.com' }, asunto: 'a', html: 'h', texto: 't' })
      .catch((e: unknown) => e)) as Error;
    expect(error.message).toContain('invalid_parameter');
    expect(error.message).not.toContain('ana@guachafit.com');
    expect(error.message).not.toContain('x'.repeat(130));
  });
});
