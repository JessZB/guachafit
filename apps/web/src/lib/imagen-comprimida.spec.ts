import { describe, expect, it } from 'vitest';
import { CALIDAD_WEBP, LADO_MAXIMO_FOTO, calcularDimensionesEscaladas } from './imagen-comprimida';

describe('calcularDimensionesEscaladas (RF-002 RN-03: compresión en cliente, ADR-004)', () => {
  it('escala proporcionalmente cuando el lado mayor excede el máximo', () => {
    expect(calcularDimensionesEscaladas(4000, 3000)).toEqual({ ancho: 1920, alto: 1440 });
    expect(calcularDimensionesEscaladas(3000, 4000)).toEqual({ ancho: 1440, alto: 1920 });
  });

  it('no amplía una imagen que ya es más pequeña que el máximo', () => {
    expect(calcularDimensionesEscaladas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('usa el máximo por defecto de 1920px y calidad WebP 85 %', () => {
    expect(calcularDimensionesEscaladas(9999, 10).ancho).toBe(LADO_MAXIMO_FOTO);
    expect(CALIDAD_WEBP).toBe(0.85);
  });

  it('nunca devuelve dimensiones 0 en una imagen extrema (lado mínimo 1px)', () => {
    expect(calcularDimensionesEscaladas(10000, 1)).toEqual({ ancho: 1920, alto: 1 });
  });

  it('devuelve 0×0 ante entradas inválidas en vez de fabricar dimensiones', () => {
    expect(calcularDimensionesEscaladas(0, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(Number.NaN, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(100, -5)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(100, 100, 0)).toEqual({ ancho: 0, alto: 0 });
  });
});
