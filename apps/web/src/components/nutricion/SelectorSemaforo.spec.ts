/**
 * Módulo 3 · Nutrición: semáforo del día (render a string en Node).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemaforoNutricional } from '@guachafit/shared';
import { SelectorSemaforo } from './SelectorSemaforo';
import { ETIQUETA_SEMAFORO, MENSAJE_ELIGE_SEMAFORO } from '../../lib/nutricion-checkin';

function render(props: Partial<Parameters<typeof SelectorSemaforo>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(SelectorSemaforo, {
      valor: null,
      onCambiar: () => undefined,
      deshabilitado: false,
      error: null,
      ...props,
    })
  );
}

function contar(html: string, patron: RegExp): number {
  return html.match(patron)?.length ?? 0;
}

describe('SelectorSemaforo', () => {
  it('es un grupo con nombre que puede recibir el foco y sin color elegido', () => {
    const html = render();
    expect(html).toMatch(/<fieldset[^>]*tabindex="-1"[^>]*>/);
    expect(html).toContain(`>${ETIQUETA_SEMAFORO}</legend>`);
    expect(contar(html, /aria-pressed="false"/g)).toBe(3);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('Seguí mi plan (90 % o más)');
  });

  it('anuncia la opción elegida', () => {
    const html = render({ valor: SemaforoNutricional.PARCIAL });
    expect(contar(html, /aria-pressed="true"/g)).toBe(1);
  });

  it('el error se muestra junto al grupo como alerta y queda asociado', () => {
    const html = render({ error: MENSAJE_ELIGE_SEMAFORO });
    expect(html).toMatch(/<fieldset[^>]*aria-describedby="semaforo-error"/);
    expect(html).toMatch(
      /<p id="semaforo-error" role="alert"[^>]*>Elige cómo te fue hoy con tu plan\.<\/p>/
    );
  });
});
