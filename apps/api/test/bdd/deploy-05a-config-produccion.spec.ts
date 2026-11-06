import { describe, it, expect, afterEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  BULL_BOARD_PASS_EJEMPLO,
  ENCRYPTION_KEY_DESARROLLO,
  analizarClaveCifrado,
  debeExponerSwagger,
  origenesCors,
  resumenProblemasConfiguracion,
  validarConfiguracionProduccion,
} from '../../src/common/config/validar-configuracion-produccion';
import {
  JWT_REFRESH_SECRET_DESARROLLO,
  JWT_SECRET_DESARROLLO,
} from '../../src/common/config/secretos-jwt';
import { CryptoService } from '../../src/common/services/crypto.service';

// Los tests anti-deriva leen los .env.example reales del repositorio.
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

/**
 * Configuración de arranque del API.
 *
 * El API se niega a arrancar con configuración ausente, mal formada o de ejemplo: en producción
 * el error agrupa TODOS los problemas (secretos JWT incluidos) para corregirlos en una sola
 * pasada; fuera de producción se registra un único resumen y el arranque continúa, salvo una
 * clave de cifrado mal formada, que nunca se acepta. La clave de cifrado sigue las mismas reglas
 * en la validación de arranque y en CryptoService.
 */

/** 64 caracteres hexadecimales = clave de 32 bytes para AES-256-GCM. */
const CLAVE_CIFRADO_VALIDA =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
/** Otra clave igual de válida, para probar que la que se usa es la configurada y no otra. */
const CLAVE_CIFRADO_ALTERNATIVA =
  'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100';
/** Más larga de 64: sus primeros 64 caracteres son hexadecimales. */
const CLAVE_LARGA = CLAVE_CIFRADO_VALIDA + 'ab'.repeat(8);

const JWT_VALIDO = 'jwt-secreto-de-produccion-para-pruebas-1234567890';
const JWT_REFRESH_VALIDO = 'jwt-refresh-de-produccion-para-pruebas-1234567890';

function entornoProduccionValido(extra: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
    JWT_SECRET: JWT_VALIDO,
    JWT_REFRESH_SECRET: JWT_REFRESH_VALIDO,
    STORAGE_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
    STORAGE_BUCKET: 'guachafit-produccion',
    STORAGE_ACCESS_KEY_ID: 'acceso-r2-produccion',
    STORAGE_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
    CORS_ORIGINS: 'https://app.guachafit.com',
    ...extra,
  };
}

function capturarError(entorno: Record<string, string | undefined>): Error {
  try {
    validarConfiguracionProduccion(entorno);
  } catch (error) {
    return error as Error;
  }
  throw new Error('La validación debía lanzar un error y no lo hizo');
}

// ============================================================================
// Agrupación de problemas en un único error de arranque
// ============================================================================
describe('arranque en producción: un único error con todos los problemas', () => {
  it('con los valores de ejemplo de .env.example lista cada problema en su línea', () => {
    const error = capturarError({
      NODE_ENV: 'production',
      ENCRYPTION_KEY: ENCRYPTION_KEY_DESARROLLO,
      JWT_SECRET: JWT_VALIDO,
      JWT_REFRESH_SECRET: JWT_REFRESH_VALIDO,
      STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
      STORAGE_ACCESS_KEY: 'minioadmin',
      STORAGE_SECRET_KEY: 'minioadmin',
      STORAGE_BUCKET: 'guachafit-r2-local',
      BULL_BOARD_USER: 'panel',
      BULL_BOARD_PASS: BULL_BOARD_PASS_EJEMPLO,
    });

    const lineas = error.message.split('\n').filter((linea) => linea.startsWith('- '));
    expect(lineas).toHaveLength(6);
    expect(lineas.some((linea) => linea.includes('ENCRYPTION_KEY'))).toBe(true);
    expect(lineas.some((linea) => linea.includes('STORAGE_BUCKET'))).toBe(true);
    expect(lineas.some((linea) => linea.includes('STORAGE_ACCESS_KEY'))).toBe(true);
    expect(lineas.some((linea) => linea.includes('STORAGE_SECRET_KEY'))).toBe(true);
    expect(lineas.some((linea) => linea.includes('CORS_ORIGINS'))).toBe(true);
    expect(lineas.some((linea) => linea.includes('BULL_BOARD_PASS'))).toBe(true);
  });

  it('con la configuración vacía recolecta todos los problemas (JWT incluidos) en una sola pasada', () => {
    const error = capturarError({ NODE_ENV: 'production' });

    for (const variable of [
      'ENCRYPTION_KEY',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
      'CORS_ORIGINS',
    ]) {
      expect(error.message).toContain(variable);
    }
    expect(error.message).not.toContain('BULL_BOARD');
  });

  it('con configuración real y completa no lanza ni devuelve problemas', () => {
    expect(() => validarConfiguracionProduccion(entornoProduccionValido())).not.toThrow();
    expect(validarConfiguracionProduccion(entornoProduccionValido())).toEqual({
      problemas: [],
      advertencias: [],
    });
  });

  it('acepta los alias históricos R2_* de la bóveda', () => {
    expect(() =>
      validarConfiguracionProduccion({
        NODE_ENV: 'production',
        ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
        JWT_SECRET: JWT_VALIDO,
        JWT_REFRESH_SECRET: JWT_REFRESH_VALIDO,
        R2_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
        R2_BUCKET_NAME: 'guachafit-produccion',
        R2_ACCESS_KEY_ID: 'acceso-r2-produccion',
        R2_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
        CORS_ORIGINS: 'https://app.guachafit.com',
      })
    ).not.toThrow();
  });
});

