// @vitest-environment happy-dom
/**
 * Lote E7 · C3.4 (fase roja): el peso corporal del check-in del alumno filtra al teclear.
 *
 * Montaje (patrón de `ProgresoPage.checkin.interaccion.spec.tsx`): `useAuth` sin demo (sesión
 * remota sin calendario, la ventana no aplica) y `apiClient` parcialmente mockeado. El campo
 * arranca vacío (D6: en sesión real los campos no se precargan) y el formulario se abre con
 * "Tus medidas".
 *
 * Contrato (CheckinAntropometricoSchema: 30–300 kg con hasta 2 decimales): mientras se escribe
 * se filtra el tope y el formato (hasta 2 decimales), no el mínimo de 30 — hay que poder teclear
 * '3' camino de '35'. Hoy el input no filtra nada: '301' llega al estado y el caso 1 falla.
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
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Abre el formulario de check-in y devuelve el input "Peso (kg)" (sin precarga: evolución vacía). */
async function abrirCheckinConPeso(): Promise<HTMLInputElement> {
  render(<ProgresoPage />);

  fireEvent.click(await screen.findByRole('button', { name: /Tus medidas/ }));
  return screen.getByLabelText('Peso (kg)') as HTMLInputElement;
}

describe('ProgresoPage · peso del check-in filtrado al teclear (C3.4)', () => {
  it('escribir "301" sobre "30" deja el input en "30" (tope 300 mientras se escribe)', async () => {
    const input = await abrirCheckinConPeso();

    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.change(input, { target: { value: '301' } });

    expect(input.value).toBe('30');
  });

  it('escribir "72,5" sobre vacío lo deja en "72,5" (la coma decimal es válida)', async () => {
    const input = await abrirCheckinConPeso();

    fireEvent.change(input, { target: { value: '72,5' } });

    expect(input.value).toBe('72,5');
  });
});
