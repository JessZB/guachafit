import { describe, it, expect } from 'vitest';
import {
  calcularTotalPaginas,
  clampPagina,
  rangoPaginas,
  rebanarPagina,
  offsetPaginaDescendente,
  limitePaginaDescendente,
  textoPaginacion,
  MAXIMO_ELEMENTOS_RANGO_PAGINAS,
} from './paginacion';

describe('paginacion (WU25a: lógica pura de la paginación numerada)', () => {
  describe('calcularTotalPaginas', () => {
    it('redondea hacia arriba y nunca baja de 1 página', () => {
      expect(calcularTotalPaginas(0, 25)).toBe(1);
      expect(calcularTotalPaginas(1, 25)).toBe(1);
      expect(calcularTotalPaginas(25, 25)).toBe(1);
      expect(calcularTotalPaginas(26, 25)).toBe(2);
      expect(calcularTotalPaginas(100, 25)).toBe(4);
      expect(calcularTotalPaginas(101, 25)).toBe(5);
    });

    it('tolera totales y tamaños inválidos sin dividir por cero', () => {
      expect(calcularTotalPaginas(Number.NaN, 25)).toBe(1);
      expect(calcularTotalPaginas(50, 0)).toBe(50);
      expect(calcularTotalPaginas(50, -10)).toBe(50);
      expect(calcularTotalPaginas(50, Number.NaN)).toBe(50);
    });
  });

  describe('clampPagina', () => {
    it('mantiene la página dentro del rango válido', () => {
      expect(clampPagina(1, 5)).toBe(1);
      expect(clampPagina(3, 5)).toBe(3);
      expect(clampPagina(9, 5)).toBe(5);
      expect(clampPagina(0, 5)).toBe(1);
      expect(clampPagina(-4, 5)).toBe(1);
    });

    it('normaliza entradas inválidas y totales vacíos a la página 1', () => {
      expect(clampPagina(Number.NaN, 5)).toBe(1);
      expect(clampPagina(2.9, 5)).toBe(2);
      expect(clampPagina(7, 0)).toBe(1);
    });
  });

  describe('rangoPaginas', () => {
    it('devuelve todas las páginas cuando caben en la ventana', () => {
      expect(rangoPaginas(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(rangoPaginas(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('centra la ventana con elipsis: 1 … 4 5 6 … 20', () => {
      expect(rangoPaginas(5, 20)).toEqual([1, 'elipsis', 4, 5, 6, 'elipsis', 20]);
    });

    it('rellena la ventana desde los extremos sin elipsis redundantes', () => {
      expect(rangoPaginas(1, 20)).toEqual([1, 2, 3, 4, 'elipsis', 20]);
      expect(rangoPaginas(2, 20)).toEqual([1, 2, 3, 4, 'elipsis', 20]);
      expect(rangoPaginas(19, 20)).toEqual([1, 'elipsis', 17, 18, 19, 20]);
      expect(rangoPaginas(20, 20)).toEqual([1, 'elipsis', 17, 18, 19, 20]);
    });

    it('clampa la página activa y respeta un máximo pequeño', () => {
      expect(rangoPaginas(99, 20)).toEqual([1, 'elipsis', 17, 18, 19, 20]);
      expect(rangoPaginas(3, 20, 5)).toEqual([1, 'elipsis', 3, 'elipsis', 20]);
      // El máximo nunca baja del mínimo razonable (5).
      expect(rangoPaginas(3, 20, 2)).toEqual([1, 'elipsis', 3, 'elipsis', 20]);
    });

    it('una sola página no produce elipsis y el máximo por defecto es 7', () => {
      expect(rangoPaginas(1, 1)).toEqual([1]);
      expect(MAXIMO_ELEMENTOS_RANGO_PAGINAS).toBe(7);
    });
  });

  describe('rebanarPagina', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];

    it('corta la página con la misma aritmética del offset del servidor', () => {
      expect(rebanarPagina(items, 1, 3)).toEqual([1, 2, 3]);
      expect(rebanarPagina(items, 2, 3)).toEqual([4, 5, 6]);
      expect(rebanarPagina(items, 3, 3)).toEqual([7]);
      expect(rebanarPagina(items, 4, 3)).toEqual([]);
    });

    it('tolera tamaño inválido y páginas fuera de rango', () => {
      expect(rebanarPagina(items, 0, 3)).toEqual([1, 2, 3]);
      expect(rebanarPagina(items, Number.NaN, 3)).toEqual([1, 2, 3]);
      expect(rebanarPagina(items, 1, 0)).toEqual([1]);
    });
  });

  describe('offsetPaginaDescendente', () => {
    it('traduce la página visible (más reciente primero) al offset de la serie ascendente', () => {
      // 25 registros, páginas de 10: la visible 1 son los últimos 10 (offset 15) y la 3 es la
      // parcial con los 5 más antiguos.
      expect(offsetPaginaDescendente(1, 10, 25)).toBe(15);
      expect(offsetPaginaDescendente(2, 10, 25)).toBe(5);
      expect(offsetPaginaDescendente(3, 10, 25)).toBe(0);
    });

    it('con total exactamente divisible no repite ni salta registros', () => {
      expect(offsetPaginaDescendente(1, 10, 30)).toBe(20);
      expect(offsetPaginaDescendente(2, 10, 30)).toBe(10);
      expect(offsetPaginaDescendente(3, 10, 30)).toBe(0);
    });

    it('con total no divisible la primera página visible queda llena y la última es la parcial', () => {
      // 27 registros => página visible 1 = registros 18–27 (offset 17); la 3 = 1–7 (offset 0).
      expect(offsetPaginaDescendente(1, 10, 27)).toBe(17);
      expect(offsetPaginaDescendente(2, 10, 27)).toBe(7);
      expect(offsetPaginaDescendente(3, 10, 27)).toBe(0);
    });

    it('recorrer todas las páginas con offset + límite cubre la serie exactamente una vez', () => {
      const serie = Array.from({ length: 25 }, (_valor, indice) => indice + 1);
      const totalPaginas = calcularTotalPaginas(serie.length, 10);
      const vistos: number[] = [];
      for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
        const offset = offsetPaginaDescendente(pagina, 10, serie.length);
        const limite = limitePaginaDescendente(pagina, 10, serie.length);
        vistos.push(...serie.slice(offset, offset + limite).reverse());
      }
      expect(vistos).toHaveLength(serie.length);
      expect(new Set(vistos).size).toBe(serie.length);
      // La primera página visible trae el más reciente y la última, el más antiguo.
      expect(vistos[0]).toBe(25);
      expect(vistos[vistos.length - 1]).toBe(1);
    });

    it('una serie que cabe en una página siempre usa offset 0', () => {
      expect(offsetPaginaDescendente(1, 10, 0)).toBe(0);
      expect(offsetPaginaDescendente(1, 10, 7)).toBe(0);
      expect(offsetPaginaDescendente(1, 10, 10)).toBe(0);
    });

    it('clampa páginas fuera de rango y tolera entradas inválidas', () => {
      expect(offsetPaginaDescendente(99, 10, 25)).toBe(0);
      expect(offsetPaginaDescendente(0, 10, 25)).toBe(15);
      expect(offsetPaginaDescendente(Number.NaN, 10, 25)).toBe(15);
      expect(offsetPaginaDescendente(1, 0, 5)).toBe(4);
    });
  });

  describe('limitePaginaDescendente', () => {
    it('llena las páginas visibles y deja parcial la ÚLTIMA (sin repetir la anterior)', () => {
      expect(limitePaginaDescendente(1, 10, 25)).toBe(10);
      expect(limitePaginaDescendente(2, 10, 25)).toBe(10);
      expect(limitePaginaDescendente(3, 10, 25)).toBe(5);
    });

    it('con total divisible todas las páginas visibles van llenas', () => {
      expect(limitePaginaDescendente(1, 10, 30)).toBe(10);
      expect(limitePaginaDescendente(2, 10, 30)).toBe(10);
      expect(limitePaginaDescendente(3, 10, 30)).toBe(10);
    });

    it('una serie corta o vacía limita al total real', () => {
      expect(limitePaginaDescendente(1, 10, 0)).toBe(0);
      expect(limitePaginaDescendente(1, 10, 7)).toBe(7);
      expect(limitePaginaDescendente(1, 10, 10)).toBe(10);
    });

    it('clampa páginas fuera de rango y tolera entradas inválidas', () => {
      expect(limitePaginaDescendente(99, 10, 25)).toBe(5);
      expect(limitePaginaDescendente(0, 10, 25)).toBe(10);
      expect(limitePaginaDescendente(Number.NaN, 10, 25)).toBe(10);
      expect(limitePaginaDescendente(1, 0, 5)).toBe(1);
    });
  });

  describe('textoPaginacion', () => {
    it('compone "Página X de Y · N registros" con pluralización real', () => {
      expect(textoPaginacion(2, 4, 76)).toBe('Página 2 de 4 · 76 registros');
      expect(textoPaginacion(1, 1, 1)).toBe('Página 1 de 1 · 1 registro');
      expect(textoPaginacion(1, 1, 0)).toBe('Página 1 de 1 · 0 registros');
    });

    it('clampa la página mostrada al rango real', () => {
      expect(textoPaginacion(9, 4, 76)).toBe('Página 4 de 4 · 76 registros');
    });
  });
});
