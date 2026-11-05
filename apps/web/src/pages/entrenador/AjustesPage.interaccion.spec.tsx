// @vitest-environment happy-dom
/**
 * RF-018 P1 · regresión: interacción real de la pantalla "Ajustes" del entrenador.
 *
 * El mismo contrato P1 que fija `PantallaAjustes.interaccion.spec.tsx` para el alumno: un cambio
 * de contraseña en vuelo no pierde su resultado al cambiar de pestaña, y el panel de seguridad
 * (siempre montado) conserva `#password-actual` dentro de un contenedor `hidden`.
 *
 * La matriz de notificaciones se sustituye por un marcador; las consultas de planes y tasas se
 * responden con valores neutros para montar la página sin arrastrar sus flujos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Rol, type MiPerfilDTO } from '@guachafit/shared';

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

function crearStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

beforeEach(() => {
  sesionMock.rol = Rol.ENTRENADOR;
  sesionMock.isDemoMode = false;
  vi.stubGlobal('localStorage', crearStorage());
  // jsdom no implementa scrollIntoView; la página lo usa al activar una pestaña.
  Element.prototype.scrollIntoView = vi.fn();
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === '/finanzas/planes') return Promise.resolve([]);
    if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve({ tasaEfectiva: null });
    return Promise.resolve(PERFIL_ENTRENADOR);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AjustesPage del entrenador (RF-018 P1)', () => {
  it('P1: el resultado de un cambio de contraseña en vuelo se ve al volver y el panel oculto conserva su input', async () => {
    let resolverPost: (valor: {
      mensaje: string;
      accessToken: string;
      refreshToken: string;
    }) => void = () => undefined;
    mockApi.post.mockImplementation(
      () =>
        new Promise<{ mensaje: string; accessToken: string; refreshToken: string }>((resolver) => {
          resolverPost = resolver;
        })
    );

    render(
      <MemoryRouter initialEntries={['/coach/ajustes']}>
        <AjustesPage />
      </MemoryRouter>
    );
    await screen.findByLabelText('Nombres');

    fireEvent.click(screen.getByRole('tab', { name: 'Acceso' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // El POST queda en vuelo: nos vamos a Notificaciones (matriz sustituida por un marcador).
    fireEvent.click(screen.getByRole('tab', { name: 'Avisos' }));
    expect(await screen.findByText('Matriz de notificaciones (marcador)')).toBeTruthy();

    // El panel de seguridad sigue montado, oculto, con su input dentro.
    const inputPassword = document.getElementById('password-actual');
    expect(inputPassword).not.toBeNull();
    expect(inputPassword?.closest('[hidden]')).not.toBeNull();

    await act(async () => {
      resolverPost({ mensaje: 'Tu contraseña se cambió.', accessToken: 'a', refreshToken: 'r' });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Acceso' }));
    expect(await screen.findByText('Tu contraseña se cambió.')).toBeTruthy();
  });
});
