/**
 * Módulo 6 · Nutrición: formatos de foto (spec de la lógica pura extraída en SL1).
 */
import { describe, expect, it } from 'vitest';
import {
  MIME_ACEPTADO_SELECTOR,
  MIME_PERMITIDO_PRESIGN,
  esMimePresignValido,
  esMimeSelectorValido,
  formatearPeso,
} from './nutricion-fotos';

describe('formatearPeso (recorte para UI, idéntico al de la vista)', () => {
  it('muestra bytes tal cual por debajo de 1 KB', () => {
    expect(formatearPeso(0)).toBe('0 B');
    expect(formatearPeso(842)).toBe('842 B');
  });

  it('redondea a KB enteros por debajo de 1 MB', () => {
    expect(formatearPeso(1024)).toBe('1 KB');
    expect(formatearPeso(842 * 1024)).toBe('842 KB');
  });

  it('usa un decimal en MB', () => {
    expect(formatearPeso(1024 * 1024)).toBe('1.0 MB');
    expect(formatearPeso(Math.round(1.24 * 1024 * 1024))).toBe('1.2 MB');
  });
});

describe('contratos MIME (mismos valores que validaba la vista)', () => {
  it('el presign solo acepta WebP o JPEG', () => {
    expect(MIME_PERMITIDO_PRESIGN).toEqual(['image/webp', 'image/jpeg']);
    expect(esMimePresignValido('image/webp')).toBe(true);
    expect(esMimePresignValido('image/jpeg')).toBe(true);
    expect(esMimePresignValido('image/png')).toBe(false);
  });

  it('el selector acepta JPG, PNG o WebP antes de comprimir', () => {
    expect(MIME_ACEPTADO_SELECTOR).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(esMimeSelectorValido('image/png')).toBe(true);
    expect(esMimeSelectorValido('text/plain')).toBe(false);
  });
});
