/**
 * Guardian of the hard cap P5 (ODD `odd/tasks/modularizacion-api-ola1.md`):
 * no `.ts` under `apps/api/src` (excluding specs) exceeds 400 lines.
 * After the Wave 1 closure (prompt 110) the cap governs ALL of `src`;
 * the only exceptions are the 8 files of the "API Wave 2" listed in the ODD
 * (401-899 lines), which have their own later ODD under the same rules.
 *
 * File collection uses `node:fs` (the API package has Node types, unlike web
 * which must use Vite `import.meta.glob`). Resolves `src/` from the current
 * working directory, supporting both `pnpm --filter @guachafit/api test`
 * (cwd = `apps/api`) and a repo-root run (cwd = repo root). Does not touch
 * production code.
 *
 * Fails listing `file (lines)` for each non-excepted file over the cap.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Hard cap P5: going over 400 requires written justification in the module report. */
export const TOPE_LINEAS_ARCHIVO = 400;

/** `src/` of the API package, resolved from the working directory. */
function raizSrcApi(): string {
  const desdePaquete = path.resolve(process.cwd(), 'src');
  if (fs.existsSync(desdePaquete)) return desdePaquete;
  return path.resolve(process.cwd(), 'apps/api/src');
}

/** Every `.ts` under `src/`, excluding specs. Paths use `/` and start with `src/`. */
function recolectarFuentes(): Map<string, string> {
  const raiz = raizSrcApi();
  const fuentes = new Map<string, string>();

  function visitar(directorio: string): void {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const absoluta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        visitar(absoluta);
        continue;
      }
      if (!absoluta.endsWith('.ts')) continue;
      if (absoluta.endsWith('.spec.ts')) continue;
      const relativa = `src/${path.relative(raiz, absoluta).split(path.sep).join('/')}`;
      fuentes.set(relativa, fs.readFileSync(absoluta, 'utf8'));
    }
  }

  visitar(raiz);
  return fuentes;
}

/**
 * Explicit exceptions: ONLY the 8 files of the "API Wave 2"
 * (`odd/tasks/modularizacion-api-ola1.md`, "Ola 2 del API (ODD posterior,
 * 401-899 lineas)"). Not worked yet; they get their own later ODD.
 * No Wave 1 file may appear in this list (enforced by the second test).
 *
 * Lines measured 2026-10-13 with this same counter (`split` segments;
 * ODD figures in parentheses were measured with `wc -l`, one less):
 * - `src/modules/entrenamiento/plantillas.service.ts` (610; ODD 609)
 * - `src/modules/antropometria/antropometria-periodicidad.util.ts` (518; ODD 517)
 * - `src/modules/antropometria/processors/antropometria-recordatorio.processor.ts` (494; ODD 493)
 * - `src/modules/finanzas/finanzas.controller.ts` (471; ODD 470)
 * - `src/modules/notificaciones/notification-dispatcher.service.ts` (464; ODD 463)
 * - `src/modules/notificaciones/processors/resumen-semanal.processor.ts` (437; ODD 436)
 * - `src/modules/entrenador/entrenador.service.ts` (433; ODD 432)
 * - `src/common/config/validar-configuracion-produccion.ts` (404; ODD 403)
 */
export const EXCEPCIONES_API_OLA2_NO_TRABAJADA: string[] = [
  'src/modules/entrenamiento/plantillas.service.ts',
  'src/modules/antropometria/antropometria-periodicidad.util.ts',
  'src/modules/antropometria/processors/antropometria-recordatorio.processor.ts',
  'src/modules/finanzas/finanzas.controller.ts',
  'src/modules/notificaciones/notification-dispatcher.service.ts',
  'src/modules/notificaciones/processors/resumen-semanal.processor.ts',
  'src/modules/entrenador/entrenador.service.ts',
  'src/common/config/validar-configuracion-produccion.ts',
];

/**
 * Wave 1 facades of the ODD (A1-A7). None may appear in
 * `EXCEPCIONES_API_OLA2_NO_TRABAJADA`.
 */
