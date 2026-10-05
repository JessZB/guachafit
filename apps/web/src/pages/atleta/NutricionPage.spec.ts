/**
 * Módulo 3 · Nutrición (pantalla del alumno): smoke tests de render.
 *
 * Sin jsdom (el repo no tiene testing-library): se rinde a string en Node con
 * `react-dom/server`. Los efectos no corren, así que el HTML refleja el primer render: el
 * formulario recién abierto, sin reporte cargado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NutricionPage } from './NutricionPage';
import { ETIQUETA_SEMAFORO } from '../../lib/nutricion-checkin';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, isDemoMode: false }),
}));

beforeAll(() => {
  // 19:00 locales: dentro de la ventana del reporte, para ver el formulario habilitado.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 21, 19, 0, 0));
});

afterAll(() => {
  vi.useRealTimers();
});

function renderPagina(): string {
  return renderToStaticMarkup(createElement(NutricionPage));
}

/**
 * Tamaños de texto arbitrarios por debajo de 12px (`text-[11px]`, `text-[11.5px]`,
 * `text-[0.7rem]`…). Los tamaños de la escala de Tailwind (`text-xs` = 12px) no cuentan.
 */
function tamanosMenoresA12px(texto: string): string[] {
  const menores: string[] = [];
  for (const [clase, valor, unidad] of texto.matchAll(/text-\[(\d*\.?\d+)(px|rem)\]/g)) {
    const px = unidad === 'rem' ? Number(valor) * 16 : Number(valor);
    if (px < 12) menores.push(clase);
  }
  return menores;
}

describe('tamanosMenoresA12px (detector del test de tamaños)', () => {
  it('detecta px enteros o decimales y rem por debajo de 0.75rem', () => {
    expect(
      tamanosMenoresA12px(
        'text-[10px] text-[11.5px] text-[0.7rem] text-[.5rem] text-[12px] text-[0.75rem] text-xs'
      )
    ).toEqual(['text-[10px]', 'text-[11.5px]', 'text-[0.7rem]', 'text-[.5rem]']);
  });
});

describe('NutricionPage · semáforo del día', () => {
  it('es un grupo con nombre accesible y ningún color viene preseleccionado', () => {
    const html = renderPagina();

    expect(html).toMatch(/<fieldset[^>]*>[\s\S]*<legend[^>]*>¿Cómo te fue hoy con tu plan\?<\/legend>/);
    expect(html).toContain(`>${ETIQUETA_SEMAFORO}</legend>`);
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(3);
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('Guardar queda habilitado sin color elegido (el error aparece al pulsarlo)', () => {
    const html = renderPagina();

    const boton = html.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Guardar reporte nutricional/)?.[0];
    expect(boton).toBeDefined();
    // Atributo `disabled` en la etiqueta de apertura (no las variantes `disabled:` de Tailwind).
    expect(boton).not.toMatch(/^<button[^>]*\sdisabled=""/);
    expect(html).not.toContain('para poder guardar');
  });

  it('usa los textos nuevos y no los anteriores', () => {
    const html = renderPagina();

    expect(html).toContain('Reporte de hoy');
    expect(html).toContain('Seguí mi plan (90 % o más)');
    expect(html).toContain('Agua, calorías y proteína (opcional)');
    expect(html).not.toContain('Reporte Diario Ágil');
    expect(html).not.toContain('100% en macros');
    expect(html).not.toContain('Nivel de Apego al Plan Hoy');
    expect(html).not.toContain('Hidratación y Macros Rápidos');
    expect(html).not.toMatch(/servidor/i);
  });
});

describe('NutricionPage · formulario', () => {
  it('Agua, Calorías, Proteína y Notas tienen su label asociado', () => {
    const html = renderPagina();

    for (const id of ['nutricion-agua', 'nutricion-calorias', 'nutricion-proteina', 'nutricion-notas']) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('no usa textos de menos de 12px', () => {
    expect(tamanosMenoresA12px(renderPagina())).toEqual([]);
  });
});
