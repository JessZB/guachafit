import { describe, expect, it } from 'vitest';
import { obtenerUrlVideoEmbebible } from './entrenamiento-video';

describe('obtenerUrlVideoEmbebible', () => {
  it('convierte un watch de YouTube a youtube-nocookie', () => {
    expect(obtenerUrlVideoEmbebible('https://www.youtube.com/watch?v=abc123XYZ_-')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ_-'
    );
  });

  it('convierte un enlace corto youtu.be', () => {
    expect(obtenerUrlVideoEmbebible('https://youtu.be/abc123XYZ_-')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ_-'
    );
  });

  it('convierte un shorts de YouTube', () => {
    expect(obtenerUrlVideoEmbebible('https://www.youtube.com/shorts/abc123XYZ_-')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ_-'
    );
  });

  it('convierte un video numérico de Vimeo', () => {
    expect(obtenerUrlVideoEmbebible('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789'
    );
  });

  it('devuelve null para URLs no embebibles o inválidas', () => {
    expect(obtenerUrlVideoEmbebible('https://ejemplo.com/video.mp4')).toBeNull();
    expect(obtenerUrlVideoEmbebible('https://vimeo.com/no-numerico')).toBeNull();
    expect(obtenerUrlVideoEmbebible('no-es-url')).toBeNull();
  });
});
