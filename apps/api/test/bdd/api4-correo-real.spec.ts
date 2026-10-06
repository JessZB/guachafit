import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  AdaptadorCorreoBrevo,
  URL_API_BREVO_CORREO,
} from '../../src/modules/notificaciones/correo/adaptador-correo-brevo';
import { AdaptadorCorreoSimulado } from '../../src/modules/notificaciones/correo/adaptador-correo-simulado';
import {
  ErrorEntregaCorreoPermanente,
  ErrorEntregaCorreoTransitorio,
  type MensajeCorreo,
} from '../../src/modules/notificaciones/correo/adaptador-correo';
import { crearAdaptadorCorreo } from '../../src/modules/notificaciones/correo/crear-adaptador-correo';
import {
  escaparHtml,
  plantillaBienvenidaAlumno,
  plantillaBienvenidaEntrenador,
  plantillaRecuperacionPassword,
  plantillaNotificacionGenerica,
  construirCorreoCuenta,
} from '../../src/modules/notificaciones/correo/plantillas-correo';
import { leerConfigCorreo, obtenerUrlWeb } from '../../src/common/config/correo';
import { EmailNotificationProcessor } from '../../src/modules/notificaciones/processors/email-notification.processor';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import {
  AvisoCorreoCambiadoEvent,
  AvisoPasswordCambiadaEvent,
  BienvenidaAlumnoEvent,
  ConfirmacionCambioCorreoEvent,
  PATRON_EVENTOS_CORREO_CUENTA,
  RecuperacionPasswordSolicitadaEvent,
  TIPOS_CORREO_SEGURIDAD,
} from '../../src/modules/notificaciones/events/eventos-correo-cuenta';
import { LIMITADOR_WORKER_EMAIL } from '../../src/modules/notificaciones/notificaciones.config';
import { contieneJerga } from '../../src/common/errores/jerga';

/**
 * Correo real con Brevo (worker), plantillas y despacho de correos de cuenta.
 *
 * Arquitectura (ADR-008/ADR-010, RF-014, RNF-004): los servicios de negocio emiten un evento; el
 * despachador encola en `notificaciones-email`; el worker entrega con el adaptador de correo.
 */

const MENSAJE: MensajeCorreo = {
  para: { email: 'ana@guachafit.com', nombre: 'Ana' },
  asunto: 'Hola',
  html: '<p>Hola</p>',
  texto: 'Hola',
};

