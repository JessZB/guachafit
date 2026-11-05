// @vitest-environment happy-dom
/**
 * 01 · UX-10 · Contrato D2 (CoachMenuPage) · Menú del coach.
 *
 * D2: En pages/entrenador/CoachMenuPage.tsx, los títulos de esas tarjetas son
 *     "Pagos por validar" y "Control de cobros".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authMock = vi.hoisted(() => ({
  user: { email: 'coach@example.com', rol: 'entrenador' },
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => authMock,
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: vi.fn(() => new Promise(() => {})),
}));

import { CoachMenuPage } from './CoachMenuPage';

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

describe('Contrato D2 · CoachMenuPage (UX-10)', () => {
  it('D2 · tarjetas operativas tienen títulos "Pagos por validar" y "Control de cobros"', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CoachMenuPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Títulos esperados
    const tituloConciliacion = screen.getByRole('heading', { name: /Pagos por validar/i });
    expect(tituloConciliacion).toBeTruthy();

    const tituloCartera = screen.getByRole('heading', { name: /Control de cobros/i });
    expect(tituloCartera).toBeTruthy();

    // Textos viejos eliminados
    expect(screen.queryByText(/Validar Pagos Entrantes/i)).toBeNull();
    expect(screen.queryByText('Control de Cobros')).toBeNull();
  });
});
