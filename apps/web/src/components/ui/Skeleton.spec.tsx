// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as SkeletonModule from './Skeleton';
import { Skeleton } from './Skeleton';

describe('Skeleton · Contrato B', () => {
  it('se exporta como export nombrado único', () => {
    expect(SkeletonModule.Skeleton).toBeDefined();
    expect(typeof SkeletonModule.Skeleton).toBe('function');
    expect((SkeletonModule as { default?: unknown }).default).toBeUndefined();
  });

  it('renderiza un <div> con aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    const elemento = container.firstElementChild as HTMLElement;

    expect(elemento).not.toBeNull();
    expect(elemento.tagName).toBe('DIV');
    expect(elemento.getAttribute('aria-hidden')).toBe('true');
  });

  it('no contiene ningún texto en su interior', () => {
    const { container } = render(<Skeleton />);
    expect(container.textContent).toBe('');
  });

  it('incluye las clases animate-pulse y un fondo bg-secondary', () => {
    const { container } = render(<Skeleton />);
    const elemento = container.firstElementChild as HTMLElement;

    expect(elemento.className).toContain('animate-pulse');
    expect(elemento.className).toMatch(/bg-secondary(\/|\s|$)/);
  });

  it('combina y aplica className personalizada', () => {
    const { container } = render(<Skeleton className="h-8 w-48 rounded-xl" />);
    const elemento = container.firstElementChild as HTMLElement;

    expect(elemento.className).toContain('h-8');
    expect(elemento.className).toContain('w-48');
    expect(elemento.className).toContain('rounded-xl');
    expect(elemento.className).toContain('animate-pulse');
  });
});
