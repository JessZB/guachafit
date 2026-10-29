/**
 * Guardián de la regla global `prefers-reduced-motion` (UX-02, T7, §6 de `00_Reglas_Desarrollo_SDD.md`):
 * anula animaciones y transiciones a nivel global cuando el usuario o el sistema operativo
 * solicitan movimiento reducido, sin depender de clases `motion-reduce:` dispersas.
 *
 * Contrato técnico:
 * - Se ubica en `apps/web/src/index.css` al final, fuera de cualquier `@layer` o `@theme` (profundidad 0).
 * - Selector universal `*, *::before, *::after`.
 * - Forzado de duraciones mínimas (0.01ms) con `!important` en lugar de `animation: none`,
 *   permitiendo que animaciones de entrada (`animate-in`) alcancen su estado final visible.
 * - `scroll-behavior: auto !important` para suprimir transiciones suaves de desplazamiento.
 * - Sin exports: todas las funciones y expresiones regulares son locales a este spec.
 */
import { describe, expect, it } from 'vitest';
import css from './index.css?raw';

/** Elimina comentarios multilínea CSS (/* ... *\/) para aislar las reglas reales. */
function quitarComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Calcula la profundidad de llaves en un índice determinado del texto sin comentarios. */
function obtenerProfundidadEnPosicion(texto: string, posicion: number): number {
  let profundidad = 0;
  for (let i = 0; i < posicion; i++) {
    if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}') profundidad--;
  }
  return profundidad;
}

/** Extrae el contenido interno del bloque @media (prefers-reduced-motion: reduce). */
function extraerContenidoBloqueMedia(texto: string): string | null {
  const patron = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;
  const match = patron.exec(texto);
  if (!match) return null;

  const indiceApertura = texto.indexOf('{', match.index);
  if (indiceApertura === -1) return null;

  let nivel = 1;
  let i = indiceApertura + 1;
  while (i < texto.length && nivel > 0) {
    if (texto[i] === '{') nivel++;
    else if (texto[i] === '}') nivel--;
    i++;
  }

  return texto.slice(indiceApertura + 1, i - 1);
}

