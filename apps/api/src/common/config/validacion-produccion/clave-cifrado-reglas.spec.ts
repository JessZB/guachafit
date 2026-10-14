import { describe, it, expect } from 'vitest';
import { analizarClaveCifrado, mensajeClaveCifrado } from './clave-cifrado-reglas';
import { ENCRYPTION_KEY_DESARROLLO } from './constantes-configuracion';

/** Reglas puras de la clave de cifrado, junto a la pieza que las implementa. */

const CLAVE_VALIDA =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('mensajeClaveCifrado: un solo constructor de mensajes', () => {
  it('cada motivo nombra ENCRYPTION_KEY y trae la guía del primer despliegue', () => {
    for (const motivo of ['ausente', 'malformada', 'ejemplo', 'debil'] as const) {
      const mensaje = mensajeClaveCifrado(motivo);
      expect(mensaje).toContain('ENCRYPTION_KEY');
      expect(mensaje).toContain('openssl rand -hex 32');
    }
  });

  it('cada motivo describe su caso con palabras propias', () => {
    expect(mensajeClaveCifrado('ausente')).toMatch(/falta la clave/);
    expect(mensajeClaveCifrado('malformada')).toMatch(/hexadecimal/);
    expect(mensajeClaveCifrado('ejemplo')).toMatch(/ejemplo/);
    expect(mensajeClaveCifrado('debil')).toMatch(/repetido/);
  });
});

describe('analizarClaveCifrado: clasificación sin leer el entorno', () => {
  it('sin valor solo marca problema de producción, sin clave efectiva ni fallo fatal', () => {
    for (const vacio of [undefined, '', '   ']) {
      const analisis = analizarClaveCifrado(vacio);
      expect(analisis.claveEfectiva).toBeUndefined();
      expect(analisis.problemaFatal).toBeUndefined();
      expect(analisis.problemaProduccion).toBe(mensajeClaveCifrado('ausente'));
    }
  });

  it('con 64 hexadecimales devuelve la clave tal cual y sin avisos', () => {
    expect(analizarClaveCifrado(CLAVE_VALIDA)).toEqual({ claveEfectiva: CLAVE_VALIDA });
  });

  it('con cola larga conserva los primeros 64 y avisa', () => {
    const analisis = analizarClaveCifrado(`${CLAVE_VALIDA}cola-extra`);
    expect(analisis.claveEfectiva).toBe(CLAVE_VALIDA);
    expect(analisis.advertencia).toMatch(/primeros 64/);
    expect(analisis.problemaFatal).toBeUndefined();
  });

  it('lo no hexadecimal o corto es fallo fatal sin clave efectiva', () => {
    for (const mala of ['z'.repeat(64), CLAVE_VALIDA.slice(0, 63), 'corta']) {
      const analisis = analizarClaveCifrado(mala);
      expect(analisis.problemaFatal).toBe(mensajeClaveCifrado('malformada'));
      expect(analisis.claveEfectiva).toBeUndefined();
    }
  });

  it('la clave de ejemplo y la repetida marcan problema de producción con clave efectiva', () => {
    const ejemplo = analizarClaveCifrado(ENCRYPTION_KEY_DESARROLLO);
    expect(ejemplo.problemaProduccion).toBe(mensajeClaveCifrado('ejemplo'));
    expect(ejemplo.claveEfectiva).toBe(ENCRYPTION_KEY_DESARROLLO);

    const repetida = analizarClaveCifrado('f'.repeat(64));
    expect(repetida.problemaProduccion).toBe(mensajeClaveCifrado('debil'));
    expect(repetida.claveEfectiva).toBe('f'.repeat(64));
    expect(repetida.problemaFatal).toBeUndefined();
  });
});
