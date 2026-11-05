// @vitest-environment jsdom
/**
 * Spec Contrato F · BottomNav con soporte de View Transitions API (Fase roja TDD).
 *
 * Contrato:
 * - F: Los enlaces de navegación interna usan viewTransition={useTransicionVista()}.
 *      Con startViewTransition disponible y matchMedia matches:false, un clic invoca
 *      document.startViewTransition una vez y navega a la nueva ruta.
 *      Sin startViewTransition disponible o con movimiento reducido (matches:true),
 *      no se invoca startViewTransition y la navegación ocurre normalmente sin error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import React from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'atleta-1', rol: 'alumno' },
    isDemoMode: false,
  }),
}));

vi.mock('../../lib/use-pendientes-navegacion', () => ({
  usePendientesNavegacion: () => null,
}));

import { BottomNav } from './BottomNav';

function crearMockStartViewTransition() {
  return vi.fn((cb: () => void) => {
    cb();
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: vi.fn(),
    };
  });
}

function crearRouterDePrueba() {
  return createMemoryRouter(
    [
      {
        path: '/app',
        element: (
          <div>
            <BottomNav />
            <Outlet />
          </div>
        ),
        children: [
          { path: 'hoy', element: <div data-testid="contenido-hoy">Hoy</div> },
          { path: 'pagos', element: <div data-testid="contenido-pagos">Pagos</div> },
          { path: 'menu', element: <div data-testid="contenido-menu">Menú</div> },
        ],
      },
    ],
    { initialEntries: ['/app/hoy'] }
  );
}

describe('BottomNav · Contrato F (Navegación con View Transition)', () => {
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  afterEach(() => {
    cleanup();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    if (matchMediaOriginal) {
      window.matchMedia = matchMediaOriginal;
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
    vi.restoreAllMocks();
  });

  it('un clic en un enlace de BottomNav llama a startViewTransition una vez y la ruta cambia', async () => {
    const startViewTransitionMock = crearMockStartViewTransition();
    (document as unknown as { startViewTransition?: unknown }).startViewTransition = startViewTransitionMock;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    const router = crearRouterDePrueba();
    render(<RouterProvider router={router} />);

    const linkPagos = screen.getByRole('link', { name: /pagos/i });
    await act(async () => {
      fireEvent.click(linkPagos);
    });

    expect(startViewTransitionMock).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/app/pagos');
  });

  it('sin startViewTransition la navegación ocurre sin error', async () => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    const router = crearRouterDePrueba();
    render(<RouterProvider router={router} />);

    const linkPagos = screen.getByRole('link', { name: /pagos/i });
    await act(async () => {
      fireEvent.click(linkPagos);
    });

    expect(router.state.location.pathname).toBe('/app/pagos');
  });

  it('con matchMedia matches:true no se llama a startViewTransition', async () => {
    const startViewTransitionMock = crearMockStartViewTransition();
    (document as unknown as { startViewTransition?: unknown }).startViewTransition = startViewTransitionMock;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    const router = crearRouterDePrueba();
    render(<RouterProvider router={router} />);

    const linkPagos = screen.getByRole('link', { name: /pagos/i });
    await act(async () => {
      fireEvent.click(linkPagos);
    });

    expect(startViewTransitionMock).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/app/pagos');
  });
});
