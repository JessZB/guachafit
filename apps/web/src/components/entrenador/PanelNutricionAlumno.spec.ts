/**
 * Módulo 3 · Nutrición (panel del entrenador): smoke tests de render sin jsdom.
 *
 * Los efectos no corren con `react-dom/server`: el HTML refleja el primer render, con las metas
 * aún sin cargar. Las piezas del editor tienen sus propios specs y la lógica (validación,
 * decisiones al guardar y al cerrar) vive en `lib/editor-metas-nutricion.ts`.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Fuente cruda (Vite `?raw`): cubre clases de estados que el render inicial no alcanza.
import FUENTE_PANEL from './PanelNutricionAlumno.tsx?raw';
import FUENTE_CAMPO from './CampoMeta.tsx?raw';
import FUENTE_FILA from './FilaRecursoEditor.tsx?raw';
import FUENTE_AVISOS from './AvisosEditorMetas.tsx?raw';
import { PanelNutricionAlumno } from './PanelNutricionAlumno';
import { tamanosMenoresA12px } from './tamanos-texto.spec-helper';

function renderPanel(): string {
  return renderToStaticMarkup(
    createElement(PanelNutricionAlumno, {
      alumnoUsuarioId: 'alumno-1',
      isDemoMode: true,
    })
  );
}

describe('PanelNutricionAlumno · editor bloqueado hasta conocer las metas guardadas', () => {
  it('antes de cargar las metas, el botón del editor está deshabilitado y lo explica', () => {
    const html = renderPanel();
    const boton = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Definir metas/)?.[0];
    expect(boton).toBeDefined();
    expect(boton).toMatch(/^<button[^>]*\sdisabled=""/);
    expect(boton).toMatch(/aria-describedby="metas-edicion-motivo"/);
    expect(html).toMatch(/id="metas-edicion-motivo"[^>]*>Espera a que carguen las metas\.</);
  });
});

describe('PanelNutricionAlumno · textos', () => {
  it('no usa textos de menos de 12px en ningún estado del panel ni del editor', () => {
    for (const fuente of [FUENTE_PANEL, FUENTE_CAMPO, FUENTE_FILA, FUENTE_AVISOS]) {
      expect(tamanosMenoresA12px(fuente)).toEqual([]);
    }
    expect(tamanosMenoresA12px(renderPanel())).toEqual([]);
  });

  it('no muestra jerga, códigos de reglas ni la palabra "check-in"', () => {
    expect(renderPanel()).not.toMatch(/check-?in|servidor|bóveda|storage|\bAPI\b|RN-\d/i);
  });
});
