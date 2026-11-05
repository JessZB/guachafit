// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  EsqueletoTarjetasKpi,
  EsqueletoListaFilas,
  EsqueletoRejillaTarjetas,
  EsqueletoFormulario,
  EsqueletoCabeceraPestanas,
} from './esqueletos';

describe('esqueletos (presets) · Contrato C', () => {
  describe('EsqueletoTarjetasKpi', () => {
    it('raíz data-esqueleto="tarjetas-kpi", aria-hidden="true", sin role="status" ni texto', () => {
      const { container } = render(<EsqueletoTarjetasKpi />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('tarjetas-kpi');
      expect(raiz.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
    });

    it('rejilla grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 y 4 bloques por defecto', () => {
      const { container } = render(<EsqueletoTarjetasKpi />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.className).toContain('grid-cols-1');
      expect(raiz.className).toContain('sm:grid-cols-2');
      expect(raiz.className).toContain('lg:grid-cols-4');

      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques).toHaveLength(4);
    });

    it('respeta la prop cantidad (ej. cantidad=3)', () => {
      const { container } = render(<EsqueletoTarjetasKpi cantidad={3} />);
      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques).toHaveLength(3);
    });
  });

  describe('EsqueletoListaFilas', () => {
    it('raíz data-esqueleto="lista-filas", aria-hidden="true", sin role="status" ni texto', () => {
      const { container } = render(<EsqueletoListaFilas />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('lista-filas');
      expect(raiz.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
    });

    it('4 bloques por defecto y admite filas personalizadas', () => {
      const { container: cDefecto } = render(<EsqueletoListaFilas />);
      expect(cDefecto.querySelectorAll('[data-esqueleto-bloque]')).toHaveLength(4);

      const { container: cCustom } = render(<EsqueletoListaFilas filas={2} />);
      expect(cCustom.querySelectorAll('[data-esqueleto-bloque]')).toHaveLength(2);
    });

    it('admite conAvatar=true manteniendo ausencia de role="status" y de texto', () => {
      const { container } = render(<EsqueletoListaFilas conAvatar filas={3} />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('lista-filas');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
      expect(container.querySelectorAll('[data-esqueleto-bloque]')).toHaveLength(3);
    });
  });

  describe('EsqueletoRejillaTarjetas', () => {
    it('raíz data-esqueleto="rejilla-tarjetas", aria-hidden="true", sin role="status" ni texto', () => {
      const { container } = render(<EsqueletoRejillaTarjetas />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('rejilla-tarjetas');
      expect(raiz.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
    });

    it('rejilla md:grid-cols-2 xl:grid-cols-3 y 6 bloques por defecto', () => {
      const { container } = render(<EsqueletoRejillaTarjetas />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.className).toContain('md:grid-cols-2');
      expect(raiz.className).toContain('xl:grid-cols-3');

      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques).toHaveLength(6);
    });

    it('respeta la prop cantidad (ej. cantidad=3)', () => {
      const { container } = render(<EsqueletoRejillaTarjetas cantidad={3} />);
      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques).toHaveLength(3);
    });
  });

  describe('EsqueletoFormulario', () => {
    it('raíz data-esqueleto="formulario", aria-hidden="true", sin role="status" ni texto', () => {
      const { container } = render(<EsqueletoFormulario />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('formulario');
      expect(raiz.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
    });

    it('campos=4 por defecto produce 4 bloques de campos + 1 bloque de botón (5 bloques en total)', () => {
      const { container } = render(<EsqueletoFormulario />);
      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      // 4 campos + 1 botón = 5 bloques
      expect(bloques).toHaveLength(5);
    });

    it('campos=3 produce 3 campos + 1 botón (4 bloques en total)', () => {
      const { container } = render(<EsqueletoFormulario campos={3} />);
      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques).toHaveLength(4);
    });
  });

  describe('EsqueletoCabeceraPestanas', () => {
    it('raíz data-esqueleto="cabecera-pestanas", aria-hidden="true", sin role="status" ni texto', () => {
      const { container } = render(<EsqueletoCabeceraPestanas />);
      const raiz = container.firstElementChild as HTMLElement;

      expect(raiz.getAttribute('data-esqueleto')).toBe('cabecera-pestanas');
      expect(raiz.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.textContent?.trim()).toBe('');
    });

    it('contiene al menos 3 bloques repetibles (cabecera, franja de chips y barra de pestañas)', () => {
      const { container } = render(<EsqueletoCabeceraPestanas />);
      const bloques = container.querySelectorAll('[data-esqueleto-bloque]');
      expect(bloques.length).toBeGreaterThanOrEqual(3);
    });
  });
});
