import { describe, expect, it } from 'vitest';
import {
  enlaceRecienEmitido,
  limiteEnlaceRecienEmitido,
} from './recuperacion-reglas';

const VIGENCIA = 60 * 60_000;
const INTERVALO = 15 * 60_000;
const AHORA = 1_000_000_000_000;
const LIMITE = limiteEnlaceRecienEmitido(AHORA, VIGENCIA, INTERVALO);

describe('limiteEnlaceRecienEmitido', () => {
  it('deduce el corte como vencimiento menos intervalo', () => {
    expect(LIMITE.getTime()).toBe(AHORA + VIGENCIA - INTERVALO);
  });
});

describe('enlaceRecienEmitido', () => {
  it('devuelve false sin vencimiento vigente', () => {
    expect(enlaceRecienEmitido(null, LIMITE)).toBe(false);
  });

  it('devuelve true para un enlace emitido dentro del intervalo mínimo', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - 60_000), LIMITE)).toBe(true);
  });

  it('devuelve false para un enlace más viejo que el intervalo mínimo', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - INTERVALO - 1_000), LIMITE)).toBe(
      false
    );
  });

  it('devuelve false justo en el límite', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - INTERVALO), LIMITE)).toBe(false);
  });
});
