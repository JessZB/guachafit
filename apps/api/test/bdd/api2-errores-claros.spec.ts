/**
 * LOTE API-2 — Errores claros.
 *
 * 1. Traducción pura de errores de validación (Zod) a español claro con nombres de campo legibles.
 * 2. `parsearContrato` compartido: 400 con el mensaje traducido.
 * 3. Filtro global: ZodError no capturado → 400; error no controlado → 500 genérico (detalle solo
 *    en el log); HttpException → se respeta tal cual (`{ statusCode, message, error }`).
 * 4. Login con correo con espacios: se normaliza antes de validar (no más 500).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Controller,
  Get,
  INestApplication,
  Logger,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  LoginUsuarioSchema,
  CrearPlantillaRutinaSchema,
  CheckinNutricionalSchema,
  CODIGO_CHECKIN_FUERA_DE_PLAZO,
  CODIGO_CHECKIN_FUERA_DE_VENTANA,
  CODIGO_CHECKIN_YA_REGISTRADO,
  CODIGO_SESION_NO_INICIADA,
  CODIGO_SESION_VACIA,
} from '@guachafit/shared';
import * as compartido from '@guachafit/shared';
import {
  traducirErrorValidacion,
  MENSAJE_VALIDACION_GENERICO,
} from '../../src/common/errores/traducir-error-validacion';
import { parsearContrato } from '../../src/common/errores/parsear-contrato';
import {
  configurarErroresGlobales,
  FiltroErroresGlobal,
  MENSAJE_ERROR_INTERNO,
} from '../../src/common/errores/filtro-errores-global';
import {
  contieneJerga,
  PATRON_CAMEL_CASE,
  PATRON_ENUM_MAYUSCULAS,
  PATRON_JERGA,
} from '../../src/common/errores/jerga';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
// La web reemplaza cualquier mensaje "técnico": los textos nuevos deben pasar su filtro.
import { PATRON_MENSAJE_TECNICO } from '../../../web/src/lib/mensajes-error';

function primerError(schema: z.ZodTypeAny, datos: unknown): z.ZodError {
  const resultado = schema.safeParse(datos);
  if (resultado.success) throw new Error('Se esperaba un error de validación');
  return resultado.error;
}

describe('API-2 · traducirErrorValidacion (función pura)', () => {
  it('correo con formato inválido → nombre legible del campo', () => {
    const error = primerError(LoginUsuarioSchema, { email: 'no-es-correo', password: '12345678' });
    expect(traducirErrorValidacion(error)).toBe(
      'Revisa el campo «correo»: no tiene un formato válido.'
    );
  });

  it('campo obligatorio ausente → pide completarlo', () => {
    const error = primerError(z.object({ telefonoWhatsapp: z.string() }), {});
    expect(traducirErrorValidacion(error)).toBe('Completa el campo «WhatsApp».');
  });

  it('texto demasiado corto → indica el mínimo de caracteres', () => {
    const error = primerError(LoginUsuarioSchema, { email: 'a@b.co', password: '123' });
    expect(traducirErrorValidacion(error)).toBe(
      'Revisa el campo «contraseña»: debe tener al menos 8 caracteres.'
    );
  });

  it('mensaje propio con jerga (YYYY-MM-DD) → se reemplaza por la plantilla con etiqueta', () => {
    const schema = z.object({
      fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
    });
    const error = primerError(schema, { fechaNacimiento: '31/12/1990' });
    expect(traducirErrorValidacion(error)).toBe(
      'Revisa el campo «fecha de nacimiento»: no tiene un formato válido.'
    );
  });

  it('mensaje propio ya claro → se respeta tal cual', () => {
    const schema = z.object({ nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres') });
    const error = primerError(schema, { nombre: 'A' });
    expect(traducirErrorValidacion(error)).toBe('El nombre debe tener al menos 2 caracteres');
  });

  it('mensaje propio con jerga en un campo sin etiqueta → mensaje genérico', () => {
    const schema = z.object({ alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido') });
    const error = primerError(schema, { alumnoId: 'x' });
    expect(traducirErrorValidacion(error)).toBe(MENSAJE_VALIDACION_GENERICO);
    expect(MENSAJE_VALIDACION_GENERICO).toBe('Revisa los datos e inténtalo de nuevo.');
  });

  it('campo técnico sin etiqueta y mensaje por defecto de Zod → mensaje genérico', () => {
    const error = primerError(z.object({ storageKey: z.string() }), { storageKey: 3 });
    expect(traducirErrorValidacion(error)).toBe(MENSAJE_VALIDACION_GENERICO);
  });

  it('ruta anidada → usa el último nombre de campo', () => {
    const schema = z.object({ series: z.array(z.object({ pesoKg: z.number().min(0) })) });
    const error = primerError(schema, { series: [{ pesoKg: -1 }] });
    expect(traducirErrorValidacion(error)).toBe('Revisa el campo «peso»: debe ser 0 o más.');
  });

  it('opción fuera de la lista → pide elegir una opción válida', () => {
    const error = primerError(z.object({ modalidad: z.enum(['a', 'b']) }), { modalidad: 'c' });
    expect(traducirErrorValidacion(error)).toBe('Revisa el campo «modalidad»: elige una opción válida.');
  });

  it('LOTE API-N1: los campos de nutrición tienen nombre legible', () => {
    const etiquetas: Array<[string, string]> = [
      ['notasAlumno', 'notas'],
      ['fotosPlatos', 'fotos de platos'],
      ['tipoComida', 'tipo de comida'],
      ['aguaLitrosObjetivo', 'meta de agua'],
      ['recursos', 'recursos'],
      ['url', 'enlace'],
      ['timezoneCliente', 'zona horaria'],
      // LOTE API-N2
      ['zonaHoraria', 'zona horaria'],
      ['segundosDesdeCaptura', 'hora de captura'],
    ];
    for (const [campo, etiqueta] of etiquetas) {
      const error = primerError(z.object({ [campo]: z.number() }), { [campo]: 'x' });
      expect(traducirErrorValidacion(error), campo).toBe(`Revisa el campo «${etiqueta}»: no es válido.`);
    }
  });

  it('LOTE API-N1: tipo de comida inválido dentro de una foto del reporte', () => {
    const error = primerError(CheckinNutricionalSchema, {
      fecha: '2026-09-06',
      semaforo: 'cumplido',
      fotosPlatos: [{ tipoComida: 'brunch', storageKey: 'comidas/a/2026-09-06/1.webp' }],
    });
    expect(traducirErrorValidacion(error)).toBe(
      'Revisa el campo «tipo de comida»: elige una opción válida.'
    );
  });

  it('nunca expone el JSON de Zod, rutas ni códigos internos, y pasa el filtro de la web', () => {
    const casos: Array<[z.ZodTypeAny, unknown]> = [
      [LoginUsuarioSchema, { email: 'x', password: '12345678' }],
      [LoginUsuarioSchema, {}],
      [CrearPlantillaRutinaSchema, { nombre: 'Nivel', nivelObjetivo: 'ELITE', bloques: [] }],
      [z.object({ alumnoId: z.string().uuid() }), { alumnoId: 'x' }],
      [z.object({ fechaInicioUtc: z.string().datetime() }), { fechaInicioUtc: 'ayer' }],
    ];
    for (const [schema, datos] of casos) {
      const mensaje = traducirErrorValidacion(primerError(schema, datos));
      expect(mensaje).not.toMatch(/[{}\[\]]|invalid_|too_small|Required|Expected/);
      expect(PATRON_MENSAJE_TECNICO.test(mensaje)).toBe(false);
    }
  });
});

describe('API-2 · parsearContrato compartido', () => {
  it('lanza BadRequestException (400) con el mensaje traducido', () => {
    try {
      parsearContrato(LoginUsuarioSchema, { email: 'malo', password: '12345678' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).message).toBe(
        'Revisa el campo «correo»: no tiene un formato válido.'
      );
    }
  });

  it('devuelve los datos de salida del contrato (con defaults aplicados)', () => {
    const schema = z.object({ limit: z.number().default(20) });
    expect(parsearContrato(schema, {})).toEqual({ limit: 20 });
  });
});

@Controller('prueba')
class ControladorPrueba {
  @Post('zod')
  validarCrudo(@Body() body: unknown) {
    return LoginUsuarioSchema.parse(body);
  }

  @Get('fallo')
  fallar() {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 at /app/src/database/pool.ts:42');
  }

  @Get('no-encontrado')
  noEncontrado() {
    throw new NotFoundException('No encontramos esa plantilla. Puede que se haya eliminado.');
  }

  @Get('con-codigo')
  conCodigo() {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      // Literal a propósito: fija el contrato del cable que lee la web.
      code: 'SESION_NO_INICIADA',
      message: 'Para marcar series, primero pulsa «Comenzar a entrenar».',
    });
  }

  @Get('a-medias')
  aMedias(@Res() res: { status(codigo: number): unknown; write(texto: string): unknown }) {
    res.status(200);
    res.write('{"parcial":');
    throw new Error('falló a mitad de la respuesta');
  }
}

describe('API-2 · filtro global de errores', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  async function crearApp() {
    const moduleRef = await Test.createTestingModule({ controllers: [ControladorPrueba] }).compile();
    app = moduleRef.createNestApplication();
    configurarErroresGlobales(app);
    await app.init();
    return app.getHttpServer();
  }

  it('un ZodError no capturado responde 400 con mensaje humano (no 500)', async () => {
    const servidor = await crearApp();
    const res = await request(servidor).post('/prueba/zod').send({ email: 'malo', password: '12345678' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      message: 'Revisa el campo «correo»: no tiene un formato válido.',
      error: 'Bad Request',
    });
  });

  it('un error no controlado responde 500 genérico con referencia; el detalle solo va al log', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const servidor = await crearApp();
    const res = await request(servidor).get('/prueba/fallo?email=ana@guachafit.com');

    expect(res.status).toBe(500);
    expect(res.body.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
    expect(res.body.referencia).toMatch(/^[0-9a-f]{8}$/);
    expect(res.body.message).toBe(`${MENSAJE_ERROR_INTERNO} (Ref. ${res.body.referencia})`);
    expect(Object.keys(res.body).sort()).toEqual(['error', 'message', 'referencia', 'statusCode']);
    expect(MENSAJE_ERROR_INTERNO).toBe('Tuvimos un problema. Inténtalo de nuevo en unos minutos.');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|pool\.ts|stack/);

    // El log lleva la referencia, el método y la ruta (sin query string ni cuerpo) y el detalle.
    expect(logError).toHaveBeenCalledTimes(1);
    const log = JSON.stringify(logError.mock.calls);
    expect(log).toContain(res.body.referencia);
    expect(log).toContain('GET /prueba/fallo');
    expect(log).toContain('ECONNREFUSED');
    expect(log).not.toContain('ana@guachafit.com');
    expect(log).not.toContain('/prueba/fallo?');
  });

  it('cada 500 lleva una referencia distinta', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const servidor = await crearApp();
    const a = await request(servidor).get('/prueba/fallo');
    const b = await request(servidor).get('/prueba/fallo');
    expect(a.body.referencia).not.toBe(b.body.referencia);
  });

  it('si la respuesta ya empezó a enviarse, solo registra el error (no intenta escribir otra)', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const servidor = await crearApp();
    await request(servidor)
      .get('/prueba/a-medias')
      .then(
        (res) => res,
        (error: unknown) => error
      );

    expect(logError).toHaveBeenCalledTimes(1);
    const log = JSON.stringify(logError.mock.calls);
    expect(log).toContain('falló a mitad de la respuesta');
    expect(log).toContain('GET /prueba/a-medias');
    expect(log).not.toContain('ERR_HTTP_HEADERS_SENT');
  });

  it('headersSent (unitario): no llama a status/json y corta la conexión', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const respuesta = { headersSent: true, status: vi.fn(), json: vi.fn(), destroy: vi.fn() };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => respuesta,
        getRequest: () => ({ method: 'GET', originalUrl: '/x?y=1' }),
      }),
    } as unknown as ArgumentsHost;

    new FiltroErroresGlobal().catch(new Error('tarde'), host);

    expect(respuesta.status).not.toHaveBeenCalled();
    expect(respuesta.json).not.toHaveBeenCalled();
    expect(respuesta.destroy).toHaveBeenCalled();
  });

  it('las HttpException conservan su estado y cuerpo ({ statusCode, message, error })', async () => {
    const servidor = await crearApp();
    const res = await request(servidor).get('/prueba/no-encontrado');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: 'No encontramos esa plantilla. Puede que se haya eliminado.',
      error: 'Not Found',
    });
  });

  it('las HttpException con código estable lo conservan en el cuerpo', async () => {
    const servidor = await crearApp();
    const res = await request(servidor).get('/prueba/con-codigo');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SESION_NO_INICIADA');
    expect(res.body.message).toBe('Para marcar series, primero pulsa «Comenzar a entrenar».');
  });

  it('JSON mal formado → 400 claro, sin detalle del parser', async () => {
    const servidor = await crearApp();
    const res = await request(servidor)
      .post('/prueba/zod')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(MENSAJE_VALIDACION_GENERICO);
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|JSON|position/);
  });

  it('cuerpo demasiado grande → 413 claro con su nombre estándar', async () => {
    const servidor = await crearApp();
    const res = await request(servidor)
      .post('/prueba/zod')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      statusCode: 413,
      message: 'El archivo o los datos son demasiado grandes. Prueba con uno más liviano.',
      error: 'Payload Too Large',
    });
  });

  it('tipo de contenido no soportado → 415 claro con su nombre estándar', async () => {
    const servidor = await crearApp();
    const res = await request(servidor)
      .post('/prueba/zod')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{"email":"a@b.co"}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      statusCode: 415,
      message: 'Ese tipo de archivo no es compatible.',
      error: 'Unsupported Media Type',
    });
  });

  it('otro 4xx del lector del cuerpo → `error` corresponde a su estado real (nunca "Bad Request")', () => {
    const respuesta = { headersSent: false, status: vi.fn(), json: vi.fn() };
    respuesta.status.mockReturnValue(respuesta);
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => respuesta,
        getRequest: () => ({ method: 'POST', originalUrl: '/x' }),
      }),
    } as unknown as ArgumentsHost;

    new FiltroErroresGlobal().catch(
      Object.assign(new Error('request size did not match content length'), {
        status: 411,
        expose: true,
      }),
      host
    );

    expect(respuesta.status).toHaveBeenCalledWith(411);
    expect(respuesta.json).toHaveBeenCalledWith({
      statusCode: 411,
      message: MENSAJE_VALIDACION_GENERICO,
      error: 'Length Required',
    });
  });

  it('los mensajes del filtro pasan el filtro de mensajes técnicos de la web', () => {
    expect(PATRON_MENSAJE_TECNICO.test(MENSAJE_ERROR_INTERNO)).toBe(false);
    expect(PATRON_MENSAJE_TECNICO.test(MENSAJE_VALIDACION_GENERICO)).toBe(false);
    for (const mensaje of [
      'El archivo o los datos son demasiado grandes. Prueba con uno más liviano.',
      'Ese tipo de archivo no es compatible.',
    ]) {
      expect(PATRON_MENSAJE_TECNICO.test(mensaje)).toBe(false);
      expect(contieneJerga(mensaje)).toBe(false);
    }
  });
});

describe('API-2 · login con correo con espacios', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = undefined;
  });

  async function crearApp() {
    const authService = {
      login: vi.fn(async () => {
        throw new UnauthorizedException('Correo o contraseña incorrectos.');
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    app = moduleRef.createNestApplication();
    configurarErroresGlobales(app);
    await app.init();
    return { servidor: app.getHttpServer(), authService };
  }

  it('el correo con espacios alrededor se normaliza antes de validar (401 de credenciales, no 500)', async () => {
    const { servidor, authService } = await crearApp();
    const res = await request(servidor)
      .post('/auth/login')
      .send({ email: '  ana@guachafit.com ', password: 'clave-segura-1' });

    expect(res.status).toBe(401);
    expect(authService.login).toHaveBeenCalledWith({
      email: 'ana@guachafit.com',
      password: 'clave-segura-1',
    });
  });

  it('un correo inválido responde 400 con mensaje claro', async () => {
    const { servidor, authService } = await crearApp();
    const res = await request(servidor)
      .post('/auth/login')
      .send({ email: 'ana guachafit', password: 'clave-segura-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Revisa el campo «correo»: no tiene un formato válido.');
    expect(authService.login).not.toHaveBeenCalled();
  });
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('node:fs') as typeof import('node:fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('node:path') as typeof import('node:path');

const RAIZ_API = path.resolve(__dirname, '../../src');
const RAIZ_WEB = path.resolve(__dirname, '../../../web/src');
const DIR_SCHEMAS_SHARED = path.resolve(__dirname, '../../../../packages/shared/src/schemas');

/** Concatena todos los `.ts` del dominio de schemas, ordenados por nombre. */
function fuenteSchemasShared(): string {
  return fs
    .readdirSync(DIR_SCHEMAS_SHARED)
    .filter((nombre) => nombre.endsWith('.ts'))
    .sort()
    .map((nombre) => fs.readFileSync(path.join(DIR_SCHEMAS_SHARED, nombre), 'utf8'))
    .join('\n');
}