// ============================================================================
// ENCRYPTION_KEY: reglas de arranque
// ============================================================================
describe('ENCRYPTION_KEY: reglas de arranque', () => {
  it('en producción sin clave (ausente o solo espacios) no arranca y explica ambas situaciones', () => {
    for (const sinClave of [undefined, '', '   ']) {
      const error = capturarError(entornoProduccionValido({ ENCRYPTION_KEY: sinClave }));
      expect(error.message).toContain('ENCRYPTION_KEY');
      expect(error.message).toContain('openssl rand -hex 32');
      expect(error.message).toMatch(/primer despliegue/);
      expect(error.message).toMatch(/ya existen fichas cifradas/);
      expect(error.message).toMatch(/ilegibles/);
    }
  });

  it.each([
    ['63 caracteres', CLAVE_CIFRADO_VALIDA.slice(0, 63)],
    ['caracteres no hexadecimales', 'z'.repeat(64)],
    ['más larga con primeros 64 no hexadecimales', 'z'.repeat(70)],
    ['demasiado corta', 'abcdef'],
  ])('una clave mal formada (%s) lanza en producción, desarrollo y test', (_caso, clave) => {
    for (const nodeEnv of ['production', 'development', 'test']) {
      expect(() =>
        validarConfiguracionProduccion(
          entornoProduccionValido({ NODE_ENV: nodeEnv, ENCRYPTION_KEY: clave })
        )
      ).toThrow(/ENCRYPTION_KEY/);
    }
  });

  it('una clave más larga con primeros 64 hexadecimales se acorta con advertencia, también en producción', () => {
    for (const nodeEnv of ['production', 'development']) {
      const resultado = validarConfiguracionProduccion(
        entornoProduccionValido({ NODE_ENV: nodeEnv, ENCRYPTION_KEY: CLAVE_LARGA })
      );
      expect(resultado.problemas).toEqual([]);
      expect(resultado.advertencias).toHaveLength(1);
      expect(resultado.advertencias[0]).toMatch(/primeros 64/);
      expect(resultado.advertencias[0]).toMatch(/64 caracteres/);
    }
  });

  it('en producción rechaza la clave de ejemplo sin distinguir mayúsculas', () => {
    for (const ejemplo of [ENCRYPTION_KEY_DESARROLLO, ENCRYPTION_KEY_DESARROLLO.toUpperCase()]) {
      const error = capturarError(entornoProduccionValido({ ENCRYPTION_KEY: ejemplo }));
      expect(error.message).toContain('ENCRYPTION_KEY');
      expect(error.message).toMatch(/ejemplo/);
    }
  });

  it('en producción rechaza claves formadas por un único carácter repetido', () => {
    for (const debil of ['0'.repeat(64), 'a'.repeat(64), 'F'.repeat(64)]) {
      const error = capturarError(entornoProduccionValido({ ENCRYPTION_KEY: debil }));
      expect(error.message).toMatch(/repetido/);
    }
  });

  it('la guía del mensaje distingue el primer despliegue de uno con fichas ya cifradas', () => {
    const error = capturarError(
      entornoProduccionValido({ ENCRYPTION_KEY: ENCRYPTION_KEY_DESARROLLO })
    );
    expect(error.message).toMatch(/primer despliegue/);
    expect(error.message).toMatch(/ya existen fichas cifradas/);
    expect(error.message).toContain('openssl rand -hex 32');
  });
});