function respuesta(status: number, cuerpo: unknown = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function crearBrevo(fetchImpl: any) {
  return new AdaptadorCorreoBrevo({
    apiKey: 'clave-brevo-de-prueba',
    remitente: { email: 'hola@guachafit.com', nombre: 'GUACHAFIT' },
    fetch: fetchImpl,
  });
}

// ============================================================================
// 1. Adaptador Brevo (API HTTP transaccional, sin SDK)
// ============================================================================
describe('API-4 · Adaptador de correo Brevo', () => {
  it('envía POST a /v3/smtp/email con la cabecera api-key y el cuerpo documentado', async () => {
    const fetchMock = vi.fn(async () => respuesta(201, { messageId: '<abc@brevo>' }));
    const resultado = await crearBrevo(fetchMock).enviar(MENSAJE);

    expect(URL_API_BREVO_CORREO).toBe('https://api.brevo.com/v3/smtp/email');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe(URL_API_BREVO_CORREO);
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('clave-brevo-de-prueba');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers.accept).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'GUACHAFIT', email: 'hola@guachafit.com' },
      to: [{ email: 'ana@guachafit.com', name: 'Ana' }],
      subject: 'Hola',
      htmlContent: '<p>Hola</p>',
      textContent: 'Hola',
    });
    expect(resultado).toEqual({ idMensaje: '<abc@brevo>' });
  });

  it('sin nombre del destinatario no envía `name` vacío', async () => {
    const fetchMock = vi.fn(async () => respuesta(201, { messageId: 'x' }));
    await crearBrevo(fetchMock).enviar({ ...MENSAJE, para: { email: 'ana@guachafit.com' } });
    const cuerpo = JSON.parse((fetchMock.mock.calls[0] as any[])[1].body);
    expect(cuerpo.to).toEqual([{ email: 'ana@guachafit.com' }]);
  });

  it('429 (límite de Brevo) → error transitorio (BullMQ reintenta)', async () => {
    const fetchMock = vi.fn(async () => respuesta(429, { code: 'too_many_requests' }));
    await expect(crearBrevo(fetchMock).enviar(MENSAJE)).rejects.toBeInstanceOf(
      ErrorEntregaCorreoTransitorio
    );
  });

  it('5xx → error transitorio', async () => {
    for (const status of [500, 502, 503]) {
      const fetchMock = vi.fn(async () => respuesta(status));
      await expect(crearBrevo(fetchMock).enviar(MENSAJE)).rejects.toBeInstanceOf(
        ErrorEntregaCorreoTransitorio
      );
    }
  });

  it('fallo de red o tiempo de espera → error transitorio', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(crearBrevo(fetchMock).enviar(MENSAJE)).rejects.toBeInstanceOf(
      ErrorEntregaCorreoTransitorio
    );
  });

  it('4xx permanente (400 correo inválido, 401 clave mala) → error permanente con el código de Brevo', async () => {
    const fetchMock = vi.fn(async () =>
      respuesta(400, { code: 'invalid_parameter', message: 'email is not valid in to' })
    );
    const error = await crearBrevo(fetchMock)
      .enviar(MENSAJE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorEntregaCorreoPermanente);
    expect((error as Error).message).toContain('400');
    expect((error as Error).message).toContain('invalid_parameter');

    const fetch401 = vi.fn(async () => respuesta(401, { code: 'unauthorized' }));
    await expect(crearBrevo(fetch401).enviar(MENSAJE)).rejects.toBeInstanceOf(
      ErrorEntregaCorreoPermanente
    );
  });

  it('nunca escribe la clave de Brevo en el mensaje de error', async () => {
    const fetchMock = vi.fn(async () => respuesta(401, { code: 'unauthorized' }));
    const error = await crearBrevo(fetchMock)
      .enviar(MENSAJE)
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain('clave-brevo-de-prueba');
  });
});

// ============================================================================
// 1b. Selección del adaptador por configuración
// ============================================================================
describe('API-4 · Configuración del correo', () => {
  it('sin BREVO_API_KEY → modo simulado; con clave y remitente → Brevo', () => {
    expect(leerConfigCorreo({}).modo).toBe('simulado');
    const config = leerConfigCorreo({
      BREVO_API_KEY: ' xkeysib-123 ',
      EMAIL_REMITENTE: 'hola@guachafit.com',
    });
    expect(config).toMatchObject({
      modo: 'brevo',
      apiKey: 'xkeysib-123',
      remitente: { email: 'hola@guachafit.com', nombre: 'GUACHAFIT' },
    });
    expect(
      leerConfigCorreo({
        BREVO_API_KEY: 'k',
        EMAIL_REMITENTE: 'hola@guachafit.com',
        EMAIL_REMITENTE_NOMBRE: 'Coach Ana',
      }).remitente.nombre
    ).toBe('Coach Ana');
  });

  it('con clave pero sin remitente → simulado con aviso (Brevo rechazaría todos los envíos)', () => {
    const config = leerConfigCorreo({ BREVO_API_KEY: 'k' });
    expect(config.modo).toBe('simulado');
    expect(config.avisos.join(' ')).toMatch(/EMAIL_REMITENTE/);
  });

  it('crearAdaptadorCorreo: en producción sin clave registra un error claro, sin bloquear el arranque', () => {
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as any;
    const adaptador = crearAdaptadorCorreo({ NODE_ENV: 'production' }, logger);
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoSimulado);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/BREVO_API_KEY/));
  });

  it('crearAdaptadorCorreo: en desarrollo sin clave solo avisa (modo simulado)', () => {
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as any;
    const adaptador = crearAdaptadorCorreo({ NODE_ENV: 'development' }, logger);
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoSimulado);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('crearAdaptadorCorreo: con clave y remitente usa Brevo', () => {
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as any;
    const adaptador = crearAdaptadorCorreo(
      { NODE_ENV: 'production', BREVO_API_KEY: 'k', EMAIL_REMITENTE: 'hola@guachafit.com', APP_URL: 'https://app.guachafit.com' },
      logger
    );
    expect(adaptador).toBeInstanceOf(AdaptadorCorreoBrevo);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('crearAdaptadorCorreo: en producción sin APP_URL registra un error (los enlaces apuntarían a localhost)', () => {
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as any;
    crearAdaptadorCorreo(
      { NODE_ENV: 'production', BREVO_API_KEY: 'k', EMAIL_REMITENTE: 'hola@guachafit.com' },
      logger
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/APP_URL/));
  });

  it('obtenerUrlWeb: APP_URL sin barra final; si falta, el primer origen de CORS o localhost', () => {
    expect(obtenerUrlWeb({ APP_URL: 'https://app.guachafit.com/' })).toBe('https://app.guachafit.com');
    expect(obtenerUrlWeb({ CORS_ORIGINS: 'https://web.guachafit.com,https://otro.com' })).toBe(
      'https://web.guachafit.com'
    );
    expect(obtenerUrlWeb({})).toBe('http://localhost:3000');
  });

  it('el límite del worker queda en 50/s, holgado frente al tope de Brevo (1000/s)', () => {
    expect(LIMITADOR_WORKER_EMAIL).toEqual({ max: 50, duration: 1000 });
  });
});

