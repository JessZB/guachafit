// @vitest-environment node
/**
 * Guardián · Carga sin saltos (skeletons) en vistas y componentes clave.
 *
 * Contrato E:
 * - Vistas 1–11 sustituyen EstadoCarga por CargaConEsqueleto y eliminan <EstadoCarga.
 * - PagosPage, ProgresoPage, ConciliacionPage y AjustesAlumnoPage no usan <p> plano para anunciar carga.
 *   En particular, «Cargando tu zona horaria…» solo existe como argumento texto= de CargaConEsqueleto.
 * - EstadosMonitor.tsx no contiene animate-pulse (el skeleton lo encapsula).
 * - NutricionPage.tsx o su hook use-reporte-hoy.ts exponen/usan cargandoReporte.
 */
import { describe, expect, it } from 'vitest';

const archivosSrc = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function leerArchivo(rutaDesdeSrc: string): string {
  const normalizada = rutaDesdeSrc.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  const sinComponents = normalizada.replace(/^components\//, '');
  for (const [clave, valor] of Object.entries(archivosSrc)) {
    const claveNorm = clave.replace(/\\/g, '/');
    if (claveNorm.endsWith(normalizada) || claveNorm.endsWith(sinComponents)) {
      return valor;
    }
  }
  throw new Error(`Archivo no encontrado en glob: ${rutaDesdeSrc}`);
}

const ARCHIVOS_VISTAS_1_11 = [
  'pages/atleta/EntrenamientoPage.tsx',
  'pages/atleta/ProgresoPage.tsx',
  'pages/atleta/PagosPage.tsx',
  'pages/entrenador/DashboardPage.tsx',
  'pages/entrenador/ConciliacionPage.tsx',
  'pages/entrenador/AlumnoDetallePage.tsx',
  'pages/entrenador/PlantillasPage.tsx',
  'pages/entrenador/AntropometriaPage.tsx',
  'components/entrenador/monitor-adherencia/EstadosMonitor.tsx',
  'components/entrenador/ajustes-entrenador/PanelPlanes.tsx',
  'components/entrenador/ajustes-entrenador/PestanaTasa.tsx',
  'components/ajustes/ContenidoConPerfil.tsx',
  'pages/atleta/AjustesAlumnoPage.tsx',
] as const;

const ARCHIVOS_SIN_P_CARGA = [
  'pages/atleta/PagosPage.tsx',
  'pages/atleta/ProgresoPage.tsx',
  'pages/entrenador/ConciliacionPage.tsx',
  'pages/atleta/AjustesAlumnoPage.tsx',
] as const;

describe('Guardián · Carga sin saltos (Contrato E)', () => {
  describe('Vistas 1–11: contienen CargaConEsqueleto y NO contienen <EstadoCarga', () => {
    it.each(ARCHIVOS_VISTAS_1_11)('%s usa CargaConEsqueleto y elimina <EstadoCarga', (archivo) => {
      const contenido = leerArchivo(archivo);
      expect(contenido).toContain('CargaConEsqueleto');
      expect(contenido).not.toContain('<EstadoCarga');
    });
  });

  describe('Ausencia de texto plano de carga <p> en vistas especificadas', () => {
    it.each(ARCHIVOS_SIN_P_CARGA)('%s no contiene texto de carga en etiqueta <p>', (archivo) => {
      const contenido = leerArchivo(archivo);
      expect(contenido).not.toMatch(/<p[^>]*role="status"[^>]*>/);
      expect(contenido).not.toMatch(/<p[^>]*>[\s\S]*?Cargando/);
    });

    it('AjustesAlumnoPage: «Cargando tu zona horaria…» solo aparece como texto= de CargaConEsqueleto', () => {
      const contenido = leerArchivo('pages/atleta/AjustesAlumnoPage.tsx');
      expect(contenido).not.toMatch(/<p[^>]*>[\s\S]*?Cargando tu zona horaria/);

      const coincidencias = [...contenido.matchAll(/Cargando tu zona horaria[….]/g)];
      expect(coincidencias.length).toBeGreaterThan(0);
      expect(contenido).toMatch(/<CargaConEsqueleto[^>]*texto=(?:["']|{\s*["'])Cargando tu zona horaria[….]/);
    });
  });

  describe('EstadosMonitor: sin clases directas de pulsación', () => {
    it('EstadosMonitor.tsx NO contiene animate-pulse', () => {
      const contenido = leerArchivo('components/entrenador/monitor-adherencia/EstadosMonitor.tsx');
      expect(contenido).not.toContain('animate-pulse');
    });
  });

  describe('Nutrición: estado explícito de carga del reporte', () => {
    it('NutricionPage.tsx o su hook use-reporte-hoy.ts contienen cargandoReporte', () => {
      const contenidoPage = leerArchivo('pages/atleta/NutricionPage.tsx');
      const contenidoHook = leerArchivo('components/atleta/nutricion/use-reporte-hoy.ts');
      const tieneCargandoReporte =
        contenidoPage.includes('cargandoReporte') || contenidoHook.includes('cargandoReporte');
      expect(tieneCargandoReporte).toBe(true);
    });
  });
});
