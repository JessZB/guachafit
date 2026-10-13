/**
 * Guardián del tope duro R2 (ODD `odd/tasks/modularizacion-vistas-web.md`):
 * ningún `.ts`/`.tsx` de `src/pages` o `src/components` (excluyendo specs)
 * pasa de 400 líneas. (El tope ≤ 300 de los contenedores M1–M8 lo impone el
 * ODD, no este spec.)
 *
 * La recolección de archivos usa `import.meta.glob` de Vite (`?raw`), sin APIs
 * de Node, para compilar también bajo `tsc` (el paquete web no expone tipos de
 * Node). Patrón tomado de `apps/web/src/estilo-tipografia.spec.ts`. No toca
 * código de producción.
 *
 * Falla listando `archivo (líneas)` por cada archivo fuera de excepciones que
 * pase del tope.
 */
import { describe, expect, it } from 'vitest';

/** Tope duro R2: pasar de 400 exige justificación escrita en el reporte del módulo. */
export const TOPE_LINEAS_ARCHIVO = 400;

/** Todo `src/pages` y `src/components` con extensiones de fuente, excluyendo specs (`?raw`). */
const FUENTES_PAGINAS_COMPONENTES = import.meta.glob<string>(
  ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', '!./**/*.spec.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true }
);

/**
 * Excepciones explícitas: SOLO archivos de la Ola 2 del ODD
 * (`odd/tasks/modularizacion-vistas-web.md`, sección "Ola 2: de 700 a 999 líneas")
 * que aún no se trabajaron. Tienen su propio ODD posterior con las mismas reglas.
 * Ningún archivo de M1–M8 puede estar en esta lista (lo verifica el segundo test).
 */
export const EXCEPCIONES_OLA2_NO_TRABAJADA: string[] = [];

/**
 * Excepciones explícitas: SOLO archivos de la Ola 3 del ODD
 * (`odd/tasks/modularizacion-vistas-web.md`, sección "Ola 3: de 401 a 699 líneas",
 * añadida el 2026-10-13 tras el BLOCKER-59-1) que aún no se trabajaron. Mismo
 * formato de rutas que la lista de la Ola 2. Ningún archivo de M1–M8 puede estar
 * en esta lista (lo verifica el segundo test).
 */
export const EXCEPCIONES_OLA3_NO_TRABAJADA: string[] = [
  'src/pages/entrenador/AntropometriaPage.tsx', // Ola 3 ODD: 639 líneas
  'src/pages/admin/AdminPage.tsx', // Ola 3 ODD: 586 líneas
  'src/components/common/GraficoEvolucion.tsx', // Ola 3 ODD: 560 líneas
  'src/components/entrenador/AsignacionMasivaPlantilla.tsx', // Ola 3 ODD: 544 líneas
  'src/components/notificaciones/MatrizPreferenciasNotificacion.tsx', // Ola 3 ODD: 467 líneas
  'src/components/entrenador/TablaCartera.tsx', // Ola 3 ODD: 460 líneas
  'src/pages/auth/OnboardingPage.tsx', // Ola 3 ODD: 433 líneas
  'src/components/entrenador/DetalleSesionEntrenamiento.tsx', // Ola 3 ODD: 413 líneas
];

/**
 * Contenedores de página de los módulos M1–M8 del ODD (Ola 1). Ninguno puede
 * figurar en `EXCEPCIONES_OLA2_NO_TRABAJADA` ni en `EXCEPCIONES_OLA3_NO_TRABAJADA`.
 */
export const PAGINAS_M1_M8: string[] = [
  'src/pages/entrenador/AlumnoDetallePage.tsx', // M1
  'src/pages/atleta/EntrenamientoPage.tsx', // M2
  'src/pages/entrenador/AlumnosPage.tsx', // M3
  'src/pages/atleta/PagosPage.tsx', // M4
  'src/pages/atleta/ProgresoPage.tsx', // M5
  'src/pages/atleta/NutricionPage.tsx', // M6
  'src/pages/entrenador/AjustesPage.tsx', // M7
  'src/pages/entrenador/PlantillasPage.tsx', // M8
];

/**
 * Carpetas propias de los módulos M1–M8 (componentes únicos, capa R1). Ninguna
 * ruta de `EXCEPCIONES_OLA2_NO_TRABAJADA` ni de `EXCEPCIONES_OLA3_NO_TRABAJADA`
 * puede empezar por uno de estos prefijos (lo verifica el segundo test). Con
 * barra final para no confundir `components/entrenador/` con
 * `components/entrenador/<modulo>/`.
 */