// ============================================================================
// 2. Plantillas de correo (puras)
// ============================================================================
describe('API-4 · Plantillas de correo', () => {
  const BASE = 'https://app.guachafit.com';

  it('escaparHtml neutraliza los caracteres especiales', () => {
    expect(escaparHtml(`<script>"a" & 'b'</script>`)).toBe(
      '&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;'
    );
  });

  it('bienvenida de alumno: enlace /activar con el código, vence en 48 horas, tuteo', () => {
    const correo = plantillaBienvenidaAlumno({ nombre: 'Ana', token: 'abc123', urlWeb: BASE });
    const enlace = `${BASE}/activar?token=abc123`;
    expect(correo.asunto).toMatch(/GUACHAFIT/);
    expect(correo.texto).toContain(enlace);
    expect(correo.html).toContain(`href="${enlace}"`);
    expect(correo.texto).toMatch(/48 horas/);
    expect(correo.texto).toMatch(/Hola, Ana/);
    expect(correo.texto).toMatch(/crea tu contraseña/i);
  });

  it('bienvenida de entrenador: mismo mecanismo de activación', () => {
    const correo = plantillaBienvenidaEntrenador({ nombre: 'Luis', token: 'tok', urlWeb: BASE });
    expect(correo.html).toContain(`href="${BASE}/activar?token=tok"`);
    expect(correo.texto).toMatch(/48 horas/);
    expect(correo.texto).toMatch(/entrenador/i);
  });

  it('recuperación: enlace /restablecer, vence en 1 hora y avisa si no lo pediste', () => {
    const correo = plantillaRecuperacionPassword({ nombre: null, token: 'r3', urlWeb: BASE });
    expect(correo.html).toContain(`href="${BASE}/restablecer?token=r3"`);
    expect(correo.texto).toMatch(/1 hora/);
    expect(correo.texto).toMatch(/Si no pediste/);
    expect(correo.texto).toMatch(/^Hola,/);
  });

  it('escapa los datos dinámicos en el HTML (nombre malicioso)', () => {
    const correo = plantillaBienvenidaAlumno({
      nombre: '<img src=x onerror=alert(1)>',
      token: 'abc',
      urlWeb: BASE,
    });
    expect(correo.html).not.toContain('<img src=x');
    expect(correo.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('el código del enlace se codifica en la URL', () => {
    const correo = plantillaRecuperacionPassword({ nombre: 'Ana', token: 'a b&c', urlWeb: BASE });
    expect(correo.texto).toContain(`${BASE}/restablecer?token=a%20b%26c`);
  });

  it('HTML accesible: idioma español, título y botón con texto descriptivo', () => {
    const correo = plantillaRecuperacionPassword({ nombre: 'Ana', token: 't', urlWeb: BASE });
    expect(correo.html).toContain('<html lang="es">');
    expect(correo.html).toContain(`<title>${escaparHtml(correo.asunto)}</title>`);
    expect(correo.html).toMatch(/>Restablecer mi contraseña</);
  });

  it('los textos no usan jerga técnica', () => {
    for (const correo of [
      plantillaBienvenidaAlumno({ nombre: 'Ana', token: 't', urlWeb: BASE }),
      plantillaBienvenidaEntrenador({ nombre: 'Luis', token: 't', urlWeb: BASE }),
      plantillaRecuperacionPassword({ nombre: 'Ana', token: 't', urlWeb: BASE }),
    ]) {
      expect(contieneJerga(correo.asunto), correo.asunto).toBe(false);
      // El texto plano sin la URL (que lleva el parámetro técnico del enlace).
      const sinUrl = correo.texto.replace(/https?:\/\/\S+/g, '');
      expect(contieneJerga(sinUrl), sinUrl).toBe(false);
    }
  });

  it('notificación genérica: escapa el cuerpo y resuelve enlaces relativos con la URL de la web', () => {
    const correo = plantillaNotificacionGenerica({
      titulo: 'Pago aprobado',
      cuerpo: 'Tu pago <b>fue</b> aprobado.',
      enlace: '/app/pagos',
      urlWeb: BASE,
    });
    expect(correo.asunto).toBe('Pago aprobado');
    expect(correo.html).toContain('Tu pago &lt;b&gt;fue&lt;/b&gt; aprobado.');
    expect(correo.html).toContain(`href="${BASE}/app/pagos"`);
    expect(correo.texto).toContain(`${BASE}/app/pagos`);
  });

  it('notificación genérica: ignora enlaces con esquemas peligrosos', () => {
    const correo = plantillaNotificacionGenerica({
      titulo: 'X',
      cuerpo: 'Y',
      enlace: 'javascript:alert(1)',
      urlWeb: BASE,
    });
    expect(correo.html).not.toContain('javascript:');
  });

  it('construirCorreoCuenta elige la plantilla según el tipo', () => {
    expect(
      construirCorreoCuenta(
        { tipo: 'RECUPERACION_PASSWORD', usuarioId: 'u', email: 'a@b.com', nombre: null, token: 't' },
        BASE
      ).texto
    ).toContain('/restablecer?token=t');
    expect(
      construirCorreoCuenta(
        { tipo: 'BIENVENIDA_ALUMNO', usuarioId: 'u', email: 'a@b.com', nombre: 'Ana', token: 't' },
        BASE
      ).texto
    ).toContain('/activar?token=t');
  });
});

// ============================================================================
// 3. Worker: entrega real con el adaptador inyectado
// ============================================================================
describe('API-4 · EmailNotificationProcessor con adaptador', () => {
  // La URL pública sale de APP_URL (fuente única, `obtenerUrlWeb`).
  beforeEach(() => vi.stubEnv('APP_URL', 'https://app.x'));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function job(data: Record<string, unknown>, attemptsMade = 0): any {
    return { id: 'job-1', name: 'enviar-email', attemptsMade, opts: { attempts: 4 }, data };
  }

  const datosBase = {
    usuarioId: 'u-1',
    email: 'ana@guachafit.com',
    asunto: 'Pago aprobado',
    cuerpo: 'Tu pago fue aprobado.',
    tipoEvento: 'PAGO_APROBADO',
    linkAccion: '/app/pagos',
  };

  it('entrega con el adaptador: usa el HTML y texto del job si vienen ya armados', async () => {
    const adaptador = { enviar: vi.fn(async () => ({ idMensaje: 'm-1' })) };
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, adaptador);

    const resultado = await processor.process(
      job({ ...datosBase, html: '<p>armado</p>', nombreDestinatario: 'Ana' })
    );

    expect(resultado).toEqual({ status: 'sent' });
    expect(adaptador.enviar).toHaveBeenCalledWith({
      para: { email: 'ana@guachafit.com', nombre: 'Ana' },
      asunto: 'Pago aprobado',
      html: '<p>armado</p>',
      texto: 'Tu pago fue aprobado.',
    });
  });

  it('sin HTML en el job arma la plantilla genérica con el enlace absoluto', async () => {
    const adaptador = { enviar: vi.fn(async () => ({ idMensaje: 'm-1' })) };
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, adaptador);

    await processor.process(job(datosBase));

    const mensaje = (adaptador.enviar.mock.calls[0] as any[])[0] as MensajeCorreo;
    expect(mensaje.html).toContain('href="https://app.x/app/pagos"');
    expect(mensaje.texto).toContain('https://app.x/app/pagos');
  });

  it('error transitorio → relanza para que BullMQ reintente con el backoff del RNF-004', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const adaptador = {
      enviar: vi.fn(async () => {
        throw new ErrorEntregaCorreoTransitorio('Brevo respondió 503');
      }),
    };
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, adaptador);

    const error = await processor.process(job(datosBase)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorEntregaCorreoTransitorio);
    expect(error).not.toBeInstanceOf(UnrecoverableError);
  });

  it('error permanente (4xx) → UnrecoverableError: BullMQ no reintenta', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const adaptador = {
      enviar: vi.fn(async () => {
        throw new ErrorEntregaCorreoPermanente('Brevo rechazó el envío (400 invalid_parameter)');
      }),
    };
    const processor = new EmailNotificationProcessor({ add: vi.fn() } as any, adaptador);

    const error = await processor.process(job(datosBase)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect((error as Error).message).toContain('400');
  });

  it('un fallo permanente se copia a la DLQ aunque no haya agotado los intentos', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const dlq = { name: 'notificaciones-email-dead-letter', add: vi.fn(async () => undefined) };
    const processor = new EmailNotificationProcessor(dlq as any, { enviar: vi.fn() });

    await processor.alAgotarIntentos(job(datosBase, 1), new UnrecoverableError('400 permanente'));
    expect(dlq.add).toHaveBeenCalledTimes(1);

    dlq.add.mockClear();
    await processor.alAgotarIntentos(job(datosBase, 1), new Error('503 transitorio'));
    expect(dlq.add).not.toHaveBeenCalled();
  });

  it('el adaptador simulado conserva el fallo simulado para las pruebas de resiliencia', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const simulado = new AdaptadorCorreoSimulado();
    await expect(
      simulado.enviar({ ...MENSAJE, para: { email: 'error-500-simulado@guachafit.com' } })
    ).rejects.toBeInstanceOf(ErrorEntregaCorreoTransitorio);
    await expect(simulado.enviar(MENSAJE)).resolves.toEqual({ idMensaje: null });
  });
});

