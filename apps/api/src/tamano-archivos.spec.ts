/**
 * Guardián del tope duro P5 (ODD `odd/tasks/modularizacion-api-ola1.md`):
 * ningún `.ts` bajo `apps/api/src` (salvo specs) pasa de 400 líneas.
 * Tras el cierre de la Ola 2 (prompt 129) el tope rige para TODO `src` sin
 * excepciones: la lista `EXCEPCIONES_API_OLA2_NO_TRABAJADA` queda vacía.
 * Una excepción nueva solo se admite con una referencia explícita a su ODD.
 *
 * La recolección usa `node:fs` (el paquete del API tiene tipos de Node, a diferencia de web
 * que debe usar `import.meta.glob` de Vite). Resuelve `src/` desde el directorio
 * de trabajo actual, soportando tanto `pnpm --filter @guachafit/api test`
 * (cwd = `apps/api`) como una corrida desde la raíz del repo (cwd = raíz del repo). No toca
 * código de producción.
 *
 * Falla listando `archivo (líneas)` por cada archivo no exceptuado sobre el tope.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/** Tope duro P5: pasar de 400 exige justificación escrita en el reporte del módulo. */
export const TOPE_LINEAS_ARCHIVO = 400;

/** `src/` del paquete del API, resuelto desde el directorio de trabajo. */
function raizSrcApi(): string {
  const desdePaquete = path.resolve(process.cwd(), 'src');
  if (fs.existsSync(desdePaquete)) return desdePaquete;
  return path.resolve(process.cwd(), 'apps/api/src');
}

/** Cada `.ts` bajo `src/`, salvo specs. Las rutas usan `/` y empiezan con `src/`. */
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
 * Excepciones explícitas: vacía desde el cierre de la Ola 2 (prompt 129,
 * ODD `odd/tasks/modularizacion-api-ola2.md`). Los 8 archivos de la "Ola 2 del API"
 * ya quedaron por debajo del tope (fachada, barril, processor o controlador ≤ 250,
 * piezas ≤ 300) y el guardián queda en verde. Una excepción nueva exige una
 * referencia explícita a su ODD; ningún archivo de `casos-*` puede aparecer en
 * esta lista (lo vigila el segundo test).
 *
 * Historial (medido con este mismo contador, segmentos de `split`; las cifras del
 * ODD entre paréntesis se midieron con `wc -l`, una menos):
 * - `src/modules/entrenamiento/plantillas.service.ts` (609 → 160)
 * - `src/modules/antropometria/antropometria-periodicidad.util.ts` (517 → 27, barril)
 * - `src/modules/antropometria/processors/antropometria-recordatorio.processor.ts` (493 → 267)
 * - `src/modules/finanzas/finanzas.controller.ts` (470 → 240)
 * - `src/modules/notificaciones/notification-dispatcher.service.ts` (463 → 173)
 * - `src/modules/notificaciones/processors/resumen-semanal.processor.ts` (436 → 97)
 * - `src/modules/entrenador/entrenador.service.ts` (432 → 50)
 * - `src/common/config/validar-configuracion-produccion.ts` (403 → 30, barril)
 */
export const EXCEPCIONES_API_OLA2_NO_TRABAJADA: string[] = [];

/**
 * Fachadas de la Ola 1 del ODD (A1-A7). Ninguna puede aparecer en
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
 * Carpetas de casos y piezas del API (P2 del ODD de la Ola 1 y Q2 del ODD de la
 * Ola 2). Ninguna ruta de excepción puede vivir bajo uno de estos prefijos.
 * Incluye las 7 carpetas de la Ola 1 (A1-A7) y las 8 carpetas nuevas de la Ola 2
 * (B1-B8). La barra final evita confundir `casos-finanzas/` con un nombre
 * hermano más largo.
 */
export const CARPETAS_CASOS_API: string[] = [
  'src/modules/finanzas/casos-finanzas/', // A1
  'src/modules/entrenamiento/casos-entrenamiento/', // A2
  'src/modules/alumnos/casos-alumnos/', // A3
  'src/modules/auth/casos-auth/', // A4
  'src/modules/antropometria/casos-antropometria/', // A5
  'src/modules/finanzas/casos-cartera/', // A6
  'src/modules/nutricion/casos-nutricion/', // A7
  'src/modules/entrenamiento/casos-plantillas/', // B1
  'src/modules/antropometria/periodicidad/', // B2
  'src/modules/antropometria/processors/recordatorio/', // B3
  'src/modules/finanzas/controlador-finanzas/', // B4
  'src/modules/notificaciones/casos-despachador/', // B5
  'src/modules/notificaciones/processors/resumen-semanal/', // B6
  'src/modules/entrenador/casos-entrenador/', // B7
  'src/common/config/validacion-produccion/', // B8
];

/**
 * Conteo de líneas de un archivo: un segmento por salto de línea.
 *
 * Misma convención que `apps/web/src/tamano-archivos.spec.ts` (coherente
 * con `wc -l`, tarea 5 del prompt 62): divide el contenido por saltos de línea y
 * cuenta los segmentos. En un archivo que termina con salto de línea (todos los del repo,
 * por Prettier) esto equivale a `wc -l + 1`. El tope de 400 y las cifras del ODD están
 * expresados en esta misma unidad; la comparación se mantiene coherente mientras nada
 * mezcle unidades.
 */
function contarLineas(contenido: string): number {
  return contenido.split(/\r?\n/).length;
}

/** Archivos no exceptuados sobre el tope, como `ruta (líneas)`. */
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

describe(
  'Tope duro P5: ningun archivo de apps/api/src pasa de 400 lineas',
  // La recolección recorre `src/` en frío (~11,7 s medidos): se hace una sola
  // vez por archivo de test y el presupuesto cubre la lectura más lenta.
  { timeout: 30000 },
  () => {
    // Las fuentes se recolectan UNA sola vez por archivo de test: recorrer `src/`
    // en frío tarda ~11,7 s y repetirlo en cada test agota el timeout por defecto.
    let fuentes: Map<string, string>;

    beforeAll(() => {
      fuentes = recolectarFuentes();
    });

    it('ningun archivo fuera de excepciones pasa del tope', () => {
      const excedidos = buscarArchivosExcedidos(fuentes);

      expect(excedidos).toEqual([]);
    });

    it('la lista de excepciones no cubre fachadas ni carpetas casos-*', () => {
      for (const fachada of FACHADAS_API_OLA1) {
        expect(
          EXCEPCIONES_API_OLA2_NO_TRABAJADA,
          `${fachada} no puede estar exceptuado`
        ).not.toContain(fachada);
      }

      for (const ruta of EXCEPCIONES_API_OLA2_NO_TRABAJADA) {
        for (const carpeta of CARPETAS_CASOS_API) {
          expect(ruta.startsWith(carpeta), `${ruta} vive en carpeta casos-*`).toBe(false);
        }
      }
    });

    it('toda excepcion sigue haciendo falta: existe y pasa del tope', () => {
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
      const rutas: string[] = [...fuentes.keys()];

      expect(rutas.length).toBeGreaterThan(100);
      expect(rutas).toContain('src/modules/finanzas/finanzas.service.ts');
      expect(rutas).toContain('src/modules/entrenamiento/plantillas.service.ts');

      for (const ruta of rutas) {
        expect(ruta.endsWith('.spec.ts')).toBe(false);
      }
    });
  },
);
