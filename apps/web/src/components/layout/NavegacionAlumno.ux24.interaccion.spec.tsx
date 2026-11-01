// @vitest-environment jsdom
/**
 * Spec de interacción UX-24 · Navegación del Alumno (Fase Roja TDD).
 * Contrato NAV-01: accesibilidad de BottomNav y AppLayout para el alumno.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sesionMock = vi.hoisted(() => ({
  rol: 'alumno' as string,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'alu-1', email: 'jesus.perez88@correo.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: vi.fn(() => new Promise(() => {})),
}));

vi.mock('./Header', () => ({
  Header: () => <header data-testid="header-mock" />,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-mock" />,
}));

import { BottomNav } from './BottomNav';
import { AppLayout } from './AppLayout';

describe('NavegacionAlumno · Contrato NAV-01 (UX-24)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    sesionMock.rol = 'alumno';
    sesionMock.isDemoMode = false;
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it('BottomNav expone role="navigation" con aria-label="Navegación principal" y los 3 destinos del alumno', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BottomNav />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(nav).toBeTruthy();

    expect(screen.getByRole('link', { name: /Menú/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ir a entrenar/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pagos/i })).toBeTruthy();
  });

  it('AppLayout anuncia el estado de carga con role="status" mientras se resuelve una ruta perezosa en Suspense', () => {
    const RutaPerezosa = React.lazy(() => new Promise<{ default: React.ComponentType }>(() => {}));

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/app/menu']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/app/menu" element={<RutaPerezosa />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Cargando contenido…');
    expect(screen.queryByText(/Cargando módulo\.\.\./i)).toBeNull();
  });
});
