// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const PaginaReal = () => <div data-testid="pagina-real">Página lista</div>;

describe('AppLayout · Fallback de Suspense con CargaConEsqueleto y EsqueletoPagina (Contrato 2)', () => {
  let resolverRuta: ((modulo: { default: React.ComponentType }) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    resolverRuta = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderizarConRutaPerezosa() {
    const ComponentePerezoso = React.lazy(
      () =>
        new Promise<{ default: React.ComponentType }>((resolve) => {
          resolverRuta = resolve;
        })
    );

    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [
            {
              path: 'modulo',
              element: <ComponentePerezoso />,
            },
          ],
        },
      ],
      { initialEntries: ['/modulo'] }
    );

    return render(<RouterProvider router={router} />);
  }

  it('de inmediato existe role="status" con «Cargando contenido…» y NO existe .animate-spin', () => {
    renderizarConRutaPerezosa();

    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Cargando contenido…');
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('a 149 ms no hay esqueleto y a 150 ms aparece [data-esqueleto="pagina"] dentro del status', () => {
    renderizarConRutaPerezosa();

    const status = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(document.querySelector('[data-esqueleto]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const esqueleto = status.querySelector('[data-esqueleto="pagina"]');
    expect(esqueleto).not.toBeNull();
  });

  it('al resolver el lazy el status y el esqueleto desaparecen y se ve la página', async () => {
    renderizarConRutaPerezosa();

    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      resolverRuta?.({ default: PaginaReal });
    });

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-esqueleto="pagina"]')).toBeNull();
    expect(screen.getByTestId('pagina-real')).toBeTruthy();
  });

  it('los elementos de layout (Header y BottomNav) simulados siguen presentes durante la carga', () => {
    renderizarConRutaPerezosa();

    expect(screen.getByTestId('header-mock')).toBeTruthy();
    expect(screen.getByTestId('bottom-nav-mock')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
