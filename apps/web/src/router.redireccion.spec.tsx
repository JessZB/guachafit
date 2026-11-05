// @vitest-environment happy-dom
/**
 * RF-018 RN-09 · regresión: `/app/preferencias` redirige a `/app/ajustes?tab=notificaciones`.
 *
 * `router.tsx` se importa en jsdom (solo crea el router de navegador; no monta nada). Para no
 * depender de la sesión real ni de las pantallas pesadas, se sustituyen los guardas y el layout
 * por un `Outlet` y la página del alumno por un marcador, y se monta el MISMO árbol de rutas con
 * un router en memoria (`createMemoryRouter(router.routes)`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Rol } from '@guachafit/shared';

vi.mock('./components/common/ProtectedRoute', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ProtectedRoute: () => <Outlet /> };
});

vi.mock('./components/layout/AppLayout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { AppLayout: () => <Outlet /> };
});

vi.mock('./context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', rol: Rol.ALUMNO },
    isAuthenticated: true,
    isDemoMode: false,
  }),
}));

vi.mock('./pages/atleta/AjustesAlumnoPage', () => ({
  AjustesAlumnoPage: () => <p>Ajustes del alumno</p>,
}));

import { router } from './router';

function montarEn(ruta: string) {
  const enMemoria = createMemoryRouter(
    router.routes as unknown as Parameters<typeof createMemoryRouter>[0],
    { initialEntries: [ruta] }
  );
  render(<RouterProvider router={enMemoria} />);
  return enMemoria;
}

afterEach(() => {
  cleanup();
});

describe('router: redirección de /app/preferencias (RF-018 RN-09)', () => {
  it('16: /app/preferencias redirige a /app/ajustes?tab=notificaciones', async () => {
    const enMemoria = montarEn('/app/preferencias');

    await waitFor(() => {
      expect(enMemoria.state.location.pathname).toBe('/app/ajustes');
      expect(enMemoria.state.location.search).toBe('?tab=notificaciones');
    });
  });
});
