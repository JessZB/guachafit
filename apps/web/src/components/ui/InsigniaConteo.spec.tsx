// @vitest-environment jsdom
/**
 * Spec 2 · InsigniaConteo.spec.tsx
 * Contratos IC1–IC3 para el componente de insignias con conteo accesible.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { InsigniaConteo } from './InsigniaConteo';

afterEach(() => {
  cleanup();
});

describe('InsigniaConteo', () => {
  it('IC1 · Sin dato o cero: con conteo null o 0 no renderiza nada', () => {
    const { container: containerNull } = render(
      <InsigniaConteo conteo={null} descripcion="5 por validar" />
    );
    expect(containerNull.firstChild).toBeNull();

    cleanup();

    const { container: containerCero } = render(
      <InsigniaConteo conteo={0} descripcion="0 por validar" />
    );
    expect(containerCero.firstChild).toBeNull();
  });

  it('IC2 · Con dato: visible "5" con aria-hidden y descripcion en sr-only', () => {
    const { container } = render(
      <InsigniaConteo conteo={5} descripcion="5 por validar" />
    );

    const visibleElement = container.querySelector('[aria-hidden="true"]');
    expect(visibleElement).not.toBeNull();
    expect(visibleElement?.textContent?.trim()).toBe('5');

    const srOnlyElement = container.querySelector('.sr-only');
    expect(srOnlyElement).not.toBeNull();
    expect(srOnlyElement?.textContent?.trim()).toBe('5 por validar');
  });

  it('IC3 · Tope: con conteo 150 el número visible es "99+" y la descripción tal cual', () => {
    const { container } = render(
      <InsigniaConteo conteo={150} descripcion="150 por validar" />
    );

    const visibleElement = container.querySelector('[aria-hidden="true"]');
    expect(visibleElement).not.toBeNull();
    expect(visibleElement?.textContent?.trim()).toBe('99+');

    const srOnlyElement = container.querySelector('.sr-only');
    expect(srOnlyElement).not.toBeNull();
    expect(srOnlyElement?.textContent?.trim()).toBe('150 por validar');
  });
});