// ============================================================================
// analizarClaveCifrado: clasificación compartida con CryptoService
// ============================================================================
describe('analizarClaveCifrado', () => {
  it('ausente: es un problema para producción y no define clave efectiva', () => {
    const analisis = analizarClaveCifrado(undefined);
    expect(analisis.claveEfectiva).toBeUndefined();
    expect(analisis.problemaFatal).toBeUndefined();
    expect(analisis.problemaProduccion).toBeDefined();
  });

  it('64 hexadecimales exactos: clave efectiva sin ningún problema', () => {
    const analisis = analizarClaveCifrado(CLAVE_CIFRADO_VALIDA);
    expect(analisis.claveEfectiva).toBe(CLAVE_CIFRADO_VALIDA);
    expect(analisis.problemaFatal).toBeUndefined();
    expect(analisis.problemaProduccion).toBeUndefined();
    expect(analisis.advertencia).toBeUndefined();
  });

  it('más larga con primeros 64 hexadecimales: usa los primeros 64 y advierte', () => {
    const analisis = analizarClaveCifrado(CLAVE_LARGA);
    expect(analisis.claveEfectiva).toBe(CLAVE_CIFRADO_VALIDA);
    expect(analisis.advertencia).toBeDefined();
    expect(analisis.problemaFatal).toBeUndefined();
  });

  it('el resto de la clave larga no importa si los primeros 64 son hexadecimales', () => {
    const analisis = analizarClaveCifrado(`${CLAVE_CIFRADO_VALIDA}---lo-que-sea`);
    expect(analisis.claveEfectiva).toBe(CLAVE_CIFRADO_VALIDA);
  });

  it('no hexadecimal o más corta: problema fatal (nunca se usa la clave de desarrollo)', () => {
    for (const mala of ['z'.repeat(64), 'z'.repeat(70), CLAVE_CIFRADO_VALIDA.slice(0, 63), 'abcdef']) {
      const analisis = analizarClaveCifrado(mala);
      expect(analisis.problemaFatal).toBeDefined();
      expect(analisis.claveEfectiva).toBeUndefined();
    }
  });

  it('de ejemplo (mayúsculas incluidas): problema para producción con clave efectiva', () => {
    for (const ejemplo of [ENCRYPTION_KEY_DESARROLLO, ENCRYPTION_KEY_DESARROLLO.toUpperCase()]) {
      const analisis = analizarClaveCifrado(ejemplo);
      expect(analisis.problemaProduccion).toBeDefined();
      expect(analisis.claveEfectiva).toBe(ejemplo);
    }
  });

  it('de un solo carácter repetido: problema para producción, no fatal', () => {
    const analisis = analizarClaveCifrado('0'.repeat(64));
    expect(analisis.problemaProduccion).toBeDefined();
    expect(analisis.problemaFatal).toBeUndefined();
  });

  it('la clave de ejemplo con cola larga se evalúa por su clave efectiva (primeros 64)', () => {
    const analisis = analizarClaveCifrado(ENCRYPTION_KEY_DESARROLLO + 'ab');
    expect(analisis.problemaProduccion).toBeDefined();
    expect(analisis.advertencia).toBeDefined();
    expect(analisis.claveEfectiva).toBe(ENCRYPTION_KEY_DESARROLLO);
  });
});

