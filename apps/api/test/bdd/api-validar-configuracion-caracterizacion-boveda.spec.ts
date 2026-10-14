import { describe, it, expect } from 'vitest';
import { validarConfiguracionProduccion } from '../../src/common/config/validar-configuracion-produccion';

/**
 * Caracterización de las reglas de la bóveda de archivos (temas sin describe propio).
 *
 * La bóveda se evalúa en todos los entornos: en producción bloquea el arranque y fuera de
 * producción solo alimenta el resumen local. Los alias históricos `R2_*` valen igual que los
 * `STORAGE_*`.
 */

const CLAVE_VALIDA =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

function base(extra: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'development',
    ENCRYPTION_KEY: CLAVE_VALIDA,
    ...extra,
  };
}

function variablesDeBoveda(resultado: { problemas: { variable: string }[] }): string[] {
  return resultado.problemas
    .map((problema) => problema.variable)
    .filter((variable) => variable.includes('STORAGE') || variable.includes('R2'));
}

describe('caracterización de la bóveda: valores ausentes', () => {
  it('sin ninguna variable de la bóveda reporta sus cuatro piezas', () => {
    const resultado = validarConfiguracionProduccion(base());
    expect(variablesDeBoveda(resultado)).toEqual([
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
    ]);
  });

  it('nombra cada problema con el primer alias de su familia', () => {
    const resultado = validarConfiguracionProduccion(base());
    const variables = variablesDeBoveda(resultado);
    expect(variables).toContain('STORAGE_ENDPOINT');
    expect(variables).toContain('STORAGE_BUCKET');
  });
});

describe('caracterización de la bóveda: valores de ejemplo', () => {
  it('los valores locales de MinIO se señalan como ejemplo', () => {
    const resultado = validarConfiguracionProduccion(
      base({
        STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
        STORAGE_BUCKET: 'guachafit-r2-local',
        STORAGE_ACCESS_KEY: 'minioadmin',
        STORAGE_SECRET_KEY: 'minioadmin',
      })
    );
    const mensajes = resultado.problemas.map((problema) => problema.mensaje).join('\n');
    expect(mensajes).toMatch(/ejemplo/);
    expect(variablesDeBoveda(resultado)).toContain('STORAGE_BUCKET');
    expect(variablesDeBoveda(resultado)).toContain('STORAGE_ACCESS_KEY_ID');
    expect(variablesDeBoveda(resultado)).toContain('STORAGE_SECRET_ACCESS_KEY');
  });
});

describe('caracterización de la bóveda: configuración real', () => {
  it('con valores reales no reporta ningún problema de la bóveda', () => {
    const resultado = validarConfiguracionProduccion(
      base({
        STORAGE_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
        STORAGE_BUCKET: 'guachafit-produccion',
        STORAGE_ACCESS_KEY_ID: 'acceso-r2-produccion',
        STORAGE_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
      })
    );
    expect(variablesDeBoveda(resultado)).toEqual([]);
  });

  it('los alias históricos R2_* también valen como configuración real', () => {
    const resultado = validarConfiguracionProduccion(
      base({
        R2_ENDPOINT: 'https://cuenta-guachafit.r2.cloudflarestorage.com',
        R2_BUCKET_NAME: 'guachafit-produccion',
        R2_ACCESS_KEY_ID: 'acceso-r2-produccion',
        R2_SECRET_ACCESS_KEY: 'secreto-r2-produccion',
      })
    );
    expect(variablesDeBoveda(resultado)).toEqual([]);
  });
});
