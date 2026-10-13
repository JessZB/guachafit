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
  it('derives the cutoff from expiry minus life plus interval', () => {
    expect(LIMITE.getTime()).toBe(AHORA + VIGENCIA - INTERVALO);
  });
});

describe('enlaceRecienEmitido', () => {
  it('returns false without a current expiry', () => {
    expect(enlaceRecienEmitido(null, LIMITE)).toBe(false);
  });

  it('returns true for a link issued inside the minimum interval', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - 60_000), LIMITE)).toBe(true);
  });

  it('returns false for a link older than the minimum interval', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - INTERVALO - 1_000), LIMITE)).toBe(
      false
    );
  });

  it('returns false exactly at the boundary', () => {
    expect(enlaceRecienEmitido(new Date(AHORA + VIGENCIA - INTERVALO), LIMITE)).toBe(false);
  });
});
