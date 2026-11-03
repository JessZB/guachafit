// @vitest-environment jsdom
/**
 * RNF-001 / RF-003 · contrato 9 (prompt 01, implementación ya en verde): en modo demo el check-in
 * del alumno se simula en local — nunca llama al API real — y la pantalla de éxito lo declara.
 *
 * Mismo montaje que `ProgresoPage.checkin.interaccion.spec.tsx`, con `isDemoMode: true` y el
 * escenario demo por defecto ("Remoto en ventana", con peso precargado válido).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
    zonaHoraria: 'America/Caracas',
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: true }),
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

const AVISO_DEMO = 'En la demostración no se envía nada a tu entrenador.';

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

/** Abre el formulario en el escenario demo por defecto y envía un check-in con peso válido. */
async function enviarCheckinDemo(): Promise<void> {
  render(<ProgresoPage />);

  fireEvent.click(await screen.findByRole('button', { name: /Tus medidas/ }));
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '74.50' } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar a mi entrenador/ }));

  await screen.findByText('¡Medidas guardadas!', undefined, { timeout: 3000 });
}

describe('ProgresoPage · check-in en modo demo (contrato 9)', () => {
  it('envía sin llamar a apiClient con /antropometria/checkin y muestra ¡Medidas guardadas!', async () => {
    await enviarCheckinDemo();

    expect(
      mockApi.mock.calls.some(([endpoint]) => endpoint === '/antropometria/checkin')
    ).toBe(false);
  });

  it(`muestra el aviso "${AVISO_DEMO}"`, async () => {
    await enviarCheckinDemo();

    expect(await screen.findByText(AVISO_DEMO)).toBeTruthy();
  });
});
