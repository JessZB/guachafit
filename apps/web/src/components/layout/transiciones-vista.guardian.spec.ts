// @vitest-environment node
/**
 * Specs Guardián · Transiciones de vista en layout, componentes y CSS (Fase roja TDD).
 *
 * Contratos:
 * - G: Reglas CSS de transición dentro de @media (prefers-reduced-motion: no-preference) en index.css.
 */
import { describe, expect, it } from 'vitest';
import indexCssRaw from '../../index.css?raw';

function extraerBloqueNoPreference(css: string): string | null {
  const patron = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;
  const match = patron.exec(css);
  if (!match) return null;

  const apertura = css.indexOf('{', match.index);
  if (apertura === -1) return null;

  let nivel = 1;
  let i = apertura + 1;
  while (i < css.length && nivel > 0) {
    if (css[i] === '{') nivel++;
    else if (css[i] === '}') nivel--;
    i++;
  }
  return css.slice(apertura + 1, i - 1);
}

describe('Guardián · Transiciones de vista y persistencia de chrome', () => {
  describe('Contrato G · Reglas CSS en index.css', () => {
    it('index.css contiene ::view-transition-old(contenido) y ::view-transition-new(contenido) dentro de @media (prefers-reduced-motion: no-preference)', () => {
      const bloque = extraerBloqueNoPreference(indexCssRaw);
      expect(bloque).not.toBeNull();
      expect(bloque).toContain('::view-transition-old(contenido)');
      expect(bloque).toContain('::view-transition-new(contenido)');
    });
  });
});
