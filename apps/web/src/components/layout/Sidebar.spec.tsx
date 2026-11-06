// @vitest-environment happy-dom
/**
 * Prompt 52 · verificación del layout Sidebar.
 *
 * Cubre: 1) clases responsive/sticky del `<aside>` (offset `lg:top` y altura
 * `lg:h-[calc(100dvh-…)]` iguales, sin el `min-h` heredado del layout móvil);
 * 2-4) enlaces distintivos por rol (alumno, entrenador, superadmin).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sesionMock = vi.hoisted(() => ({
  rol: 'alumno' as string,
  isDemoMode: false,
}));
vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: vi.fn(() => new Promise(() => {})),
}));

import { Sidebar } from './Sidebar';

let queryClient: QueryClient;

function renderSidebar() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    sesionMock.rol = 'alumno';
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

  it('rol alumno muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'alumno';
    renderSidebar();
    expect(screen.getByRole('link', { name: /¡A entrenar!/ })).toBeTruthy();
  });

  it('rol entrenador muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'entrenador';
    renderSidebar();
    expect(screen.getByRole('link', { name: /Mis alumnos/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Plantillas de ejercicios/ })).toBeTruthy();
  });

  it('rol superadmin muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'superadmin';
    renderSidebar();
    expect(screen.getByRole('link', { name: /Administración/ })).toBeTruthy();
  });
});