function archivosFuente(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return archivosFuente(ruta);
    return /\.tsx?$/.test(ruta) && !/\.(spec|test)\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

/** Quita comentarios de bloque y de línea completa para que solo cuente el código. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Frase visible: sin interpolaciones `${…}` (son código) y con al menos un espacio. */
function textoVisible(crudo: string): string | null {
  const texto = crudo.replace(/\$\{[^}]*\}/g, '');
  return texto.trim().includes(' ') ? texto : null;
}

describe('API-2 · fuente única de jerga (common/errores/jerga.ts)', () => {
  it('detecta los términos técnicos que no deben llegar al usuario', () => {
    for (const jerga of [
      'La tasa override debe ser mayor a 0',
      'Error de login',
      'Permiso RBAC denegado',
      'Regla RN-02 incumplida',
      'Ver RF-015',
      'Ver RNF-003',
      'Estado en_progreso',
      'El ID del alumno debe ser un UUID válido',
      'Formato YYYY-MM-DD',
      'Fecha en formato ISO 8601',
      'debe ser booleano',
      'valor del enum',
      'una cadena string',
      'debe ser una cadena decimal con hasta 2 decimales',
      'Solo admite archivos PDF (application/pdf).',
      'El coachCode es obligatorio',
      'Debe ser COMPLETADA',
      'El offset debe ser entero',
      'Confirma con `x`',
    ]) {
      expect(contieneJerga(jerga), jerga).toBe(true);
    }
  });

  it('no marca frases claras', () => {
    for (const claro of [
      'Ya registraste tu reporte de hoy.',
      'El monto debe estar en USD o VES.',
      'El RPE debe ser un número entre 1 y 10.',
      'GUACHAFIT no pudo guardar tu reporte.',
      'Tu teléfono ya cambió de día. Actualiza la pantalla para ver el reporte de hoy.',
      'No pudimos asociar la foto. Vuelve a subirla.',
      'Escribe el agua en litros, entre 0 y 20, con hasta 2 decimales (ej. 2.5).',
      'Tus notas pueden tener hasta 280 caracteres.',
      'Puedes subir hasta 4 fotos por día.',
      'Usa un enlace que empiece por http:// o https://.',
    ]) {
      expect(contieneJerga(claro), claro).toBe(false);
    }
  });

  it('el traductor usa la misma lista: un mensaje propio con "override" no llega al usuario', () => {
    const schema = z.object({ monto: z.string().min(3, 'La tasa override es obligatoria') });
    expect(traducirErrorValidacion(primerError(schema, { monto: '' }))).toBe(
      'Revisa el campo «monto»: debe tener al menos 3 caracteres.'
    );
  });
});

