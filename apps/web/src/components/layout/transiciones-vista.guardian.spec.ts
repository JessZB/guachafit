// @vitest-environment node
/**
 * Specs Guardián · Transiciones de vista en layout, componentes y CSS (Fase roja TDD).
 *
 * Contratos:
 * - D: Chrome fijo (Header, BottomNav, Sidebar llevan [view-transition-name:cabecera],
 *      [view-transition-name:barra-inferior], [view-transition-name:menu-lateral]).
 * - F: Navegación interna usa viewTransition={useTransicionVista()} o navigate(..., { viewTransition }).
 * - G: Reglas CSS de transición dentro de @media (prefers-reduced-motion: no-preference) en index.css,
 *      manteniendo exactamente UN bloque de prefers-reduced-motion: reduce.
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

const CHROME_FIJO = [
  { archivo: 'components/layout/Header.tsx', nombreTransicion: '[view-transition-name:cabecera]' },
  { archivo: 'components/layout/BottomNav.tsx', nombreTransicion: '[view-transition-name:barra-inferior]' },
  { archivo: 'components/layout/Sidebar.tsx', nombreTransicion: '[view-transition-name:menu-lateral]' },
] as const;

const ARCHIVOS_NAVEGACION_TRANSICION = [
  'components/layout/BottomNav.tsx',
  'components/layout/Sidebar.tsx',
  'components/layout/MenuCuenta.tsx',
  'components/atleta/menu/TarjetaEntrenarHoy.tsx',
  'components/atleta/menu/TarjetaAccesoAlumno.tsx',
  'pages/entrenador/CoachMenuPage.tsx',
  'components/entrenador/dashboard/ListaRiesgoDashboard.tsx',
  'components/entrenador/dashboard/FranjaAtencionDashboard.tsx',
  'components/entrenador/monitor-adherencia/TarjetaAlumnoMonitor.tsx',
  'pages/entrenador/AlumnosPage.tsx',
  'pages/entrenador/AlumnoDetallePage.tsx',
] as const;

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
  describe('Contrato D · Chrome fijo con view-transition-name propio', () => {
    it.each(CHROME_FIJO)('$archivo contiene $nombreTransicion', ({ archivo, nombreTransicion }) => {
      const contenido = leerArchivo(archivo);
      expect(contenido).toContain(nombreTransicion);
    });
  });

  describe('Contrato F · Navegación interna con viewTransition', () => {
    it.each(ARCHIVOS_NAVEGACION_TRANSICION)('%s contiene viewTransition', (archivo) => {
      const contenido = leerArchivo(archivo);
      expect(contenido).toContain('viewTransition');
    });
  });

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

    it('index.css conserva exactamente UN bloque @media (prefers-reduced-motion: reduce)', () => {
      const matches = [...indexCssRaw.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g)];
      expect(matches.length).toBe(1);
    });
  });
});
