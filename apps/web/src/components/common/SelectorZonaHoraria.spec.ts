/**
 * Lote F3 · Selector de zona horaria del perfil (RF-002 RN-02 / ADR-019): render a string en
 * entorno Node, sin jsdom. La interacción de cambio se cubrirá en la guía manual.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectorZonaHoraria } from './SelectorZonaHoraria';
import { nombreZonaHoraria } from '../../lib/zona-horaria';
import { tamanosMenoresA12px } from '../entrenador/tamanos-texto.spec-helper';

const noop = () => undefined;
const ZONAS = ['America/Caracas', 'Europe/Madrid'];

function render(parcial: Partial<Parameters<typeof SelectorZonaHoraria>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SelectorZonaHoraria, {
      id: 'zona-horaria-perfil',
      valor: 'America/Caracas',
      opciones: ZONAS,
      onCambiar: noop,
      onGuardar: noop,
      ...parcial,
    })
  );
}

function opcionesDe(html: string): string[] {
  return html.match(/<option\b[^>]*>[^<]*<\/option>/g) ?? [];
}

function botonesDe(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

function selectsDe(html: string): string[] {
  return html.match(/<select\b[^>]*>/g) ?? [];
}

describe('SelectorZonaHoraria', () => {
  it('asocia la etiqueta al select y ofrece una opción por zona con su nombre humano', () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*for="zona-horaria-perfil"[^>]*>Zona horaria<\/label>/);
    expect(html).toMatch(/<select[^>]*id="zona-horaria-perfil"[^>]*>/);

    const opciones = opcionesDe(html);
    expect(opciones).toHaveLength(ZONAS.length);
    for (const zona of ZONAS) {
      expect(
        opciones.some(
          (tag) =>
            tag.includes(`value="${zona}"`) && tag.includes(`>${nombreZonaHoraria(zona)}</option>`)
        ),
        `falta la opción ${zona}`
      ).toBe(true);
    }
  });

  it('la opción del valor actual aparece seleccionada', () => {
    const opciones = opcionesDe(render({ valor: 'Europe/Madrid' }));
    const madrid = opciones.find((tag) => tag.includes('value="Europe/Madrid"'));
    const caracas = opciones.find((tag) => tag.includes('value="America/Caracas"'));
    expect(madrid).toBeDefined();
    expect(madrid).toContain('selected');
    expect(caracas).toBeDefined();
    expect(caracas).not.toContain('selected');
  });

  it('el botón "Guardar zona horaria" tiene 44px y se deshabilita mientras guarda', () => {
    const enReposo = botonesDe(render()).find((tag) => tag.includes('Guardar zona horaria'));
    expect(enReposo).toBeDefined();
    expect(enReposo).toContain('min-h-11');
    expect(enReposo).not.toContain('disabled');

    const guardando = botonesDe(render({ guardando: true })).find((tag) =>
      tag.includes('Guardar zona horaria')
    );
    expect(guardando).toBeDefined();
    expect(guardando).toContain('disabled');
  });

  it('el <select> también se deshabilita mientras guarda (sin cambios en vuelo)', () => {
    const enReposo = selectsDe(render());
    expect(enReposo).toHaveLength(1);
    expect(enReposo[0]).not.toContain('disabled');

    const guardando = selectsDe(render({ guardando: true }));
    expect(guardando).toHaveLength(1);
    expect(guardando[0]).toContain('disabled');
  });

  it('el error se anuncia con role="alert" y el éxito con role="status"', () => {
    const conError = render({ error: 'No pudimos guardar la zona horaria.' });
    expect(conError).toContain('role="alert"');
    expect(conError).toContain('No pudimos guardar la zona horaria.');

    const conExito = render({ exito: 'Zona horaria guardada.' });
    expect(conExito).toContain('role="status"');
    expect(conExito).toContain('Zona horaria guardada.');
  });

  it('no muestra tamaños de texto por debajo de 12px en ningún estado', () => {
    const html =
      render() +
      render({ guardando: true }) +
      render({ error: 'No pudimos guardar la zona horaria.' }) +
      render({ exito: 'Zona horaria guardada.' });
    expect(tamanosMenoresA12px(html)).toEqual([]);
  });
});
