// @vitest-environment jsdom
/**
 * RF-003 "fotos del check-in" · ProgresoPage, envío SIN fotos (contrato 17).
 *
 * Parte del contrato 17 que el formulario actual ya cumple: sin fotos, el POST a
 * `/antropometria/checkin` NO trae la clave `fotos`. El resto del contrato (entradas de D,
 * envío CON foto y bloqueo mientras sube) vive en `ProgresoPage.fotos.interaccion.spec.tsx`.
 *
 * Montaje: `apiClient` parcialmente mockeado (patrón de los specs de Ajustes) y `useAuth`
 * sustituido por una sesión de alumno remoto sin calendario (ventana no aplica).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: false }),
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
import { ProgresoPage } from './ProgresoPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

const EVOLUCION_VACIA = {
  alumnoId: sesionMock.usuario.id,
  totalEvaluaciones: 0,
  controlesTotal: 0,
  evaluaciones: [],
  cambioNetoPesoKg: null,
  cambioNetoGrasaPorcentaje: null,
  rangoSeleccionado: 'todo',
};

beforeEach(() => {
  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === '/auth/me') return Promise.resolve({ usuario: sesionMock.usuario });
    if (endpoint.startsWith('/antropometria/evolucion/')) return Promise.resolve(EVOLUCION_VACIA);
    if (endpoint === '/antropometria/checkin') return Promise.resolve({});
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProgresoPage · check-in sin fotos (contrato 17)', () => {
  it('sin fotos, el POST a /antropometria/checkin no incluye la clave fotos', async () => {
    render(<ProgresoPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Actualizar mis medidas y fotos/ }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '74.50' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar Evaluación al Entrenador/ }));

    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(([endpoint]) => endpoint === '/antropometria/checkin')
      ).toBe(true)
    );

    const llamada = mockApi.mock.calls.find(
      ([endpoint]) => endpoint === '/antropometria/checkin'
    ) as [string, { method: string; body: string }];
    expect(llamada[1].method).toBe('POST');

    const cuerpo = JSON.parse(llamada[1].body);
    expect(cuerpo.alumnoId).toBe(sesionMock.usuario.id);
    expect('fotos' in cuerpo).toBe(false);
  });
});
