// @vitest-environment node
/**
 * Specs Guardián · Transiciones de vista en layout, componentes y CSS (Fase roja TDD).
 *
 * Contratos:
 * - G: Reglas CSS de transición dentro de @media (prefers-reduced-motion: no-preference) en index.css.
 * - H: Raíces de vistas no llevan animate-fade-in ni animate-in fade-in (el layout da la entrada).
 */
import { describe, expect, it } from 'vitest';
import indexCssRaw from '../../index.css?raw';

const archivosSrc = import.meta.glob<string>('../../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function leerArchivo(rutaDesdeSrc: string): string {
  const contenido =
    archivosSrc[`./${rutaDesdeSrc.replace(/^components\/layout\//, '')}`] ??
    archivosSrc[`../${rutaDesdeSrc.replace(/^components\//, '')}`] ??
    archivosSrc[`../../${rutaDesdeSrc}`] ??
    archivosSrc[rutaDesdeSrc];
  if (typeof contenido !== 'string') {
    throw new Error(`Archivo no encontrado en glob: ${rutaDesdeSrc}`);
  }
  return contenido;
}

const PAGINAS_SIN_ANIMACION_ENTRADA = [
  'pages/admin/AdminPage.tsx',
  'pages/atleta/PagosPage.tsx',
  'pages/atleta/ProgresoPage.tsx',
  'pages/entrenador/AlumnoDetallePage.tsx',
  'pages/entrenador/AlumnosPage.tsx',
  'pages/entrenador/PlantillasPage.tsx',
  'pages/entrenador/MonitorAdherenciaPage.tsx',
  'pages/atleta/AtletaMenuPage.tsx',
  'pages/entrenador/CoachMenuPage.tsx',
  'components/ajustes/PantallaAjustes.tsx',
] as const;

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
  // Bug que previene: una animación (animate-fade-in, animate-in fade-in) en la raíz de una página
  // la convierte en bloque contenedor de los modales fixed y los confina; solo puede vigilarse
  // leyendo el código porque happy-dom no calcula esa geometría.
  describe('Contrato H · Páginas sin animate-fade-in ni animate-in fade-in en contenedor raíz', () => {
    it.each(PAGINAS_SIN_ANIMACION_ENTRADA)(
      '%s no contiene animate-fade-in ni animate-in fade-in',
      (archivo) => {
        const contenido = leerArchivo(archivo);
        expect(contenido).not.toContain('animate-fade-in');
        expect(contenido).not.toMatch(/animate-in\s+fade-in/);
      }
    );
  });

  describe('Contrato G · Reglas CSS en index.css', () => {
    it('index.css contiene ::view-transition-old(contenido) y ::view-transition-new(contenido) dentro de @media (prefers-reduced-motion: no-preference)', () => {
      const bloque = extraerBloqueNoPreference(indexCssRaw);
      expect(bloque).not.toBeNull();
      expect(bloque).toContain('::view-transition-old(contenido)');
      expect(bloque).toContain('::view-transition-new(contenido)');
    });
  });
});
