// @vitest-environment happy-dom
/**
 * ER1 (prompt 54) — fase verde: raíz sin `path` + `errorElement` y preservación de rutas.
 *
 * R3 usa reproducción sintética con la misma estructura (raíz sin path con
 * `errorElement: <ErrorRuta />` e hijo `lazy` que rechaza) porque forzar al router
 * real a rechazar un chunk exigiría interceptar la carga de chunks de Vite o
 * mockear las páginas reales (`pages/auth/*`, `pages/atleta/*`, …), que arrastran
 * `auth-context`/API pesada; eso dejaría de ser el router real. La reproducción
 * conserva la estructura que la fase green tiene en `router.routes[0]`.
 */
import React, { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

import { router } from './router';
import { ErrorRuta } from './components/common/ErrorRuta';

type RutaLigera = { path?: string; children?: RutaLigera[] };

function recogerRutas(rutas: unknown): string[] {
  if (!Array.isArray(rutas)) return [];
  const out: string[] = [];
  for (const r of rutas as RutaLigera[]) {
    if (typeof r?.path === 'string') out.push(r.path);
    out.push(...recogerRutas(r?.children));
  }
  return out;
}

function raizReal() {
  const rutas = router.routes as unknown as Array<{
    path?: string;
    errorElement?: unknown;
    children?: RutaLigera[];
  }>;
  return rutas[0];
}

afterEach(() => {
  cleanup();
});

describe('router: raíz de errores ER1', () => {
  it('R1: la primera ruta no tiene path, tiene errorElement y contiene todas las rutas como children incluyendo *', () => {
    const raiz = raizReal();
    expect(raiz.path).toBeUndefined();
    expect(raiz.errorElement).toBeDefined();
    expect(React.isValidElement(raiz.errorElement)).toBe(true);
    expect(Array.isArray(raiz.children)).toBe(true);
    const paths = recogerRutas(raiz.children);
    expect(paths).toContain('/login');
    expect(paths).toContain('/app/hoy');
    expect(paths).toContain('/coach/dashboard');
    expect(paths).toContain('/admin');
    expect(paths).toContain('*');
  });

  it('R2: /login, /recuperar, /restablecer, /activar, /onboarding, /confirmar-correo, /registro, / y * siguen existiendo con el mismo path bajo la raíz', () => {
    const raiz = raizReal();
    const paths = recogerRutas(raiz.children ?? []);
    for (const p of [
      '/login',
      '/recuperar',
      '/restablecer',
      '/activar',
      '/onboarding',
      '/confirmar-correo',
      '/registro',
      '/',
      '*',
    ]) {
      expect(paths).toContain(p);
    }
  });

  it('R3: un módulo lazy que rechaza con Failed to fetch muestra Hay una versión nueva de GUACHAFIT', async () => {
    const ModuloRoto = React.lazy(() =>
      Promise.reject(
        new TypeError(
          'Failed to fetch dynamically imported module: https://ejemplo.test/chunk-roto.js'
        )
      )
    );
    const sintetico = createMemoryRouter(
      [
        {
          errorElement: React.createElement(ErrorRuta),
          children: [
            {
              path: '/prueba-error-chunk',
              element: (
                <Suspense fallback={<p>cargando…</p>}>
                  <ModuloRoto />
                </Suspense>
              ),
            },
          ],
        },
      ] as unknown as Parameters<typeof createMemoryRouter>[0],
      { initialEntries: ['/prueba-error-chunk'] }
    );
    render(<RouterProvider router={sintetico} />);
    const aviso = await screen.findByText('Hay una versión nueva de GUACHAFIT');
    expect(aviso).toBeTruthy();
  });
});
