import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALIDAD_WEBP,
  LADO_MAXIMO_FOTO,
  calcularDimensionesEscaladas,
  comprimirImagenAWebp,
} from './imagen-comprimida';

describe('calcularDimensionesEscaladas (RF-002 RN-03: compresión en cliente, ADR-004)', () => {
  it('escala proporcionalmente cuando el lado mayor excede el máximo', () => {
    expect(calcularDimensionesEscaladas(4000, 3000)).toEqual({ ancho: 1920, alto: 1440 });
    expect(calcularDimensionesEscaladas(3000, 4000)).toEqual({ ancho: 1440, alto: 1920 });
  });

  it('no amplía una imagen que ya es más pequeña que el máximo', () => {
    expect(calcularDimensionesEscaladas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it('usa el máximo por defecto de 1920px y calidad WebP 85 %', () => {
    expect(calcularDimensionesEscaladas(9999, 10).ancho).toBe(LADO_MAXIMO_FOTO);
    expect(CALIDAD_WEBP).toBe(0.85);
  });

  it('nunca devuelve dimensiones 0 en una imagen extrema (lado mínimo 1px)', () => {
    expect(calcularDimensionesEscaladas(10000, 1)).toEqual({ ancho: 1920, alto: 1 });
  });

  it('devuelve 0×0 ante entradas inválidas en vez de fabricar dimensiones', () => {
    expect(calcularDimensionesEscaladas(0, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(Number.NaN, 100)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(100, -5)).toEqual({ ancho: 0, alto: 0 });
    expect(calcularDimensionesEscaladas(100, 100, 0)).toEqual({ ancho: 0, alto: 0 });
  });
});

type FuenteDecodificadaFalsa = { width: number; height: number; close: () => void };

/**
 * `createImageBitmap` no existe en el entorno `node`: se sustituye por una fuente decodificada
 * falsa de 100×100 para poder llegar al lienzo.
 */
function instalarDecodificadorFalso(): FuenteDecodificadaFalsa {
  const fuente: FuenteDecodificadaFalsa = { width: 100, height: 100, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => fuente));
  return fuente;
}

/**
 * `OffscreenCanvas` tampoco existe en `node`: se sustituye por una clase mínima cuyo
 * `convertToBlob` reproduce el caso a fijar (codificador WebP real, PNG degradado o sin
 * codificador). Devuelve los tipos pedidos para poder afirmar qué respaldo se intentó.
 */
function instalarCanvasFalso(opciones: {
  contextoDisponible?: boolean;
  convertToBlob?: (config: { type: string; quality?: number }) => Promise<Blob>;
}): { tiposConvertidos: string[] } {
  const tiposConvertidos: string[] = [];
  class OffscreenCanvasFalso {
    width: number;
    height: number;

    constructor(ancho: number, alto: number) {
      this.width = ancho;
      this.height = alto;
    }

    getContext(): { drawImage: () => void } | null {
      return opciones.contextoDisponible === false ? null : { drawImage: () => undefined };
    }

    convertToBlob(config: { type: string; quality?: number }): Promise<Blob> {
      tiposConvertidos.push(config.type);
      if (!opciones.convertToBlob) {
        return Promise.reject(new Error(`sin codificador ${config.type}`));
      }
      return opciones.convertToBlob(config);
    }
  }
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasFalso);
  return { tiposConvertidos };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('comprimirImagenAWebp (premisa del guard EXIF de RNF-001: identidad en las rutas de degradación)', () => {
  it('sin contexto 2D devuelve el MISMO objeto File de entrada', async () => {
    instalarDecodificadorFalso();
    instalarCanvasFalso({ contextoDisponible: false });
    const archivo = new File(['foto'], 'progreso.jpg', { type: 'image/jpeg' });

    await expect(comprimirImagenAWebp(archivo)).resolves.toBe(archivo);
  });

  it('sin codificador WebP ni JPEG devuelve el MISMO objeto File de entrada', async () => {
    instalarDecodificadorFalso();
    const { tiposConvertidos } = instalarCanvasFalso({});
    const archivo = new File(['foto'], 'progreso.jpg', { type: 'image/jpeg' });

    await expect(comprimirImagenAWebp(archivo)).resolves.toBe(archivo);
    // Intentó WebP y, sin WebP real, el respaldo JPEG: ambos rechazaron por falta de codificador.
    expect(tiposConvertidos).toEqual(['image/webp', 'image/jpeg']);
  });

  it('si el codificador WebP entrega un PNG (Safari) usa el respaldo JPEG: File nuevo image/jpeg .jpg', async () => {
    instalarDecodificadorFalso();
    const { tiposConvertidos } = instalarCanvasFalso({
      convertToBlob: async ({ type }) =>
        type === 'image/webp'
          ? new Blob(['png'], { type: 'image/png' })
          : new Blob(['jpeg'], { type: 'image/jpeg' }),
    });
    const archivo = new File(['foto'], 'captura.png', { type: 'image/png' });

    const resultado = await comprimirImagenAWebp(archivo);

    expect(resultado).not.toBe(archivo);
    expect(resultado.type).toBe('image/jpeg');
    expect(resultado.name).toBe('captura.jpg');
    expect(tiposConvertidos).toEqual(['image/webp', 'image/jpeg']);
  });

  it('con un WebP real el resultado es un File image/webp y no toca el respaldo JPEG', async () => {
    instalarDecodificadorFalso();
    const { tiposConvertidos } = instalarCanvasFalso({
      convertToBlob: async ({ type }) =>
        type === 'image/webp'
          ? new Blob(['webp'], { type: 'image/webp' })
          : new Blob(['jpeg'], { type: 'image/jpeg' }),
    });
    const archivo = new File(['foto'], 'progreso.webp', { type: 'image/webp' });

    const resultado = await comprimirImagenAWebp(archivo);

    expect(resultado).not.toBe(archivo);
    expect(resultado.type).toBe('image/webp');
    expect(resultado.name).toBe('progreso.webp');
    expect(tiposConvertidos).toEqual(['image/webp']);
  });
});
