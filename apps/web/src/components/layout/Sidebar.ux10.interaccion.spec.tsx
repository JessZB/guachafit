// @vitest-environment jsdom
/**
 * 01 · UX-10 · Contrato D2 (Sidebar) · Menú lateral.
 *
 * D2: En components/layout/Sidebar.tsx las entradas se llaman "Control de cobros" y "Pagos por validar";
 *     ya no existen "Control de Cobros" ni "Validar Pagos".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const sesionMock = vi.hoisted(() => ({
  rol: 'entrenador',
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'coach-1', email: 'coach@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: vi.fn(() => new Promise(() => {})),
}));

import { Sidebar } from './Sidebar';

let queryClient: QueryClient;

beforeEach(() => {
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

describe('Contrato D2 · Sidebar (UX-10)', () => {
  it('D2 · Sidebar tiene enlaces "Control de cobros" y "Pagos por validar" sin textos viejos', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Enlaces esperados
    const linkCartera = screen.getByRole('link', { name: /Control de cobros/ });
    expect(linkCartera).toBeTruthy();

    const linkConciliacion = screen.getByRole('link', { name: /Pagos por validar/ });
    expect(linkConciliacion).toBeTruthy();

    // Textos viejos eliminados
    expect(screen.queryByText('Control de Cobros')).toBeNull();
    expect(screen.queryByText('Validar Pagos')).toBeNull();
  });
});
