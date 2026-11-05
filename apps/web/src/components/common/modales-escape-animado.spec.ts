import { describe, expect, it } from 'vitest';

const archivosSrc = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function leerArchivoSrc(rutaRelativa: string): string {
  const claveNormalizada = rutaRelativa.replace(/\\/g, '/');
  const claveSrc = `../../${claveNormalizada}`;
  const contenido =
    archivosSrc[claveSrc] ??
    archivosSrc[`../${claveNormalizada.replace(/^components\//, '')}`] ??
    archivosSrc[claveNormalizada];
  if (typeof contenido !== 'string') {
    throw new Error(`Archivo no encontrado en glob: ${rutaRelativa}`);
  }
  return contenido;
}

const ARCHIVOS_11_MODALES = [
  'components/atleta/entrenamiento/ModalFinalizarSesion.tsx',
  'components/atleta/entrenamiento/ModalCierreVacio.tsx',
  'components/atleta/entrenamiento/ModalVideoTecnica.tsx',
  'components/entrenador/alumnos/ModalInscripcionAlumno.tsx',
  'components/entrenador/alumnos/ModalEnlaceCaptacion.tsx',
  'components/entrenador/alumno-detalle/ModalCobroSala.tsx',
  'components/entrenador/alumno-detalle/ModalControlAntropometrico.tsx',
  'components/entrenador/alumno-detalle/ModalRutinaSemanal.tsx',
  'components/entrenador/cartera/ModalRecordatorioCartera.tsx',
  'components/entrenador/cartera/ModalCobroCartera.tsx',
  'components/entrenador/panel-nutricion-alumno/EditorMetasNutricion.tsx',
];

const ARCHIVOS_PADRES_HOOKS = [
  'components/atleta/entrenamiento/use-cierre-sesion.ts',
  'components/atleta/entrenamiento/use-video-tecnica.ts',
  'components/entrenador/cartera/useRecordatorioCartera.ts',
  'components/entrenador/cartera/useCobroCartera.ts',
  'components/entrenador/panel-nutricion-alumno/use-editor-metas-nutricion.ts',
  'pages/entrenador/AlumnosPage.tsx',
  'pages/entrenador/AlumnoDetallePage.tsx',
];

const ARCHIVOS_CALL_SITES = [
  'pages/atleta/EntrenamientoPage.tsx',
  'pages/entrenador/AlumnosPage.tsx',
  'pages/entrenador/AlumnoDetallePage.tsx',
  'pages/entrenador/CarteraPage.tsx',
  'components/entrenador/PanelNutricionAlumno.tsx',
];

describe('Guardián · escape animado en 11 modales (contrato estático)', () => {
  describe('E1: cada uno de los 11 modales contiene useDialogoAccesible y no expone refs en props', () => {
    it.each(ARCHIVOS_11_MODALES)(
      '%s integra useDialogoAccesible y prescinde de dialogRef/refDialogo/dialogoRef',
      (archivoRelativo) => {
        const contenido = leerArchivoSrc(archivoRelativo);
        expect(contenido).toContain('useDialogoAccesible');
        expect(contenido).not.toContain('dialogRef:');
        expect(contenido).not.toContain('refDialogo:');
        expect(contenido).not.toContain('dialogoRef:');
      }
    );
  });

  describe('E2: los padres y hooks ya no llaman a useDialogoAccesible', () => {
    it.each(ARCHIVOS_PADRES_HOOKS)(
      '%s no contiene useDialogoAccesible',
      (archivoRelativo) => {
        const contenido = leerArchivoSrc(archivoRelativo);
        expect(contenido).not.toContain('useDialogoAccesible');
      }
    );
  });

  describe('E3: los call sites no pasan referencias de diálogo (dialogRef/refDialogo/dialogoRef)', () => {
    it.each(ARCHIVOS_CALL_SITES)(
      '%s no pasa refs de diálogo a los modales',
      (archivoRelativo) => {
        const contenido = leerArchivoSrc(archivoRelativo);
        expect(contenido).not.toContain('dialogRef=');
        expect(contenido).not.toContain('refDialogo=');
        expect(contenido).not.toContain('dialogoRef=');
      }
    );
  });
});
