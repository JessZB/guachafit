/**
 * UX-17 · Estructura de AjustesPage (Contrato AE0–AE2).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import fuenteAjustesPage from './AjustesPage.tsx?raw';

afterEach(() => {
  cleanup();
});

describe('AjustesPage · estructura (UX-17)', () => {
  it('AE0 · Cordura: el texto no está vacío y contiene export function AjustesPage', () => {
    expect(fuenteAjustesPage.trim().length).toBeGreaterThan(0);
    expect(fuenteAjustesPage).toContain('export function AjustesPage');
  });

  it('AE1 · Sin duplicar la pantalla: contiene PantallaAjustes y no contiene useTabsAccesibles, useSearchParams ni PestanasAjustes', () => {
    expect(fuenteAjustesPage).toContain('PantallaAjustes');
    expect(fuenteAjustesPage).not.toContain('useTabsAccesibles');
    expect(fuenteAjustesPage).not.toContain('useSearchParams');
    expect(fuenteAjustesPage).not.toContain('PestanasAjustes');
  });

  it('AE2 · Tope: split(/\\r?\\n/).length es <= 300', () => {
    const lineas = fuenteAjustesPage.split(/\r?\n/).length;
    expect(lineas).toBeLessThanOrEqual(300);
  });
});