// ============================================================================
// CryptoService: qué clave se usa realmente
// ============================================================================
describe('CryptoService: qué clave se usa realmente', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function enDesarrollo() {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ENCRYPTION_KEY', '');
  }

  it('sin clave fuera de producción se usa exactamente la clave de desarrollo', () => {
    enDesarrollo();
    const sinClave = new CryptoService();
    const conClaveExplicita = new CryptoService(ENCRYPTION_KEY_DESARROLLO);

    const cifradoSinClave = sinClave.encryptHealthRecord('ficha de desarrollo');
    const cifradoExplicito = conClaveExplicita.encryptHealthRecord('ficha de desarrollo');

    expect(conClaveExplicita.decryptHealthRecord(cifradoSinClave)).toBe('ficha de desarrollo');
    expect(sinClave.decryptHealthRecord(cifradoExplicito)).toBe('ficha de desarrollo');
  });

  it('se usa la clave explícita: otra clave distinta no puede descifrar', () => {
    enDesarrollo();
    const servicio = new CryptoService(CLAVE_CIFRADO_VALIDA);
    const otroServicio = new CryptoService(CLAVE_CIFRADO_ALTERNATIVA);

    const cifrado = servicio.encryptHealthRecord('ficha confidencial');
    expect(servicio.decryptHealthRecord(cifrado)).toBe('ficha confidencial');
    expect(() => otroServicio.decryptHealthRecord(cifrado)).toThrow();
  });

  it('nunca cae en la clave de desarrollo cuando se proporcionó una clave válida', () => {
    enDesarrollo();
    const conClave = new CryptoService(CLAVE_CIFRADO_VALIDA);
    const sinClave = new CryptoService();

    const cifrado = conClave.encryptHealthRecord('ficha confidencial');
    expect(() => sinClave.decryptHealthRecord(cifrado)).toThrow();
  });

  it('una clave más larga usa sus primeros 64 caracteres (compatibilidad) y avisa', () => {
    enDesarrollo();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const conClaveLarga = new CryptoService(CLAVE_LARGA);
    const conPrimeros64 = new CryptoService(CLAVE_CIFRADO_VALIDA);

    const cifrado = conClaveLarga.encryptHealthRecord('ficha con clave larga');
    expect(conPrimeros64.decryptHealthRecord(cifrado)).toBe('ficha con clave larga');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/primeros 64/));
  });

  it('en producción una clave larga arranca con aviso (no es un fallo de arranque)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const conClaveLarga = new CryptoService(CLAVE_LARGA);
    const conPrimeros64 = new CryptoService(CLAVE_CIFRADO_VALIDA);

    const cifrado = conClaveLarga.encryptHealthRecord('ficha con clave larga');
    expect(conPrimeros64.decryptHealthRecord(cifrado)).toBe('ficha con clave larga');
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ['sin clave', undefined],
    ['de 63 caracteres', CLAVE_CIFRADO_VALIDA.slice(0, 63)],
    ['no hexadecimal', 'z'.repeat(64)],
    ['de ejemplo', ENCRYPTION_KEY_DESARROLLO],
    ['de ejemplo en mayúsculas', ENCRYPTION_KEY_DESARROLLO.toUpperCase()],
    ['de un solo carácter repetido', '0'.repeat(64)],
  ])('en producción rechaza una clave %s', (_caso, clave) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => new CryptoService(clave)).toThrow(/ENCRYPTION_KEY/);
  });

  it.each(['development', 'test'])(
    'en %s una clave mal formada lanza aunque no sea producción',
    (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('ENCRYPTION_KEY', '');
      expect(() => new CryptoService(CLAVE_CIFRADO_VALIDA.slice(0, 63))).toThrow(/ENCRYPTION_KEY/);
      expect(() => new CryptoService('no-es-hexadecimal')).toThrow(/ENCRYPTION_KEY/);
    }
  );

  it('en test sigue aceptando la clave de ejemplo (como el resto de la suite)', () => {
    enDesarrollo();
    const servicio = new CryptoService(ENCRYPTION_KEY_DESARROLLO);
    const cifrado = servicio.encryptHealthRecord('ficha de test');
    expect(servicio.decryptHealthRecord(cifrado)).toBe('ficha de test');
  });
});