describe('API-2 · compatibilidad con la web publicada (PWA con registerType "prompt")', () => {
  /** Clasificador por texto de la web anterior al código estable (`nutricion-checkin.ts`). */
  const CLASIFICADOR_VENTANA_WEB_ANTERIOR = /18:00|23:59|ventana|día local/i;

  /**
   * LOTE API-N1/N2: el aviso de "día cambiado" se reescribió en lenguaje claro y no menciona la
   * ventana. La web anterior lo muestra como un rechazo genérico (con el mismo texto claro); la web
   * vigente lo clasifica por `code`. El aviso de horario sigue reconocible por su "18:00".
   */
  const MENSAJES_SOLO_POR_CODIGO = ['MENSAJE_CHECKIN_DIA_CAMBIADO'];

  it('todo mensaje de horario con code CHECKIN_FUERA_DE_VENTANA sigue siendo reconocido por la web anterior', () => {
    // Ronda 1 (LOTE API-N2): los textos son constantes compartidas (`MENSAJE_CHECKIN_*`); el API
    // ya no los escribe como literales junto al código.
    const patron = /code:\s*CODIGO_CHECKIN_FUERA_DE_VENTANA,\s*message:\s*([^,}\s]+)/g;
    const usados = archivosFuente(RAIZ_API).flatMap((archivo) =>
      [...fs.readFileSync(archivo, 'utf8').matchAll(patron)].map((c) => c[1])
    );

    expect(new Set(usados)).toEqual(
      new Set(['MENSAJE_CHECKIN_FUERA_DE_VENTANA', 'MENSAJE_CHECKIN_DIA_CAMBIADO'])
    );
    for (const nombre of usados.filter((n) => !MENSAJES_SOLO_POR_CODIGO.includes(n))) {
      const texto = (compartido as Record<string, unknown>)[nombre];
      expect(texto, nombre).toMatch(CLASIFICADOR_VENTANA_WEB_ANTERIOR);
      expect(texto, nombre).toContain('18:00');
    }
  });
});