export const CARPETAS_MODULOS_M1_M8: string[] = [
  'src/components/entrenador/alumno-detalle/', // M1
  'src/components/atleta/entrenamiento/', // M2
  'src/components/entrenador/alumnos/', // M3
  'src/components/atleta/pagos/', // M4
  'src/components/atleta/progreso/', // M5
  'src/components/atleta/nutricion/', // M6
  'src/components/entrenador/ajustes-entrenador/', // M7
  'src/components/entrenador/plantillas/', // M8
];

/**
 * Normaliza la clave de un glob (relativa a este spec, `apps/web/src`) a una
 * ruta relativa a `apps/web`: `./pages/...` → `src/pages/...`.
 */
function rutaRelativaAWeb(clave: string): string {
  return clave.replace(/^\.\//, 'src/');
}

/**
 * Líneas de un archivo (`?raw`): una por salto de línea.
 *
 * Cómo cuenta (coherencia con `wc -l`, tarea 5 del prompt 62): parte el
 * contenido por saltos de línea y cuenta los segmentos. En un archivo que
 * termina en salto de línea (todos los del repo, por Prettier), esto equivale
 * a `wc -l + 1` (el segmento vacío tras el último salto también cuenta). El
 * tope 400 y las cifras de las listas de excepciones y del ODD se expresan en
 * esta misma unidad, porque se midieron con este mismo conteo; la comparación
 * es coherente mientras nada mezcle unidades.
 */
function contarLineas(contenido: string): number {
  return contenido.split(/\r?\n/).length;
}

/** Archivos fuera de excepciones que pasan del tope, como `ruta (líneas)`. */
function buscarArchivosExcedidos(): string[] {
  const excedidos: string[] = [];

  for (const [clave, contenido] of Object.entries(FUENTES_PAGINAS_COMPONENTES)) {
    const ruta: string = rutaRelativaAWeb(clave);
    if (EXCEPCIONES_OLA2_NO_TRABAJADA.includes(ruta)) continue;
    if (EXCEPCIONES_OLA3_NO_TRABAJADA.includes(ruta)) continue;
    const lineas: number = contarLineas(contenido);
    if (lineas > TOPE_LINEAS_ARCHIVO) {
      excedidos.push(`${ruta} (${lineas})`);
    }
  }

  return excedidos.sort();
}

describe('Tope duro R2: ningún archivo de páginas o componentes pasa de 400 líneas', () => {
  it('ningún archivo fuera de excepciones pasa del tope', () => {
    const excedidos = buscarArchivosExcedidos();

    expect(excedidos).toEqual([]);
  });

  it('las listas de excepciones solo cubren las olas 2 y 3: ningún M1–M8 está en ellas', () => {
    for (const lista of [EXCEPCIONES_OLA2_NO_TRABAJADA, EXCEPCIONES_OLA3_NO_TRABAJADA]) {
      for (const pagina of PAGINAS_M1_M8) {
        expect(lista, `${pagina} no puede estar exceptuado`).not.toContain(pagina);
      }

      for (const ruta of lista) {
        for (const carpeta of CARPETAS_MODULOS_M1_M8) {
          expect(ruta.startsWith(carpeta), `${ruta} vive en carpeta de M1–M8`).toBe(false);
        }
        expect(
          ruta.startsWith('src/components/ui/'),
          `${ruta} no puede ser un átomo de ui/`
        ).toBe(false);
      }
    }
  });

  it('toda excepción sigue haciendo falta: existe y pasa del tope', () => {
    const innecesarias: string[] = [];

    for (const ruta of [...EXCEPCIONES_OLA2_NO_TRABAJADA, ...EXCEPCIONES_OLA3_NO_TRABAJADA]) {
      const clave = `./${ruta.replace(/^src\//, '')}`;
      const contenido = FUENTES_PAGINAS_COMPONENTES[clave];

      if (contenido === undefined || contarLineas(contenido) <= TOPE_LINEAS_ARCHIVO) {
        innecesarias.push(ruta);
      }
    }

    expect(innecesarias).toEqual([]);
  });

  it('el recorrido incluye páginas y componentes y excluye los specs', () => {
    const rutas: string[] = Object.keys(FUENTES_PAGINAS_COMPONENTES).map(rutaRelativaAWeb);

    expect(rutas.length).toBeGreaterThan(200);
    expect(rutas).toContain('src/pages/entrenador/AlumnoDetallePage.tsx');
    expect(rutas).toContain('src/components/ui/BotonTactil.tsx');

    for (const ruta of rutas) {
      expect(ruta.endsWith('.spec.ts') || ruta.endsWith('.spec.tsx')).toBe(false);
    }
  });
});