// ============================================================================
// CORS_ORIGINS
// ============================================================================
describe('CORS_ORIGINS', () => {
  it('es obligatoria en producción (falta o solo espacios)', () => {
    for (const sinCors of [undefined, '', '   ']) {
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido({ CORS_ORIGINS: sinCors }))
      ).toThrow(/CORS_ORIGINS/);
    }
  });

  it('rechaza una lista sin ningún origen real ("," o " , ")', () => {
    for (const vacia of [',', ' , ', ',,,']) {
      const error = capturarError(entornoProduccionValido({ CORS_ORIGINS: vacia }));
      expect(error.message).toMatch(/CORS_ORIGINS: no contiene ningún origen válido/);
    }
  });

  it('rechaza el comodín "*" porque el API envía credenciales', () => {
    for (const comodin of ['*', 'https://app.guachafit.com,*']) {
      const error = capturarError(entornoProduccionValido({ CORS_ORIGINS: comodin }));
      expect(error.message).toMatch(/comodín/);
      expect(error.message).toMatch(/credenciales/);
    }
  });

  it('rechaza orígenes que no empiezan por http:// o https://', () => {
    for (const invalido of ['app.guachafit.com', 'ftp://app.guachafit.com']) {
      const error = capturarError(entornoProduccionValido({ CORS_ORIGINS: invalido }));
      expect(error.message).toMatch(/http:\/\/ o https:\/\//);
    }
  });

  it('acepta varios orígenes http(s) separados por coma, recortando espacios', () => {
    expect(() =>
      validarConfiguracionProduccion(
        entornoProduccionValido({
          CORS_ORIGINS: ' https://app.guachafit.com , http://localhost:5173 , ',
        })
      )
    ).not.toThrow();
  });

  it('fuera de producción una lista inválida avisa pero no bloquea el arranque', () => {
    const resultado = validarConfiguracionProduccion({
      NODE_ENV: 'development',
      CORS_ORIGINS: ',',
    });
    expect(resultado.problemas.some((problema) => problema.variable === 'CORS_ORIGINS')).toBe(true);
  });
});

// ============================================================================
// Secretos JWT dentro del error agregado
// ============================================================================
describe('secretos JWT en el error agregado', () => {
  it('reporta JWT_SECRET y JWT_REFRESH_SECRET ausentes en el mismo error que el resto', () => {
    const error = capturarError({
      NODE_ENV: 'production',
      ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
      STORAGE_ENDPOINT: 'https://cuenta.r2.cloudflarestorage.com',
      STORAGE_BUCKET: 'bucket-real',
      STORAGE_ACCESS_KEY_ID: 'acceso-real',
      STORAGE_SECRET_ACCESS_KEY: 'secreto-real',
      // sin CORS_ORIGINS ni secretos JWT
    });

    expect(error.message).toContain('JWT_SECRET');
    expect(error.message).toContain('JWT_REFRESH_SECRET');
    expect(error.message).toContain('CORS_ORIGINS');
    const lineas = error.message.split('\n').filter((linea) => linea.startsWith('- '));
    expect(lineas.length).toBeGreaterThanOrEqual(3);
  });

  it('rechaza los valores de ejemplo de JWT en el error agregado', () => {
    const error = capturarError(
      entornoProduccionValido({
        JWT_SECRET: JWT_SECRET_DESARROLLO,
        JWT_REFRESH_SECRET: JWT_REFRESH_SECRET_DESARROLLO,
      })
    );
    expect(error.message).toContain('JWT_SECRET');
    expect(error.message).toContain('JWT_REFRESH_SECRET');
  });

  it('si solo falta JWT_SECRET, no acusa a JWT_REFRESH_SECRET', () => {
    const error = capturarError(entornoProduccionValido({ JWT_SECRET: undefined }));
    expect(error.message).toContain('JWT_SECRET');
    expect(error.message).not.toContain('JWT_REFRESH_SECRET');
  });

  it('fuera de producción los secretos JWT no se exigen', () => {
    const resultado = validarConfiguracionProduccion({ NODE_ENV: 'development' });
    expect(resultado.problemas.some((problema) => problema.variable.startsWith('JWT'))).toBe(false);
  });
});

// ============================================================================
// Resumen local (sin un aviso por variable)
// ============================================================================
describe('resumen local', () => {
  it('con los valores de .env.example resume en UNA línea las variables que fallarían en producción', () => {
    const resultado = validarConfiguracionProduccion({
      NODE_ENV: 'development',
      ENCRYPTION_KEY: ENCRYPTION_KEY_DESARROLLO,
      STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
      STORAGE_ACCESS_KEY: 'minioadmin',
      STORAGE_SECRET_KEY: 'minioadmin',
      STORAGE_BUCKET: 'guachafit-r2-local',
      BULL_BOARD_USER: 'panel',
      BULL_BOARD_PASS: BULL_BOARD_PASS_EJEMPLO,
    });

    expect(resultado.problemas).toHaveLength(5);
    const resumen = resumenProblemasConfiguracion(resultado.problemas);
    expect(resumen.split('\n')).toHaveLength(1);
    for (const variable of [
      'ENCRYPTION_KEY',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
      'BULL_BOARD_PASS',
    ]) {
      expect(resumen).toContain(variable);
    }
  });

  it('no repite una variable aunque acumule varios problemas', () => {
    const resumen = resumenProblemasConfiguracion([
      { variable: 'CORS_ORIGINS', mensaje: 'CORS_ORIGINS: uno' },
      { variable: 'CORS_ORIGINS', mensaje: 'CORS_ORIGINS: dos' },
    ]);
    expect(resumen.split('\n')).toHaveLength(1);
    expect(resumen.match(/CORS_ORIGINS/g)).toHaveLength(1);
  });

  it('en desarrollo/test nunca lanza con la configuración vacía', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      expect(() => validarConfiguracionProduccion({ NODE_ENV: nodeEnv })).not.toThrow();
    }
  });
});