/** Validador integral de la regla que devuelve la lista de problemas encontrados. */
function problemasDeLaRegla(texto: string): string[] {
  const problemas: string[] = [];
  const cssLimpio = quitarComentarios(texto);

  const patronMedia = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;
  const matches = [...cssLimpio.matchAll(patronMedia)];

  if (matches.length === 0) {
    problemas.push('falta el bloque @media (prefers-reduced-motion: reduce)');
    return problemas;
  }
  if (matches.length > 1) {
    problemas.push('hay más de un bloque @media (prefers-reduced-motion: reduce)');
  }

  const match = matches[0];
  const profundidad = obtenerProfundidadEnPosicion(cssLimpio, match.index);
  if (profundidad !== 0) {
    problemas.push(`el bloque @media está dentro de una capa o regla (profundidad ${profundidad})`);
  }

  const contenido = extraerContenidoBloqueMedia(cssLimpio);
  if (!contenido) {
    problemas.push('no se pudo extraer el contenido del bloque @media');
    return problemas;
  }

  const tieneUniversal =
    /(?:^|[\s,])\*(?:[\s,{]|$)/.test(contenido) &&
    /(?:^|[\s,])\*::before(?:[\s,{]|$)/.test(contenido) &&
    /(?:^|[\s,])\*::after(?:[\s,{]|$)/.test(contenido);
  if (!tieneUniversal) {
    problemas.push('el selector universal debe incluir *, *::before y *::after');
  }

  const tieneAnimDuration = /animation-duration\s*:\s*0?\.01ms\s*!important/.test(contenido);
  const tieneAnimCount = /animation-iteration-count\s*:\s*1\s*!important/.test(contenido);
  const tieneTransDuration = /transition-duration\s*:\s*0?\.01ms\s*!important/.test(contenido);
  const tieneScroll = /scroll-behavior\s*:\s*auto\s*!important/.test(contenido);

  if (!tieneAnimDuration || !tieneAnimCount || !tieneTransDuration || !tieneScroll) {
    problemas.push('faltan declaraciones obligatorias con !important (duraciones 0.01ms, count 1, scroll auto)');
  }

  if (/animation(-name)?\s*:\s*none/.test(contenido)) {
    problemas.push('anula la animación por nombre (contiene animation: none o animation-name: none)');
  }

  return problemas;
}

describe('Regla global prefers-reduced-motion en index.css (UX-02 / T7)', () => {
  it('0. aserción de cordura: el CSS leído no está vacío y contiene @import "tailwindcss"', () => {
    expect(css).not.toBe('');
    expect(css).toContain('@import "tailwindcss"');
  });

  it('1. existe exactamente un bloque @media (prefers-reduced-motion: reduce)', () => {
    const cssLimpio = quitarComentarios(css);
    const coincidencias = [...cssLimpio.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g)];
    expect(coincidencias).toHaveLength(1);
  });

  it('2. el bloque @media está fuera de capas (profundidad de llaves = 0)', () => {
    const cssLimpio = quitarComentarios(css);
    const match = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.exec(cssLimpio);
    expect(match, 'debe existir el bloque @media').not.toBeNull();

    const posicion = match!.index;
    const profundidad = obtenerProfundidadEnPosicion(cssLimpio, posicion);
    expect(profundidad).toBe(0);
  });

  it('3. el contenido del bloque contiene una regla cuyo selector incluye *, *::before y *::after', () => {
    const cssLimpio = quitarComentarios(css);
    const contenido = extraerContenidoBloqueMedia(cssLimpio);
    expect(contenido, 'debe existir el bloque @media').not.toBeNull();

    expect(contenido!).toMatch(/(?:^|[\s,])\*(?:[\s,{]|$)/);
    expect(contenido!).toMatch(/(?:^|[\s,])\*::before(?:[\s,{]|$)/);
    expect(contenido!).toMatch(/(?:^|[\s,])\*::after(?:[\s,{]|$)/);
  });

  it('4. contiene las declaraciones obligatorias con !important', () => {
    const cssLimpio = quitarComentarios(css);
    const contenido = extraerContenidoBloqueMedia(cssLimpio);
    expect(contenido, 'debe existir el bloque @media').not.toBeNull();

    expect(contenido!).toMatch(/animation-duration\s*:\s*0?\.01ms\s*!important/);
    expect(contenido!).toMatch(/animation-iteration-count\s*:\s*1\s*!important/);
    expect(contenido!).toMatch(/transition-duration\s*:\s*0?\.01ms\s*!important/);
    expect(contenido!).toMatch(/scroll-behavior\s*:\s*auto\s*!important/);
  });

  it('5. no anula la animación por nombre (ni animation: none ni animation-name: none)', () => {
    const cssLimpio = quitarComentarios(css);
    const contenido = extraerContenidoBloqueMedia(cssLimpio);
    expect(contenido, 'debe existir el bloque @media para verificar sus propiedades').not.toBeNull();
    expect(contenido!).not.toMatch(/animation(-name)?\s*:\s*none/);
  });

  it('6. la regla en index.css no presenta ningún problema según el validador', () => {
    expect(problemasDeLaRegla(css)).toEqual([]);
  });
});

describe('Detección de regresiones en la regla de movimiento reducido', () => {
  it('detecta CSS sin la regla', () => {
    const problemas = problemasDeLaRegla('body { color: red; }');
    expect(problemas).toContain('falta el bloque @media (prefers-reduced-motion: reduce)');
  });

  it('detecta la regla dentro de @layer base (profundidad distinta de 0)', () => {
    const cssInvalido =
      '@layer base { @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } }';
    const problemas = problemasDeLaRegla(cssInvalido);
    expect(problemas.some((p) => p.includes('dentro de una capa'))).toBe(true);
  });

  it('detecta la regla sin !important', () => {
    const cssInvalido =
      '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms; animation-iteration-count: 1; transition-duration: 0.01ms; scroll-behavior: auto; } }';
    const problemas = problemasDeLaRegla(cssInvalido);
    expect(problemas.some((p) => p.includes('faltan declaraciones obligatorias'))).toBe(true);
  });

  it('detecta la regla con animation: none', () => {
    const cssInvalido =
      '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; animation: none; } }';
    const problemas = problemasDeLaRegla(cssInvalido);
    expect(problemas.some((p) => p.includes('anula la animación por nombre'))).toBe(true);
  });
});