// ============================================================================
// 4. Despachador: correos de cuenta (sin bandeja In-App ni preferencias)
// ============================================================================
describe('API-4 · Despacho de correos de cuenta', () => {
  function crearDispatcher() {
    const db: any = { insert: vi.fn(), select: vi.fn() };
    const emailQueue = { add: vi.fn(async () => ({})) };
    const pushQueue = { add: vi.fn() };
    const dispatcher = new NotificationDispatcherService(
      db,
      { obtenerPreferencias: vi.fn() } as any,
      { listarDispositivosActivos: vi.fn() } as any,
      pushQueue as any,
      emailQueue as any
    );
    return { dispatcher, db, emailQueue };
  }

  it('los eventos de correo de cuenta usan su propio espacio (no pasan por la bandeja In-App)', () => {
    expect(PATRON_EVENTOS_CORREO_CUENTA).toBe('correo-cuenta.**');
    expect(BienvenidaAlumnoEvent.NOMBRE.startsWith('correo-cuenta.')).toBe(true);
    expect(RecuperacionPasswordSolicitadaEvent.NOMBRE.startsWith('correo-cuenta.')).toBe(true);
  });

  it('encola el correo ya armado en notificaciones-email, sin In-App ni preferencias', async () => {
    const { dispatcher, db, emailQueue } = crearDispatcher();

    await dispatcher.alEventoCorreoCuenta(
      new RecuperacionPasswordSolicitadaEvent({
        tipo: 'RECUPERACION_PASSWORD',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: 'codigo-de-un-solo-uso',
      })
    );

    expect(db.insert).not.toHaveBeenCalled();
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    const [nombre, datos, opciones] = emailQueue.add.mock.calls[0] as any[];
    expect(nombre).toBe('enviar-email');
    expect(datos).toMatchObject({
      usuarioId: 'u-1',
      email: 'ana@guachafit.com',
      nombreDestinatario: 'Ana',
      tipoEvento: 'RECUPERACION_PASSWORD',
      esCriticoSeguridad: true,
    });
    expect(datos.html).toContain('/restablecer?token=codigo-de-un-solo-uso');
    expect(datos.cuerpo).toContain('/restablecer?token=codigo-de-un-solo-uso');
    // Idempotencia por enlace: el id no lleva el código en claro.
    expect(opciones.jobId).toMatch(/^cuenta_RECUPERACION_PASSWORD_u-1_[0-9a-f]{16}$/);
    expect(opciones.jobId).not.toContain('codigo-de-un-solo-uso');
    // El enlace no se retiene en Redis una vez entregado.
    expect(opciones.removeOnComplete).toBe(true);
    expect(opciones.attempts).toBe(4);
  });

  it('avisos sin enlace: dos AVISO_PASSWORD_CAMBIADA seguidos producen jobId distintos', async () => {
    // W2 (03/05): con `token: ''` la huella era constante y BullMQ descartaba el segundo aviso.
    const { dispatcher, emailQueue } = crearDispatcher();
    const aviso = () =>
      new AvisoPasswordCambiadaEvent({
        tipo: 'AVISO_PASSWORD_CAMBIADA',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
      });

    await dispatcher.alEventoCorreoCuenta(aviso());
    await dispatcher.alEventoCorreoCuenta(aviso());

    expect(emailQueue.add).toHaveBeenCalledTimes(2);
    const idPrimero = emailQueue.add.mock.calls[0][2].jobId as string;
    const idSegundo = emailQueue.add.mock.calls[1][2].jobId as string;
    expect(idPrimero).toMatch(/^cuenta_AVISO_PASSWORD_CAMBIADA_u-1_aviso_[0-9a-f-]{36}$/);
    expect(idSegundo).toMatch(/^cuenta_AVISO_PASSWORD_CAMBIADA_u-1_aviso_[0-9a-f-]{36}$/);
    expect(idPrimero).not.toBe(idSegundo);
  });

  it('los correos con enlace mantienen la idempotencia por huella del código', async () => {
    const { dispatcher, emailQueue } = crearDispatcher();
    const recuperacion = (token: string) =>
      new RecuperacionPasswordSolicitadaEvent({
        tipo: 'RECUPERACION_PASSWORD',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token,
      });

    await dispatcher.alEventoCorreoCuenta(recuperacion('codigo-1'));
    await dispatcher.alEventoCorreoCuenta(recuperacion('codigo-1'));
    await dispatcher.alEventoCorreoCuenta(recuperacion('codigo-2'));

    const ids = emailQueue.add.mock.calls.map((llamada: any[]) => llamada[2].jobId as string);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[0]).toMatch(/^cuenta_RECUPERACION_PASSWORD_u-1_[0-9a-f]{16}$/);
  });

  it('esCriticoSeguridad sale de TIPOS_CORREO_SEGURIDAD (los cuatro de seguridad, la bienvenida no)', async () => {
    expect([...TIPOS_CORREO_SEGURIDAD]).toEqual([
      'RECUPERACION_PASSWORD',
      'CONFIRMACION_CAMBIO_CORREO',
      'AVISO_CORREO_CAMBIADO',
      'AVISO_PASSWORD_CAMBIADA',
    ]);
    const { dispatcher, emailQueue } = crearDispatcher();
    const eventos = [
      new RecuperacionPasswordSolicitadaEvent({
        tipo: 'RECUPERACION_PASSWORD',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: 't1',
      }),
      new ConfirmacionCambioCorreoEvent({
        tipo: 'CONFIRMACION_CAMBIO_CORREO',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: 't2',
      }),
      new AvisoCorreoCambiadoEvent({
        tipo: 'AVISO_CORREO_CAMBIADO',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
        correoNuevo: 'nuevo@guachafit.com',
      }),
      new AvisoPasswordCambiadaEvent({
        tipo: 'AVISO_PASSWORD_CAMBIADA',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: '',
      }),
      new BienvenidaAlumnoEvent({
        tipo: 'BIENVENIDA_ALUMNO',
        usuarioId: 'u-1',
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token: 't3',
      }),
    ];

    for (const evento of eventos) {
      await dispatcher.alEventoCorreoCuenta(evento);
    }

    const criticos = emailQueue.add.mock.calls.map(
      (llamada: any[]) => llamada[1].esCriticoSeguridad as boolean
    );
    expect(criticos).toEqual([true, true, true, true, false]);
  });
});