// ============================================================================
// Helpers de CORS y Swagger usados al arrancar
// ============================================================================
describe('origenesCors', () => {
  it('en producción usa solo CORS_ORIGINS, separado por comas y sin espacios', () => {
    expect(
      origenesCors({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.guachafit.com' })
    ).toEqual(['https://app.guachafit.com']);
    expect(
      origenesCors({
        NODE_ENV: 'production',
        CORS_ORIGINS: ' https://app.guachafit.com , https://admin.guachafit.com ,, ',
      })
    ).toEqual(['https://app.guachafit.com', 'https://admin.guachafit.com']);
  });

  it('en producción sin CORS_ORIGINS no inventa un origen local', () => {
    expect(origenesCors({ NODE_ENV: 'production' })).toEqual([]);
  });

  it('en desarrollo/test mantiene el fallback local de siempre', () => {
    expect(origenesCors({ NODE_ENV: 'development' })).toEqual(['http://localhost:3000']);
    expect(origenesCors({ NODE_ENV: 'test' })).toEqual(['http://localhost:3000']);
    expect(origenesCors({ NODE_ENV: 'development', CORS_ORIGINS: 'http://localhost:5173' })).toEqual([
      'http://localhost:5173',
    ]);
  });
});

describe('debeExponerSwagger', () => {
  it('fuera de producción se expone', () => {
    expect(debeExponerSwagger({ NODE_ENV: 'development' })).toBe(true);
    expect(debeExponerSwagger({ NODE_ENV: 'test' })).toBe(true);
    expect(debeExponerSwagger({})).toBe(true);
  });

  it('en producción queda oculto salvo SWAGGER_HABILITADO="true"', () => {
    expect(debeExponerSwagger({ NODE_ENV: 'production' })).toBe(false);
    expect(debeExponerSwagger({ NODE_ENV: 'production', SWAGGER_HABILITADO: 'false' })).toBe(false);
    expect(debeExponerSwagger({ NODE_ENV: 'production', SWAGGER_HABILITADO: 'true' })).toBe(true);
  });
});

// ============================================================================
// Guarda anti-deriva: los .env.example reales deben fallar en producción
// ============================================================================
describe('ejemplos de entorno reales', () => {
  const RUTA_EJEMPLO_RAIZ = path.resolve(__dirname, '../../../../.env.example');
  const RUTA_EJEMPLO_API = path.resolve(__dirname, '../../.env.example');

  /** Parser mínimo de `KEY=value`: ignora comentarios y líneas vacías y quita las comillas. */
  function leerEjemploEnv(ruta: string): Record<string, string | undefined> {
    const entorno: Record<string, string | undefined> = {};
    for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const separador = limpia.indexOf('=');
      if (separador < 0) continue;
      const clave = limpia.slice(0, separador).trim();
      let valor = limpia.slice(separador + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      entorno[clave] = valor;
    }
    return entorno;
  }

  function lineasDeProblemas(entorno: Record<string, string | undefined>): string[] {
    const error = capturarError({ ...entorno, NODE_ENV: 'production' });
    return error.message.split('\n').filter((linea) => linea.startsWith('- '));
  }

  it('el .env.example raíz falla en producción por JWT, clave de cifrado, bóveda y Bull-Board', () => {
    const lineas = lineasDeProblemas(leerEjemploEnv(RUTA_EJEMPLO_RAIZ));

    for (const variable of [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY',
      'BULL_BOARD_PASS',
    ]) {
      expect(lineas.some((linea) => linea.includes(variable)), variable).toBe(true);
    }
  });

  it('el .env.example del API falla en producción al menos por los JWT y la clave de cifrado', () => {
    const lineas = lineasDeProblemas(leerEjemploEnv(RUTA_EJEMPLO_API));

    for (const variable of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
      expect(lineas.some((linea) => linea.includes(variable)), variable).toBe(true);
    }
  });
});
