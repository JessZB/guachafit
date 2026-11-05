import { describe, expect, it } from 'vitest';

const archivosSrc = import.meta.glob<string>('../../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function leerArchivoSrc(rutaRelativa: string): string {
  const claveComponente = `../${rutaRelativa.replace(/^components\//, '')}`;
  const claveSrc = `../../${rutaRelativa}`;
  const contenido =
    archivosSrc[claveComponente] ??
    archivosSrc[claveSrc] ??
    archivosSrc[rutaRelativa] ??
    archivosSrc[`./${rutaRelativa.replace(/^components\/common\//, '')}`];
  if (typeof contenido !== 'string') {
    throw new Error(`Archivo no encontrado en glob: ${rutaRelativa}`);
  }
  return contenido;
}

const ARCHIVOS_MODALES = [
  'components/notificaciones/PanelNotificaciones.tsx',
  'components/notificaciones/matriz-preferencias-notificacion/DialogoConfirmacionFinanzas.tsx',
  'components/entrenador/antropometria/ModalRechazoAntropometria.tsx',
  'components/entrenador/ajustes-entrenador/ModalPlanComercial.tsx',
  'components/atleta/entrenamiento/ModalFinalizarSesion.tsx',
  'components/common/InstalarAppPrompt.tsx',
  'components/common/VisorFoto.tsx',
  'components/atleta/entrenamiento/ModalCierreVacio.tsx',
  'components/common/SyncQueuePanel.tsx',
  'components/entrenador/alumnos/ModalInscripcionAlumno.tsx',
  'components/entrenador/alumnos/ModalEnlaceCaptacion.tsx',
  'components/common/DialogoConfirmacion.tsx',
  'components/atleta/entrenamiento/ModalVideoTecnica.tsx',
  'components/common/DialogoLogoutPendientes.tsx',
  'components/entrenador/SelectorPlantillaAsignacion.tsx',
  'components/atleta/pagos/ModalComprobantePago.tsx',
  'components/entrenador/AsignacionMasivaPlantilla.tsx',
  'components/entrenador/alumno-detalle/ModalControlAntropometrico.tsx',
  'components/entrenador/alumno-detalle/ModalCobroSala.tsx',
  'components/entrenador/alumno-detalle/ModalRutinaSemanal.tsx',
  'components/entrenador/cartera/ModalRecordatorioCartera.tsx',
  'components/entrenador/cartera/ModalCobroCartera.tsx',
  'components/entrenador/conciliacion/ModalRechazoConciliacion.tsx',
  'components/entrenador/conciliacion/VisorComprobanteConciliacion.tsx',
  'components/entrenador/panel-nutricion-alumno/EditorMetasNutricion.tsx',
  'components/entrenador/monitor-adherencia/ModalActividadAlumno.tsx',
  'components/entrenador/plantillas/ModalPlantilla.tsx',
];

const PAGINAS_SIN_ANIMATE_IN = [
  'pages/entrenador/AlumnoDetallePage.tsx',
  'pages/entrenador/AlumnosPage.tsx',
  'pages/atleta/PagosPage.tsx',
  'pages/atleta/ProgresoPage.tsx',
  'pages/entrenador/PlantillasPage.tsx',
  'pages/entrenador/MonitorAdherenciaPage.tsx',
  'pages/admin/AdminPage.tsx',
];

describe('Guardián · salida animada de modales (contrato D)', () => {
  describe('D1: cada modal integra useSalidaModal', () => {
    it.each(ARCHIVOS_MODALES)('%s contiene useSalidaModal', (archivoRelativo) => {
      const contenido = leerArchivoSrc(archivoRelativo);
      expect(contenido).toContain('useSalidaModal');
    });
  });

  describe('D2: cada modal aplica CLASES_SALIDA_MODAL y data-saliendo', () => {
    it.each(ARCHIVOS_MODALES)('%s contiene CLASES_SALIDA_MODAL y data-saliendo', (archivoRelativo) => {
      const contenido = leerArchivoSrc(archivoRelativo);
      expect(contenido).toContain('CLASES_SALIDA_MODAL');
      expect(contenido).toContain('data-saliendo');
    });
  });

  describe('D3: páginas con modales no confinan fixed (no contienen animate-in ni animate-fade-in; entrada delegada a EntradaVista)', () => {
    it.each(PAGINAS_SIN_ANIMATE_IN)('%s no contiene animate-in ni animate-fade-in', (paginaRelativa) => {
      const contenido = leerArchivoSrc(paginaRelativa);
      expect(contenido).not.toContain('animate-in');
      expect(contenido).not.toContain('animate-fade-in');
    });
  });
});
