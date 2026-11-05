// @vitest-environment jsdom
/**
 * Specs Contratos C y E · Transición de vistas y reinicio de scroll en AppLayout (Fase roja TDD).
 *
 * Contratos:
 * - C: EntradaVista envuelve el contenido en <main> alrededor de Suspense+Outlet con
 *      <div data-vista="contenido" key={pathname}>.
 *      Sin useTransicionVista(): lleva `animate-fade-in`.
 *      Con useTransicionVista(): NO lleva `animate-fade-in`.
 *      En ambos casos: lleva la clase `[view-transition-name:contenido]`.
 *      AppLayout ya no pone `animate-fade-in` en <main>.
 * - E: AppLayout reinicia el scroll al cambiar pathname (window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
 *      y main.scrollTop = 0). No al primer render.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'test-user', rol: 'alumno' },
    isDemoMode: false,
  }),
}));

vi.mock('./Header', () => ({
  Header: () => <header data-testid="header-mock" />,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-mock" />,
}));

vi.mock('./BottomNav', () => ({
  BottomNav: () => <nav data-testid="bottom-nav-mock" />,
}));

vi.mock('../common/ActualizacionDisponible', () => ({
  ActualizacionDisponible: () => null,
}));

vi.mock('./AvisoZonaDiscrepante', () => ({
  AvisoZonaDiscrepante: () => null,
}));

import { AppLayout } from './AppLayout';

function crearRouterDePrueba(rutaInicial = '/ruta-a') {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            path: 'ruta-a',
            element: <div data-testid="contenido-a">Contenido A</div>,
          },
          {
            path: 'ruta-b',
            element: <div data-testid="contenido-b">Contenido B</div>,
          },
        ],
      },
    ],
    { initialEntries: [rutaInicial] }
  );
}

describe('AppLayout · Contratos C y E (Transición de vistas y scroll)', () => {
  const matchMediaOriginal = window.matchMedia;
  let scrollToSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    if (matchMediaOriginal) {
      window.matchMedia = matchMediaOriginal;
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    scrollToSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('(a) sin startViewTransition el [data-vista="contenido"] tiene animate-fade-in y [view-transition-name:contenido]', () => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    const router = crearRouterDePrueba('/ruta-a');

    const { container } = render(<RouterProvider router={router} />);
    const vistaContenido = container.querySelector('[data-vista="contenido"]');

    expect(vistaContenido).not.toBeNull();
    expect(vistaContenido?.classList.contains('animate-fade-in')).toBe(true);
    expect(vistaContenido?.classList.contains('[view-transition-name:contenido]')).toBe(true);
  });

  it('(b) con startViewTransition definido y matchMedia matches:false NO tiene animate-fade-in y sí tiene [view-transition-name:contenido]', () => {
    (document as unknown as { startViewTransition?: unknown }).startViewTransition = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    const router = crearRouterDePrueba('/ruta-a');
    const { container } = render(<RouterProvider router={router} />);
    const vistaContenido = container.querySelector('[data-vista="contenido"]');

    expect(vistaContenido).not.toBeNull();
    expect(vistaContenido?.classList.contains('animate-fade-in')).toBe(false);
    expect(vistaContenido?.classList.contains('[view-transition-name:contenido]')).toBe(true);
  });

  it('(c) al navegar a otra ruta el nodo [data-vista="contenido"] es un elemento NUEVO (se remonta por key)', async () => {
    const router = crearRouterDePrueba('/ruta-a');
    const { container } = render(<RouterProvider router={router} />);

    const primerNodo = container.querySelector('[data-vista="contenido"]');
    expect(primerNodo).not.toBeNull();

    await act(async () => {
      await router.navigate('/ruta-b');
    });

    const segundoNodo = container.querySelector('[data-vista="contenido"]');
    expect(segundoNodo).not.toBeNull();
    expect(segundoNodo).not.toBe(primerNodo);
  });

  it('(d) al navegar, window.scrollTo se llama con top: 0 y main.scrollTop previo de 200 queda en 0; en el primer render no se llama', async () => {
    const router = crearRouterDePrueba('/ruta-a');
    const { container } = render(<RouterProvider router={router} />);

    // En el primer render no se debe reiniciar el scroll
    expect(scrollToSpy).not.toHaveBeenCalled();

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    if (main) {
      main.scrollTop = 200;
    }

    await act(async () => {
      await router.navigate('/ruta-b');
    });

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, left: 0, behavior: 'instant' })
    );
    expect(main?.scrollTop).toBe(0);
  });

  it('(e) <main> ya no lleva la clase animate-fade-in', () => {
    const router = crearRouterDePrueba('/ruta-a');
    render(<RouterProvider router={router} />);

    const main = screen.getByRole('main');
    expect(main.classList.contains('animate-fade-in')).toBe(false);
  });
});