describe('API-2 · códigos estables en un solo lugar (@guachafit/shared)', () => {
  it('el contrato del cable no cambia', () => {
    // Literales a propósito: fijan el valor que viaja en `code` entre API y web.
    expect(CODIGO_SESION_NO_INICIADA).toBe('SESION_NO_INICIADA');
    expect(CODIGO_SESION_VACIA).toBe('SESION_VACIA');
    expect(CODIGO_CHECKIN_FUERA_DE_VENTANA).toBe('CHECKIN_FUERA_DE_VENTANA');
    expect(CODIGO_CHECKIN_YA_REGISTRADO).toBe('CHECKIN_YA_REGISTRADO');
    // LOTE API-N2: plazo de recepción (12:00 del día siguiente).
    expect(CODIGO_CHECKIN_FUERA_DE_PLAZO).toBe('CHECKIN_FUERA_DE_PLAZO');
  });

  it('ni el API ni la web redefinen esos códigos como literales', () => {
    const literal =
      /(['"`])(SESION_NO_INICIADA|SESION_VACIA|CHECKIN_FUERA_DE_VENTANA|CHECKIN_YA_REGISTRADO|CHECKIN_FUERA_DE_PLAZO)\1/;
    const copias = [...archivosFuente(RAIZ_API), ...archivosFuente(RAIZ_WEB)].filter((archivo) =>
      literal.test(sinComentarios(fs.readFileSync(archivo, 'utf8')))
    );
    expect(copias).toEqual([]);
  });
});

describe('API-2 · barrido de jerga en mensajes visibles', () => {
  /**
   * Revisa el texto (comillas simples, dobles o invertidas) de:
   * - `new XxxException('…')` de cualquier clase (BadRequest, Conflict, InternalServerError,
   *   ServiceUnavailable, UnprocessableEntity, Http…);
   * - propiedades `message:` / `error:` / `mensaje:` / `detail:` con texto literal;
   * - constantes `MENSAJE_* = '…'`;
   * - ramas de ternarios en su propia línea (`? '…'` / `: '…'`).
   * Falla si alguno contiene jerga (lista única de `common/errores/jerga.ts`). Los mensajes de log
   * (`logger.*`) no se revisan: ahí el detalle técnico es útil.
   *
   * Limitaciones conocidas (heurística por texto, no por AST):
   * - textos armados con `+` o guardados en variables con otro nombre solo se revisan en su primer
   *   literal o no se revisan;
   * - las partes interpoladas `${…}` se ignoran (pueden aportar texto técnico en tiempo de ejecución);
   * - los mensajes que vienen de `@guachafit/shared` se revisan en su propio test (más abajo);
   * - una cadena sin espacios se trata como código (`error: 'RN-01'`) y no se revisa.
   */
  const PATRON_MENSAJE =
    /new \w*Exception\(\s*(['"`])([\s\S]*?)(?<!\\)\1|\b(?:message|error|mensaje|detail):\s*(['"`])([\s\S]*?)(?<!\\)\3|\bMENSAJE_\w+(?::\s*[\w.]+)?\s*=\s*(['"`])([\s\S]*?)(?<!\\)\5|^\s*[?:] (['"`])(.*?)(?<!\\)\7,?$/gm;

  function textosDelBarrido(fuente: string): string[] {
    return [...fuente.matchAll(PATRON_MENSAJE)].flatMap((c) => {
      const texto = textoVisible(c[2] ?? c[4] ?? c[6] ?? c[8] ?? '');
      return texto ? [texto] : [];
    });
  }

  it('ningún mensaje visible al usuario del API contiene jerga técnica', () => {
    const hallazgos: string[] = [];
    for (const archivo of archivosFuente(RAIZ_API)) {
      const fuente = sinComentarios(fs.readFileSync(archivo, 'utf8'));
      for (const texto of textosDelBarrido(fuente)) {
        if (contieneJerga(texto)) hallazgos.push(`${path.relative(RAIZ_API, archivo)}: ${texto}`);
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it('el barrido reconoce comillas dobles, constantes MENSAJE_* y excepciones de cualquier clase', () => {
    const muestra = [
      'throw new InternalServerErrorException("Falla del tenant interno");',
      "throw new ServiceUnavailableException('Sin token válido');",
      'throw new UnprocessableEntityException(`Estado en_progreso inválido`);',
      "throw new ConflictException({ message: \"Choque de override\" });",
      "export const MENSAJE_X =\n  'Revisa el UUID';",
    ].join('\n');
    expect(textosDelBarrido(muestra)).toEqual([
      'Falla del tenant interno',
      'Sin token válido',
      'Estado en_progreso inválido',
      'Choque de override',
      'Revisa el UUID',
    ]);
    expect(textosDelBarrido(muestra).every((texto) => contieneJerga(texto))).toBe(true);
  });
});

describe('API-2 · mensajes del contrato compartido (packages/shared) sin jerga', () => {
  /**
   * Los mensajes de los schemas llegan al usuario tal cual: el API los respeta si son claros y la
   * web muestra `issues[0].message` en sus formularios. Se revisan todos los literales con forma
   * de frase (empiezan en mayúscula y tienen espacios).
   *
   * Excepción documentada: la segunda frase de `MENSAJE_MINIMO_CANAL_FINANZAS`. La web ya
   * publicada compara ese mensaje por igualdad y la web actual solo muestra su primera frase.
   */
  const EXCEPCIONES = [/^Confirma con `confirmarSinCanalesFinanzas: true`/];

  it('ningún mensaje de los schemas compartidos contiene jerga técnica', () => {
    const fuente = sinComentarios(fuenteSchemasShared());
    const hallazgos: string[] = [];
    for (const c of fuente.matchAll(/(['"`])([A-ZÁÉÍÓÚÑ¿¡$](?:(?!\1)[^\n])*?)\1/g)) {
      const texto = textoVisible(c[2]);
      if (!texto || EXCEPCIONES.some((excepcion) => excepcion.test(texto))) continue;
      if (contieneJerga(texto)) hallazgos.push(texto);
    }
    expect(hallazgos).toEqual([]);
  });
});
