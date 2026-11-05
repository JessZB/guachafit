// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EsqueletoPagina } from './esqueletos';

describe('EsqueletoPagina (preset) · Contrato 1', () => {
  it('raíz data-esqueleto="pagina", aria-hidden="true", sin role ni texto', () => {
    const { container } = render(<EsqueletoPagina />);
    const raiz = container.firstElementChild as HTMLElement;

    expect(raiz).not.toBeNull();
    expect(raiz.getAttribute('data-esqueleto')).toBe('pagina');
    expect(raiz.getAttribute('aria-hidden')).toBe('true');
    expect(raiz.getAttribute('role')).toBeNull();
    expect(container.querySelector('[role]')).toBeNull();
    expect(container.textContent?.trim()).toBe('');
  });

  it('contiene al menos 5 [data-esqueleto-bloque] (título, subtítulo y tres bloques de tarjeta/fila)', () => {
    const { container } = render(<EsqueletoPagina />);
    const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
    expect(bloques.length).toBeGreaterThanOrEqual(5);
  });
});
