import { describe, it, expect } from 'vitest';
import {
  BULL_BOARD_PASS_EJEMPLO,
  LONGITUD_MINIMA_BULL_BOARD_PASS,
  validarConfiguracionProduccion,
} from '../../src/common/config/validar-configuracion-produccion';

/**
 * Caracterización de las reglas del panel Bull-Board (tema sin describe propio).
 *
 * El panel es opcional: sin `BULL_BOARD_USER` no hay nada que validar. Con usuario configurado,
 * la contraseña es obligatoria, no puede ser la de ejemplo y debe alcanzar la longitud mínima.
 */

const CLAVE_VALIDA =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function base(extra: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    ENCRYPTION_KEY: CLAVE_VALIDA,
    JWT_SECRET: 'jwt-secreto-de-produccion-para-pruebas-1234567890',
    JWT_REFRESH_SECRET: 'jwt-refresh-de-produccion-para-pruebas-1234567890',
    STORAGE_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
    STORAGE_BUCKET: 'guachafit-produccion',
    STORAGE_ACCESS_KEY_ID: 'acceso-r2-produccion',
    STORAGE_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
    CORS_ORIGINS: 'https://app.guachafit.com',
    ...extra,
  };
}

function problemasBullBoard(entorno: Record<string, string | undefined>) {
  return validarConfiguracionProduccion(entorno).problemas.filter(
    (problema) => problema.variable === 'BULL_BOARD_PASS'
  );
}

describe('caracterización de Bull-Board: panel sin configurar', () => {
  it('sin usuario no exige contraseña', () => {
    expect(() => validarConfiguracionProduccion(base())).not.toThrow();
  });
});

describe('caracterización de Bull-Board: contraseña', () => {
  it('con usuario pero sin contraseña no arranca en producción', () => {
    expect(() => validarConfiguracionProduccion(base({ BULL_BOARD_USER: 'panel' }))).toThrow(
      /BULL_BOARD_PASS/
    );
  });

  it('la contraseña de ejemplo se rechaza nombrándola', () => {
    try {
      validarConfiguracionProduccion(
        base({ BULL_BOARD_USER: 'panel', BULL_BOARD_PASS: BULL_BOARD_PASS_EJEMPLO })
      );
      throw new Error('La validación debía lanzar y no lo hizo');
    } catch (error) {
      expect((error as Error).message).toContain(BULL_BOARD_PASS_EJEMPLO);
    }
  });

  it('una contraseña corta indica cuántos caracteres tiene y cuántos exige', () => {
    const corta = 'cortita';
    try {
      validarConfiguracionProduccion(base({ BULL_BOARD_USER: 'panel', BULL_BOARD_PASS: corta }));
      throw new Error('La validación debía lanzar y no lo hizo');
    } catch (error) {
      const mensaje = (error as Error).message;
      expect(mensaje).toContain(`${corta.length}`);
      expect(mensaje).toContain(`${LONGITUD_MINIMA_BULL_BOARD_PASS}`);
    }
  });

  it('una contraseña propia y larga arranca sin problemas del panel', () => {
    const resultado = validarConfiguracionProduccion(
      base({ BULL_BOARD_USER: 'panel', BULL_BOARD_PASS: 'una-clave-propia-y-larga' })
    );
    expect(problemasBullBoard(base({ BULL_BOARD_USER: 'panel', BULL_BOARD_PASS: 'una-clave-propia-y-larga' }))).toEqual([]);
    expect(resultado.problemas).toEqual([]);
  });
});
