// @vitest-environment jsdom
/**
 * 01 · UX-07b · CabeceraYFiltrosCartera: pestañas, buscador, KPI y cabecera (Contratos B, C, D).
 *
 * Requisitos:
 * - Contrato B (PestanasCartera):
 *   - B1: tablist "Estados de cartera" incluye grid y grid-cols-4, y no incluye flex-wrap.
 *   - B2: 4 tabs en orden con texto visible corto "Mora", "Por vencer", "Revisión" y "Al día", con contadores (3, 2, 1, 7).
 *   - B3: nombres accesibles exactos: "En mora, 3", "Próximos a vencer, 2", "Pendiente de revisión, 1", "Al día, 7".
 *   - B4: pulsar "Por vencer" llama a onCambiar('por_vencer') y el tabpanel sigue enlazado por aria-labelledby.
 *   - B5: el texto de criterio de la pestaña activa sigue visible.
 * - Contrato C (BuscadorCartera):
 *   - C1: con visibles=3, total=3 y pestaña mora, texto exacto "3 registros · En mora", en elemento con aria-live="polite", sin "Mostrando" ni "en En".
 *   - C2: con total=1, texto exacto "1 registro · En mora".
 *   - C3: con isLoading, texto "Cargando cartera...".
 *   - C4: buscador (searchbox "Buscar alumno por nombre") incluye min-h-11, text-base, sm:text-sm y autocomplete="off".
 * - Contrato D (CabeceraCartera y ResumenCartera):
 *   - D1: enlace "Bandeja de validación" incluye min-h-11, focus-visible:outline-2 y focus-visible:outline-primary.
 *   - D2: enlace a "Pagos por Validar" en ResumenCartera incluye focus-visible:outline-2, focus-visible:outline-primary y to="/coach/conciliacion".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PestanaCarteraDTO, ResumenCarteraDTO } from '@guachafit/shared';
import { PESTANAS_CARTERA } from '../../../lib/cartera';
import { PestanasCartera } from './PestanasCartera';
import { BuscadorCartera } from './BuscadorCartera';
import { CabeceraCartera } from './CabeceraCartera';
import { ResumenCartera } from './ResumenCartera';

afterEach(() => {
  cleanup();
});

function fixtureResumen(overrides: Partial<ResumenCarteraDTO> = {}): ResumenCarteraDTO {
  return {
    recaudadoMesUsd: '1500.00',
    totalEnMoraUsd: '450.00',
    totalPorVencerUsd: '200.00',
    alumnosEnMora: 3,
    proximosAVencer: 2,
    pagosPorValidar: 1,
    tasaVigente: '45.00',
    contadores: {
      enMora: 3,
      porVencer: 2,
      revision: 1,
      alDia: 7,
    },
    ...overrides,
  };
}

describe('CabeceraYFiltrosCartera · Contratos B, C y D (COB-19, COB-22, COB-23, COB-25)', () => {
  describe('Contrato B · PestanasCartera', () => {
    it('B1 · el tablist "Estados de cartera" incluye grid y grid-cols-4, y no incluye flex-wrap', () => {
      render(
        <PestanasCartera
          pestana="mora"
          resumen={fixtureResumen()}
          onCambiar={vi.fn()}
        >
          <div>Contenido</div>
        </PestanasCartera>
      );

      const tablist = screen.getByRole('tablist', { name: 'Estados de cartera' });
      const clases = tablist.getAttribute('class') ?? '';

      expect(clases).toContain('grid');
      expect(clases).toContain('grid-cols-4');
      expect(clases).not.toContain('flex-wrap');
    });

    it('B2 · los cuatro tabs tienen texto visible corto ("Mora", "Por vencer", "Revisión", "Al día") y muestran sus contadores (3, 2, 1, 7)', () => {
      render(
        <PestanasCartera
          pestana="mora"
          resumen={fixtureResumen()}
          onCambiar={vi.fn()}
        >
          <div>Contenido</div>
        </PestanasCartera>
      );

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);

      const textosVisibles = tabs.map((t) => t.textContent?.trim());
      expect(textosVisibles[0]).toContain('Mora');
      expect(textosVisibles[0]).not.toContain('En Mora');
      expect(textosVisibles[0]).toContain('3');

      expect(textosVisibles[1]).toContain('Por vencer');
      expect(textosVisibles[1]).not.toContain('Próximos a Vencer');
      expect(textosVisibles[1]).toContain('2');

      expect(textosVisibles[2]).toContain('Revisión');
      expect(textosVisibles[2]).not.toContain('Pendiente de Revisión');
      expect(textosVisibles[2]).toContain('1');

      expect(textosVisibles[3]).toContain('Al día');
      expect(textosVisibles[3]).toContain('7');
    });

    it('B3 · nombres accesibles exactos en sentence case con contador ("En mora, 3", "Próximos a vencer, 2", "Pendiente de revisión, 1", "Al día, 7")', () => {
      render(
        <PestanasCartera
          pestana="mora"
          resumen={fixtureResumen()}
          onCambiar={vi.fn()}
        >
          <div>Contenido</div>
        </PestanasCartera>
      );

      expect(screen.getByRole('tab', { name: 'En mora, 3' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Próximos a vencer, 2' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Pendiente de revisión, 1' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Al día, 7' })).not.toBeNull();
    });

    it('B4 · pulsar "Por vencer" llama a onCambiar("por_vencer") y el tabpanel enlaza con aria-labelledby', () => {
      const onCambiar = vi.fn();
      render(
        <PestanasCartera
          pestana="mora"
          resumen={fixtureResumen()}
          onCambiar={onCambiar}
        >
          <div>Contenido Panel</div>
        </PestanasCartera>
      );

      const tabPorVencer =
        screen.queryByRole('tab', { name: 'Próximos a vencer, 2' }) ??
        screen.getByRole('tab', { name: /Por vencer/i });

      fireEvent.click(tabPorVencer);
      expect(onCambiar).toHaveBeenCalledWith('por_vencer');

      const panel = screen.getByRole('tabpanel');
      expect(panel).not.toBeNull();
      expect(panel.getAttribute('aria-labelledby')).toBeTruthy();
    });

    it('B5 · el texto de criterio de la pestaña activa sigue visible', () => {
      render(
        <PestanasCartera
          pestana="mora"
          resumen={fixtureResumen()}
          onCambiar={vi.fn()}
        >
          <div>Contenido</div>
        </PestanasCartera>
      );

      const criterioMora = PESTANAS_CARTERA.find((p) => p.clave === 'mora')!.criterio;
      expect(screen.getByText(criterioMora)).not.toBeNull();
    });

    it('B6 · con resumen={null} los tabs se llaman exactamente "En mora", "Próximos a vencer", "Pendiente de revisión" y "Al día", sin contador 0 falso', () => {
      render(
        <PestanasCartera
          pestana="mora"
          resumen={null}
          onCambiar={vi.fn()}
        >
          <div>Contenido</div>
        </PestanasCartera>
      );

      const tablist = screen.getByRole('tablist', { name: 'Estados de cartera' });
      expect(screen.getByRole('tab', { name: 'En mora' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Próximos a vencer' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Pendiente de revisión' })).not.toBeNull();
      expect(screen.getByRole('tab', { name: 'Al día' })).not.toBeNull();

      expect(within(tablist).queryByText('0')).toBeNull();
    });
  });

  describe('Contrato C · BuscadorCartera', () => {
    it('C1 · con visibles=3, total=3 y pestaña mora: texto exacto "3 registros · En mora", en aria-live="polite", sin "Mostrando" ni "en En"', () => {
      render(
        <MemoryRouter>
          <BuscadorCartera
            busqueda=""
            onCambiarBusqueda={vi.fn()}
            isLoading={false}
            visibles={3}
            total={3}
            etiquetaPestana="En mora"
            sinTasa={false}
          />
        </MemoryRouter>
      );

      const elementoEstado = screen.getByText('3 registros · En mora');
      expect(elementoEstado).not.toBeNull();

      // Debe estar en o dentro de un elemento con aria-live="polite"
      const contenedorLive =
        elementoEstado.getAttribute('aria-live') === 'polite'
          ? elementoEstado
          : elementoEstado.closest('[aria-live="polite"]');
      expect(contenedorLive).not.toBeNull();

      expect(screen.queryByText(/Mostrando/i)).toBeNull();
      expect(screen.queryByText(/en En/i)).toBeNull();
    });

    it('C2 · con total=1: texto exacto "1 registro · En mora"', () => {
      render(
        <MemoryRouter>
          <BuscadorCartera
            busqueda=""
            onCambiarBusqueda={vi.fn()}
            isLoading={false}
            visibles={1}
            total={1}
            etiquetaPestana="En mora"
            sinTasa={false}
          />
        </MemoryRouter>
      );

      expect(screen.getByText('1 registro · En mora')).not.toBeNull();
    });

    it('C3 · con isLoading=true el texto es "Cargando cartera..."', () => {
      render(
        <MemoryRouter>
          <BuscadorCartera
            busqueda=""
            onCambiarBusqueda={vi.fn()}
            isLoading={true}
            visibles={0}
            total={0}
            etiquetaPestana="En mora"
            sinTasa={false}
          />
        </MemoryRouter>
      );

      expect(screen.getByText('Cargando cartera...')).not.toBeNull();
    });

    it('C4 · buscador incluye min-h-11, text-base, sm:text-sm y autocomplete="off"', () => {
      render(
        <MemoryRouter>
          <BuscadorCartera
            busqueda=""
            onCambiarBusqueda={vi.fn()}
            isLoading={false}
            visibles={5}
            total={5}
            etiquetaPestana="En mora"
            sinTasa={false}
          />
        </MemoryRouter>
      );

      const buscador = screen.getByRole('searchbox', {
        name: 'Buscar alumno por nombre',
      });
      const clases = buscador.getAttribute('class') ?? '';

      expect(clases).toContain('min-h-11');
      expect(clases).toContain('text-base');
      expect(clases).toContain('sm:text-sm');
      expect(buscador.getAttribute('autocomplete')).toBe('off');
    });
  });

  describe('Contrato D · CabeceraCartera y ResumenCartera', () => {
    it('D1 · enlace "Pagos por validar" incluye min-h-11, focus-visible:outline-2 y focus-visible:outline-primary', () => {
      render(
        <MemoryRouter>
          <CabeceraCartera />
        </MemoryRouter>
      );

      const enlace = screen.getByRole('link', { name: /Pagos por validar/i });
      const clases = enlace.getAttribute('class') ?? '';

      expect(clases).toContain('min-h-11');
      expect(clases).toContain('focus-visible:outline-2');
      expect(clases).toContain('focus-visible:outline-primary');
    });

    it('D2 · enlace a "Pagos por Validar" en ResumenCartera incluye focus-visible:outline-2, focus-visible:outline-primary y apunta a /coach/conciliacion', () => {
      render(
        <MemoryRouter>
          <ResumenCartera resumen={fixtureResumen()} />
        </MemoryRouter>
      );

      const enlaceBandeja = screen.getByRole('link', { name: /Pagos por Validar/i });
      expect(enlaceBandeja.getAttribute('href')).toBe('/coach/conciliacion');

      const clases = enlaceBandeja.getAttribute('class') ?? '';
      expect(clases).toContain('focus-visible:outline-2');
      expect(clases).toContain('focus-visible:outline-primary');
    });
  });
});
