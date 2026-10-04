import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BULL_BOARD_PASS_EJEMPLO,
  ENCRYPTION_KEY_DESARROLLO,
  debeExponerSwagger,
  esClaveCifradoValida,
  origenesCors,
  validarConfiguracionProduccion,
} from '../../src/common/config/validar-configuracion-produccion';
import { CryptoService } from '../../src/common/services/crypto.service';

/**
 * deploy-05a — Configuración de producción del API.
 *
 * El API debe negarse a arrancar en producción cuando falta, está mal formada o sigue siendo un
 * valor de ejemplo la configuración crítica (clave de cifrado, bóveda de archivos, CORS,
 * Bull-Board). Desarrollo y test no deben verse afectados. Se prueban las funciones puras (sin
 * arrancar el servidor) y la validación de la clave del CryptoService.
 */

/** 64 caracteres hexadecimales = clave de 32 bytes para AES-256-GCM. */
const CLAVE_CIFRADO_VALIDA =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function entornoProduccionValido(extra: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
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
  throw new Error('La validación debía lanzar un error en producción y no lo hizo');
}

describe('deploy-05a: validación centralizada de configuración de producción', () => {
  it('con los valores de ejemplo de .env.example lanza UN error que lista cada problema en su línea', () => {
    const error = capturarError({
      NODE_ENV: 'production',
      ENCRYPTION_KEY: ENCRYPTION_KEY_DESARROLLO,
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

  it('recolecta TODOS los problemas en una sola pasada en vez de detenerse en el primero', () => {
    const error = capturarError({ NODE_ENV: 'production' });

    for (const variable of [
      'ENCRYPTION_KEY',
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

  it('en producción con configuración real y completa no lanza nada', () => {
    expect(() => validarConfiguracionProduccion(entornoProduccionValido())).not.toThrow();
    expect(validarConfiguracionProduccion(entornoProduccionValido())).toEqual([]);
  });

  it('acepta los alias históricos R2_* de la bóveda', () => {
    expect(() =>
      validarConfiguracionProduccion({
        NODE_ENV: 'production',
        ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
        R2_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
        R2_BUCKET_NAME: 'guachafit-produccion',
        R2_ACCESS_KEY_ID: 'acceso-r2-produccion',
        R2_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
        CORS_ORIGINS: 'https://app.guachafit.com',
      })
    ).not.toThrow();
  });

  describe('ENCRYPTION_KEY', () => {
    it.each([
      ['63 caracteres', CLAVE_CIFRADO_VALIDA.slice(0, 63)],
      ['caracteres que no son hexadecimales', 'z'.repeat(64)],
      ['solo espacios', '   '],
    ])('rechaza una clave con %s', (_caso, clave) => {
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido({ ENCRYPTION_KEY: clave }))
      ).toThrow(/ENCRYPTION_KEY/);
    });

    it('rechaza el valor de ejemplo y avisa de que cambiarlo deja ilegibles las fichas cifradas', () => {
      const error = capturarError(
        entornoProduccionValido({ ENCRYPTION_KEY: ENCRYPTION_KEY_DESARROLLO })
      );
      expect(error.message).toContain('ENCRYPTION_KEY');
      expect(error.message).toContain('openssl rand -hex 32');
      expect(error.message).toMatch(/ilegibles/);
    });

    it('el mensaje de una clave mal formada explica el formato y cómo generarla', () => {
      const error = capturarError(
        entornoProduccionValido({ ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA.slice(0, 63) })
      );
      expect(error.message).toContain('64 caracteres hexadecimales');
      expect(error.message).toContain('openssl rand -hex 32');
    });
  });

  describe('bóveda de archivos (STORAGE_*/R2_*)', () => {
    it('exige endpoint, bucket, clave de acceso y secreto cuando faltan', () => {
      const error = capturarError({
        NODE_ENV: 'production',
        ENCRYPTION_KEY: CLAVE_CIFRADO_VALIDA,
        CORS_ORIGINS: 'https://app.guachafit.com',
      });
      expect(error.message).toContain('STORAGE_ENDPOINT');
      expect(error.message).toContain('STORAGE_BUCKET');
      expect(error.message).toContain('STORAGE_ACCESS_KEY_ID');
      expect(error.message).toContain('STORAGE_SECRET_ACCESS_KEY');
    });

    it('rechaza las credenciales de ejemplo minioadmin', () => {
      const errorAcceso = capturarError(
        entornoProduccionValido({ STORAGE_ACCESS_KEY_ID: 'minioadmin' })
      );
      expect(errorAcceso.message).toContain('minioadmin');

      const errorSecreto = capturarError(
        entornoProduccionValido({ STORAGE_SECRET_ACCESS_KEY: 'minioadmin' })
      );
      expect(errorSecreto.message).toContain('minioadmin');
    });

    it('rechaza el bucket de ejemplo guachafit-r2-local', () => {
      const error = capturarError(
        entornoProduccionValido({ STORAGE_BUCKET: 'guachafit-r2-local' })
      );
      expect(error.message).toContain('guachafit-r2-local');
    });
  });

  describe('CORS_ORIGINS', () => {
    it('es obligatoria en producción (tampoco acepta solo espacios)', () => {
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido({ CORS_ORIGINS: undefined }))
      ).toThrow(/CORS_ORIGINS/);
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido({ CORS_ORIGINS: '   ' }))
      ).toThrow(/CORS_ORIGINS/);
    });
  });

  describe('BULL_BOARD_*', () => {
    it('sin BULL_BOARD_USER no exige contraseña (la ruta queda en 404)', () => {
      expect(() => validarConfiguracionProduccion(entornoProduccionValido())).not.toThrow();
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido({ BULL_BOARD_PASS: undefined }))
      ).not.toThrow();
      expect(() =>
        validarConfiguracionProduccion(
          entornoProduccionValido({ BULL_BOARD_USER: '', BULL_BOARD_PASS: '' })
        )
      ).not.toThrow();
    });

    it('con BULL_BOARD_USER exige contraseña presente, distinta del ejemplo y de al menos 12 caracteres', () => {
      const conUsuario = { BULL_BOARD_USER: 'panel' };
      expect(() =>
        validarConfiguracionProduccion(entornoProduccionValido(conUsuario))
      ).toThrow(/BULL_BOARD_PASS/);
      expect(() =>
        validarConfiguracionProduccion(
          entornoProduccionValido({ ...conUsuario, BULL_BOARD_PASS: BULL_BOARD_PASS_EJEMPLO })
        )
      ).toThrow(/BULL_BOARD_PASS/);
      expect(() =>
        validarConfiguracionProduccion(
          entornoProduccionValido({ ...conUsuario, BULL_BOARD_PASS: 'corta-12345' })
        )
      ).toThrow(/12/);
    });

    it('con usuario y contraseña propia de 12+ caracteres no lanza', () => {
      expect(() =>
        validarConfiguracionProduccion(
          entornoProduccionValido({ BULL_BOARD_USER: 'panel', BULL_BOARD_PASS: 'clave-larga-y-propia' })
        )
      ).not.toThrow();
    });
  });

  describe('desarrollo y test', () => {
    it.each(['development', 'test', undefined])(
      'en %s nunca lanza, aunque la configuración esté vacía',
      (nodeEnv) => {
        const problemas = validarConfiguracionProduccion({ NODE_ENV: nodeEnv });
        expect(Array.isArray(problemas)).toBe(true);
        expect(problemas.length).toBeGreaterThan(0);
      }
    );

    it('en desarrollo con valores de ejemplo solo devuelve advertencias (no lanza)', () => {
      const problemas = validarConfiguracionProduccion({
        NODE_ENV: 'development',
        ENCRYPTION_KEY: 'no-es-hex',
        STORAGE_ACCESS_KEY: 'minioadmin',
        STORAGE_BUCKET: 'guachafit-r2-local',
        CORS_ORIGINS: '   ',
        BULL_BOARD_USER: 'panel',
        BULL_BOARD_PASS: BULL_BOARD_PASS_EJEMPLO,
      });
      expect(problemas.length).toBeGreaterThan(0);
      for (const problema of problemas) {
        expect(typeof problema).toBe('string');
      }
    });
  });

  describe('esClaveCifradoValida', () => {
    it('acepta exactamente 64 caracteres hexadecimales (en cualquier caso)', () => {
      expect(esClaveCifradoValida(CLAVE_CIFRADO_VALIDA)).toBe(true);
      expect(esClaveCifradoValida(CLAVE_CIFRADO_VALIDA.toUpperCase())).toBe(true);
    });

    it('rechaza claves ausentes, de otra longitud o con caracteres que no son hexadecimales', () => {
      for (const clave of [
        undefined,
        '',
        '   ',
        CLAVE_CIFRADO_VALIDA.slice(0, 63),
        CLAVE_CIFRADO_VALIDA + 'ab',
        'g'.repeat(64),
      ]) {
        expect(esClaveCifradoValida(clave)).toBe(false);
      }
    });
  });

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
    it('fuera de producción se expone (como hasta ahora)', () => {
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
});

describe('deploy-05a: CryptoService valida la clave de cifrado', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('en producción acepta una clave de 64 hexadecimales y el formato de cifrado no cambia', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    const servicio = new CryptoService(CLAVE_CIFRADO_VALIDA);

    const cifrado = servicio.encryptHealthRecord('Ficha de salud privada');
    expect(cifrado.split(':')).toHaveLength(3);
    expect(servicio.decryptHealthRecord(cifrado)).toBe('Ficha de salud privada');
  });

  it.each([
    ['63 caracteres', CLAVE_CIFRADO_VALIDA.slice(0, 63)],
    ['caracteres que no son hexadecimales', 'z'.repeat(64)],
  ])('en producción rechaza una clave con %s', (_caso, clave) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => new CryptoService(clave)).toThrow(/ENCRYPTION_KEY/);
  });

  it('en producción sin clave (ni parámetro ni entorno) no arranca', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => new CryptoService()).toThrow(/ENCRYPTION_KEY/);
  });

  it.each(['development', 'test'])(
    'en %s sin clave mantiene el respaldo de desarrollo',
    (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('ENCRYPTION_KEY', '');
      const servicio = new CryptoService();

      const cifrado = servicio.encryptHealthRecord('Ficha de desarrollo');
      expect(servicio.decryptHealthRecord(cifrado)).toBe('Ficha de desarrollo');
    }
  );

  it('en desarrollo una clave mal formada no rompe: se usa el respaldo de desarrollo', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENCRYPTION_KEY', 'abc');
    const servicio = new CryptoService();

    const cifrado = servicio.encryptHealthRecord('Ficha de desarrollo');
    expect(servicio.decryptHealthRecord(cifrado)).toBe('Ficha de desarrollo');
  });
});
