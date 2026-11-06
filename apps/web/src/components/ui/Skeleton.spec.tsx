// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('Skeleton · Contrato B', () => {
  it('renderiza un <div> con aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    const elemento = container.firstElementChild as HTMLElement;

    expect(elemento).not.toBeNull();
    expect(elemento.tagName).toBe('DIV');
    expect(elemento.getAttribute('aria-hidden')).toBe('true');
  });
});