export const FACHADAS_API_OLA1: string[] = [
  'src/modules/finanzas/finanzas.service.ts', // A1
  'src/modules/entrenamiento/entrenamiento.service.ts', // A2
  'src/modules/alumnos/alumnos.service.ts', // A3
  'src/modules/auth/auth.service.ts', // A4
  'src/modules/antropometria/antropometria.service.ts', // A5
  'src/modules/finanzas/cartera.service.ts', // A6
  'src/modules/nutricion/nutricion.service.ts', // A7
];

/**
 * Wave 1 use-case folders (P2 of the ODD). No exception path may live under
 * one of these prefixes. Trailing slash avoids confusing
 * `casos-finanzas/` with a longer sibling name.
 */
export const CARPETAS_CASOS_API_OLA1: string[] = [
  'src/modules/finanzas/casos-finanzas/', // A1
  'src/modules/entrenamiento/casos-entrenamiento/', // A2
  'src/modules/alumnos/casos-alumnos/', // A3
  'src/modules/auth/casos-auth/', // A4
  'src/modules/antropometria/casos-antropometria/', // A5
  'src/modules/finanzas/casos-cartera/', // A6
  'src/modules/nutricion/casos-nutricion/', // A7
];

/**
 * Line count of a file: one segment per line break.
 *
 * Same convention as `apps/web/src/tamano-archivos.spec.ts` (kept coherent
 * with `wc -l`, task 5 of prompt 62): splits the content on line breaks and
 * counts the segments. In a file ending with a line break (all repo files,
 * per Prettier) this equals `wc -l + 1`. The 400 cap and the ODD figures are
 * expressed in this same unit; the comparison stays coherent while nothing
 * mixes units.
 */
function contarLineas(contenido: string): number {
  return contenido.split(/\r?\n/).length;
}

/** Non-excepted files over the cap, as `path (lines)`. */
function buscarArchivosExcedidos(fuentes: Map<string, string>): string[] {
  const excedidos: string[] = [];

  for (const [ruta, contenido] of fuentes) {
    if (EXCEPCIONES_API_OLA2_NO_TRABAJADA.includes(ruta)) continue;
    const lineas: number = contarLineas(contenido);
    if (lineas > TOPE_LINEAS_ARCHIVO) {
      excedidos.push(`${ruta} (${lineas})`);
    }
  }

  return excedidos.sort();
}

describe('Tope duro P5: ningun archivo de apps/api/src pasa de 400 lineas', () => {
  it('ningun archivo fuera de excepciones pasa del tope', () => {
    const excedidos = buscarArchivosExcedidos(recolectarFuentes());

    expect(excedidos).toEqual([]);
  });

  it('la lista de excepciones solo cubre la Ola 2: ninguna fachada ni carpeta casos-* de la Ola 1 esta en ella', () => {
    for (const fachada of FACHADAS_API_OLA1) {
      expect(
        EXCEPCIONES_API_OLA2_NO_TRABAJADA,
        `${fachada} no puede estar exceptuado`
      ).not.toContain(fachada);
    }

    for (const ruta of EXCEPCIONES_API_OLA2_NO_TRABAJADA) {
      for (const carpeta of CARPETAS_CASOS_API_OLA1) {
        expect(ruta.startsWith(carpeta), `${ruta} vive en carpeta casos-* de la Ola 1`).toBe(false);
      }
    }
  });

  it('toda excepcion sigue haciendo falta: existe y pasa del tope', () => {
    const fuentes = recolectarFuentes();
    const innecesarias: string[] = [];

    for (const ruta of EXCEPCIONES_API_OLA2_NO_TRABAJADA) {
      const contenido = fuentes.get(ruta);

      if (contenido === undefined || contarLineas(contenido) <= TOPE_LINEAS_ARCHIVO) {
        innecesarias.push(ruta);
      }
    }

    expect(innecesarias).toEqual([]);
  });

  it('el recorrido incluye src y excluye los specs', () => {
    const fuentes = recolectarFuentes();
    const rutas: string[] = [...fuentes.keys()];

    expect(rutas.length).toBeGreaterThan(100);
    expect(rutas).toContain('src/modules/finanzas/finanzas.service.ts');
    expect(rutas).toContain('src/modules/entrenamiento/plantillas.service.ts');

    for (const ruta of rutas) {
      expect(ruta.endsWith('.spec.ts')).toBe(false);
    }
  });
});
