// @vitest-environment jsdom
/**
 * UX-17 · Regresión e interacción: Ajustes del entrenador sobre PantallaAjustes (Contratos AJ1–AJ6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Rol, type MiPerfilDTO, type PlanMembresiaDetalleDTO } from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const sesionMock = vi.hoisted(() => ({
  rol: 'entrenador' as string,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'e1', email: 'coach@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../components/notificaciones/MatrizPreferenciasNotificacion', () => ({
  MatrizPreferenciasNotificacion: () => <p>Matriz de notificaciones (marcador)</p>,
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { AjustesPage } from './AjustesPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

const PERFIL_ENTRENADOR: MiPerfilDTO = {
  id: 'e1',
  email: 'coach@example.com',
  rol: Rol.ENTRENADOR,
  correoPendiente: null,
  correoPendienteExpiraUtc: null,
  alumno: null,
  entrenador: {
    nombres: 'Luis',
    apellidos: 'Rojas',
    nombreComercial: 'Gimnasio Rojas',
    telefonoContacto: '+584149990000',
  },
};

const PLANES_PRUEBA: PlanMembresiaDetalleDTO[] = [
  {
    id: 'plan-1',
    entrenadorId: 'e1',
    nombre: 'Plan Básico',
    descripcion: 'Acceso general al gimnasio',
    beneficios: ['Rutina interactiva en app'],
    precioBaseUsd: '30.00',
    duracionMeses: 1,
    activo: true,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan-2',
    entrenadorId: 'e1',
    nombre: 'Plan Avanzado',
    descripcion: 'Acceso total y seguimiento personalizado',
    beneficios: ['Rutina interactiva en app', 'Monitoreo diario'],
    precioBaseUsd: '50.00',
    duracionMeses: 1,
    activo: true,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
  },
];

function crearStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

function UrlActual() {
  const { pathname, search } = useLocation();
  return <div data-testid="url-actual">{`${pathname}${search}`}</div>;
}

function renderAjustes(rutaInicial = '/coach/ajustes') {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <AjustesPage />
      <UrlActual />
    </MemoryRouter>
  );
}

beforeEach(() => {
  sesionMock.rol = Rol.ENTRENADOR;
  sesionMock.isDemoMode = false;
  vi.stubGlobal('localStorage', crearStorage());
  Element.prototype.scrollIntoView = vi.fn();
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === '/finanzas/planes') return Promise.resolve(PLANES_PRUEBA);
    if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve({ tasaEfectiva: null });
    return Promise.resolve(PERFIL_ENTRENADOR);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AjustesPage · interacción (UX-17)', () => {
  it('AJ1 · ?tab= abre su pestaña', async () => {
    renderAjustes('/coach/ajustes?tab=planes');

    const tabPlanes = screen.getByRole('tab', { name: /^Planes/ });
    expect(tabPlanes.getAttribute('aria-selected')).toBe('true');

    const panelId = tabPlanes.getAttribute('aria-controls');
    const panelPlanes = panelId
      ? document.getElementById(panelId)
      : screen.getByRole('tabpanel', { name: /^Planes/ });
    expect(panelPlanes).not.toBeNull();
    expect(panelPlanes?.hasAttribute('hidden')).toBe(false);

    await screen.findByText(PLANES_PRUEBA[0].nombre);
    expect(panelPlanes?.textContent).toContain(PLANES_PRUEBA[0].nombre);
  });

  it('AJ2 · Cambiar de pestaña actualiza la URL', async () => {
    renderAjustes('/coach/ajustes');
    await screen.findByLabelText('Nombres');

    fireEvent.click(screen.getByRole('tab', { name: 'Tasa' }));
    expect(screen.getByTestId('url-actual').textContent).toContain('?tab=tasas');

    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    expect(screen.getByTestId('url-actual').textContent).not.toContain('tab=');
  });

  it('AJ3 · Clave inválida', async () => {
    renderAjustes('/coach/ajustes?tab=zona-horaria');
    await screen.findByLabelText('Nombres');

    const tabPerfil = screen.getByRole('tab', { name: 'Perfil' });
    expect(tabPerfil.getAttribute('aria-selected')).toBe('true');
  });

  it('AJ4 · Conteo de planes', async () => {
    renderAjustes('/coach/ajustes');
    await screen.findByLabelText('Nombres');

    const tabPlanes = screen.getByRole('tab', { name: 'Planes: 2 planes' });
    expect(tabPlanes.textContent).toContain('2');
  });

  it('AJ5 · Nueva acción en su panel', async () => {
    // 1. En la pestaña Planes
    const { unmount } = renderAjustes('/coach/ajustes?tab=planes');
    await screen.findByText(PLANES_PRUEBA[0].nombre);

    const tabPlanes = screen.getByRole('tab', { name: /^Planes/ });
    const panelId = tabPlanes.getAttribute('aria-controls');
    const panelPlanes = panelId
      ? document.getElementById(panelId)
      : screen.getByRole('tabpanel', { name: /^Planes/ });
    expect(panelPlanes).not.toBeNull();

    const botonNuevoPlan = within(panelPlanes!).getByRole('button', { name: /nuevo plan/i });
    fireEvent.click(botonNuevoPlan);

    expect(await screen.findByRole('dialog')).toBeTruthy();

    unmount();

    // 2. En la pestaña Perfil
    renderAjustes('/coach/ajustes');
    await screen.findByLabelText('Nombres');
    expect(screen.queryByRole('button', { name: /nuevo plan/i })).toBeNull();
  });

  it('AJ6 · Teclado', async () => {
    renderAjustes('/coach/ajustes');
    await screen.findByLabelText('Nombres');

    const tabPerfil = screen.getByRole('tab', { name: 'Perfil' });
    tabPerfil.focus();
    fireEvent.keyDown(tabPerfil, { key: 'ArrowRight' });

    const tabSeguridad = screen.getByRole('tab', { name: 'Acceso' });
    expect(tabSeguridad.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('url-actual').textContent).toContain('?tab=seguridad');
  });
});
