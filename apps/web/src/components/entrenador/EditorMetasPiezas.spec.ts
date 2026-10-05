/**
 * Módulo 3 · Nutrición: piezas del editor de metas del entrenador (render a string, sin jsdom).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CampoMeta } from './CampoMeta';
import { FilaRecursoEditor } from './FilaRecursoEditor';
import { AvisosEditorMetas } from './AvisosEditorMetas';
import { filaRecursoVacia, type FilaRecursoFormulario } from '../../lib/recursos-pdf';
import { tamanosMenoresA12px } from './tamanos-texto.spec-helper';

const noop = () => undefined;

function renderFila(parcial: Partial<FilaRecursoFormulario> = {}): string {
  return renderToStaticMarkup(
    createElement(FilaRecursoEditor, {
      indice: 0,
      recurso: { ...filaRecursoVacia(), ...parcial },
      onCambiar: noop,
      onQuitar: noop,
      onSubirPdf: noop,
    })
  );
}

describe('CampoMeta', () => {
  it('asocia su label al input con htmlFor/id', () => {
    const html = renderToStaticMarkup(
      createElement(CampoMeta, {
        id: 'meta-calorias',
        etiqueta: 'Calorías (kcal)',
        valor: '',
        onChange: noop,
        placeholder: '2200',
      })
    );
    expect(html).toMatch(/<label[^>]*for="meta-calorias"[^>]*>Calorías \(kcal\)<\/label>/);
    expect(html).toMatch(/<input[^>]*id="meta-calorias"/);
  });
});

describe('FilaRecursoEditor', () => {
  it('el título y el enlace del recurso tienen label asociado', () => {
    const html = renderFila();
    for (const id of ['recurso-0-titulo', 'recurso-0-url']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('un PDF subido se describe como guardado en el espacio privado del alumno', () => {
    const html = renderFila({ titulo: 'Menú', storageKey: 'nutricion-recursos/a/1.pdf' });
    expect(html).toContain('espacio privado del alumno');
  });

  it('mientras sube el PDF lo anuncia con role="status"', () => {
    const html = renderFila({ titulo: 'Menú', subiendo: true });
    expect(html).toMatch(/role="status"[^>]*>[^<]*espacio privado del alumno/);
  });

  it('no muestra jerga ni textos de menos de 12px en ningún estado', () => {
    const html =
      renderFila() +
      renderFila({ storageKey: 'nutricion-recursos/a/1.pdf' }) +
      renderFila({ subiendo: true, errorSubida: 'No pudimos subir el archivo.' });
    expect(html).not.toMatch(/check-?in|servidor|bóveda|storage|\bAPI\b|RN-\d/i);
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});

describe('AvisosEditorMetas', () => {
  it('el éxito se anuncia con role="status"', () => {
    const html = renderToStaticMarkup(
      createElement(AvisosEditorMetas, { error: null, exito: 'Metas guardadas.' })
    );
    expect(html).toMatch(/<p[^>]*role="status"[^>]*>Metas guardadas\.<\/p>/);
  });

  it('el error se anuncia con role="alert"', () => {
    const html = renderToStaticMarkup(
      createElement(AvisosEditorMetas, { error: 'Algo falló.', exito: null })
    );
    expect(html).toMatch(/<p[^>]*role="alert"[^>]*>Algo falló\.<\/p>/);
  });
});
