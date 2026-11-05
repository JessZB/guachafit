import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('index.html · viewport meta tag (contrato H)', () => {
  it('contiene en el meta viewport interactive-widget=resizes-content y conserva viewport-fit=cover y width=device-width', () => {
    expect(html).toBeTruthy();

    const matchViewport = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i)
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']viewport["']/i);

    expect(matchViewport).not.toBeNull();
    const contentValor = matchViewport![1];

    expect(contentValor).toContain('interactive-widget=resizes-content');
    expect(contentValor).toContain('viewport-fit=cover');
    expect(contentValor).toContain('width=device-width');
  });
});
