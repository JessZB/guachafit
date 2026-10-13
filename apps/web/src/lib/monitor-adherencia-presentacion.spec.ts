/**
 * Módulo `monitor-adherencia` · spec de la lógica pura de presentación.
 *
 * Fija el comportamiento ACTUAL extraído verbatim de la página: los componentes
 * consumen estos helpers sin cambiar el DOM que consultan los specs de interacción.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASES_TONO,
  iniciales,
  porcentajeSeguro,
} from './monitor-adherencia-presentacion';

describe('iniciales', () => {
  it('vacío o espacios devuelve "?"', () => {
    expect(iniciales('')).toBe('?');
    expect(iniciales('   ')).toBe('?');
  });

  it('una palabra devuelve sus dos primeras letras en mayúsculas', () => {
    expect(iniciales('Rosa')).toBe('RO');
  });

  it('dos o más palabras devuelven las iniciales de las dos primeras', () => {
    expect(iniciales('Rosa Riesgo')).toBe('RR');
    expect(iniciales('carlos alberto mendoza')).toBe('CA');
  });
});

describe('porcentajeSeguro', () => {
  it('devuelve el número tal cual dentro de 0–100', () => {
    expect(porcentajeSeguro('25.00')).toBe(25);
    expect(porcentajeSeguro('100.00')).toBe(100);
  });

  it('sujeta por arriba y por abajo', () => {
    expect(porcentajeSeguro('140')).toBe(100);
    expect(porcentajeSeguro('-3')).toBe(0);
  });

  it('lo no numérico es 0 (nunca NaN)', () => {
    expect(porcentajeSeguro('')).toBe(0);
    expect(porcentajeSeguro('sin dato')).toBe(0);
  });
});

describe('CLASES_TONO', () => {
  it('cubre los cinco tonos con chip, punto, barra y texto', () => {
    for (const tono of ['success', 'warning', 'danger', 'info', 'neutral'] as const) {
      expect(CLASES_TONO[tono].chip).toBeTruthy();
      expect(CLASES_TONO[tono].punto).toBeTruthy();
      expect(CLASES_TONO[tono].barra).toBeTruthy();
      expect(CLASES_TONO[tono].texto).toBeTruthy();
    }
  });
});
