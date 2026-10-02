import { describe, expect, it, vi } from 'vitest';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA, mostrarAccesoDemo } from './acceso-ui';

describe('acceso-ui: portapapeles con respaldo (C5)', () => {
  it('devuelve true cuando el navegador copia', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copiarAlPortapapeles('hola', { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hola');
  });

  it('devuelve false si el navegador rechaza la copia', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    await expect(copiarAlPortapapeles('hola', { writeText })).resolves.toBe(false);
  });

  it('devuelve false si no hay API de portapapeles', async () => {
    await expect(copiarAlPortapapeles('hola', undefined)).resolves.toBe(false);
  });

  it('expone el aviso para copiar a mano', () => {
    expect(MENSAJE_COPIA_FALLIDA).toBe('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
  });
});

describe('acceso-ui: acceso de demostración (C3)', () => {
  it('solo se muestra en desarrollo o con VITE_DEMO=true', () => {
    expect(mostrarAccesoDemo({ DEV: true })).toBe(true);
    expect(mostrarAccesoDemo({ DEV: false, VITE_DEMO: 'true' })).toBe(true);
    expect(mostrarAccesoDemo({ DEV: false, VITE_DEMO: 'false' })).toBe(false);
    expect(mostrarAccesoDemo({ DEV: false })).toBe(false);
  });
});
