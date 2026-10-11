/**
 * Guardián de la convención transversal 12 (§6.12 de `00_Reglas_Desarrollo_SDD.md`):
 * en toda la web se prohíben los pesos tipográficos 800 y 900; el máximo permitido es 700.
 *
 * Lote E1, fase verde: tras la migración a `font-bold`, este spec debe pasar. La recolección
 * de archivos usa `import.meta.glob` de Vite (`?raw`), sin APIs de Node, para compilar también
 * bajo `tsc` (el paquete web no expone tipos de Node). No toca código de producción.
 */
import { describe, expect, it } from 'vitest';

/**
 * Patrón único de pesos prohibidos, aplicado línea a línea con la bandera `g`:
 * - clases Tailwind `font-black` / `font-extrabold` como palabra completa;
 * - pesos arbitrarios `font-[800]` / `font-[900]`;
 * - CSS `font-weight: 800` / `font-weight: 900` (con o sin espacios);
 * - estilos en línea `fontWeight: 800`, `fontWeight: 900`, `fontWeight: '800'`, `fontWeight: "900"`.
 */
export const PESO_TIPOGRAFICO_PROHIBIDO =
  /\bfont-(black|extrabold)\b|font-\[(800|900)\]|font-weight\s*:\s*(800|900)|fontWeight:\s*['"]?(800|900)['"]?/g;

/** Todo `apps/web/src` con extensiones de fuente, excluyendo los propios specs (`?raw`). */
const FUENTES_SRC = import.meta.glob<string>(
  ['./**/*.{ts,tsx,css,html}', '!./**/*.spec.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true }
);

/** Archivo adicional fuera de `src` que también se revisa: `apps/web/index.html` (`?raw`). */
const INDEX_HTML = import.meta.glob<string>('../index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Normaliza la clave de un glob (relativa a este spec, `apps/web/src`) a una ruta relativa a
 * `apps/web`: `./App.tsx` → `src/App.tsx`; `../index.html` → `index.html`.
 */
function rutaRelativaAWeb(clave: string): string {
  return clave.replace(/^\.\//, 'src/').replace(/^\.\.\//, '');
}

/** Rutas que analiza el guardián (relativas a `apps/web`), sin duplicados. */
function rutasAnalizadas(): string[] {
  const claves: string[] = [...Object.keys(FUENTES_SRC), ...Object.keys(INDEX_HTML)];
  return [...new Set(claves.map(rutaRelativaAWeb))];
}

function buscarPesosProhibidos(): string[] {
  const coincidencias: string[] = [];
  const archivos: Array<[string, string]> = [
    ...Object.entries(FUENTES_SRC),
    ...Object.entries(INDEX_HTML),
  ];

  for (const [clave, contenido] of archivos) {
    const ruta: string = rutaRelativaAWeb(clave);
    const lineas: string[] = contenido.split(/\r?\n/);
    lineas.forEach((linea: string, indice: number) => {
      const encontrados = linea.match(PESO_TIPOGRAFICO_PROHIBIDO);
      if (!encontrados) return;
      for (const encontrado of encontrados) {
        coincidencias.push(`${ruta}:${indice + 1}: ${encontrado}`);
      }
    });
  }

  return coincidencias;
}

describe('Convención §6.12: peso tipográfico máximo 700', () => {
  it('ningún archivo fuente usa pesos 800 o 900', () => {
    const coincidencias = buscarPesosProhibidos();

    expect(coincidencias).toEqual([]);
  });

  it('el detector reconoce los pesos prohibidos y no marca los permitidos', () => {
    const muestrasProhibidas = [
      'className="font-black"',
      'font-extrabold',
      'font-[900]',
      'font-weight: 800',
      "fontWeight: '900'",
    ];
    const muestrasPermitidas = [
      'font-bold',
      'font-semibold',
      'font-blackout',
      'font-weight: 700',
    ];

    for (const muestra of muestrasProhibidas) {
      expect(muestra.match(PESO_TIPOGRAFICO_PROHIBIDO), `debe detectar: ${muestra}`).not.toBeNull();
    }

    for (const muestra of muestrasPermitidas) {
      expect(muestra.match(PESO_TIPOGRAFICO_PROHIBIDO), `no debe detectar: ${muestra}`).toBeNull();
    }
  });

  it('el recorrido incluye el código fuente y excluye los specs', () => {
    const rutas = rutasAnalizadas();

    expect(rutas.length).toBeGreaterThan(100);
    expect(rutas).toContain('src/App.tsx');
    expect(rutas).toContain('index.html');

    for (const ruta of rutas) {
      expect(ruta.endsWith('.spec.ts') || ruta.endsWith('.spec.tsx')).toBe(false);
    }
  });
});
