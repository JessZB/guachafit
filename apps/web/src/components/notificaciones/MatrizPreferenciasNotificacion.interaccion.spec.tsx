// @vitest-environment happy-dom
/**
 * RF-018 P2 · regresión: guardado de la matriz de preferencias de notificación.
 *
 * El guardado pasa `OPCIONES_GUARDADO_AJUSTES` (`{ tiempoLimiteMs: 15000 }`) y, si el plazo
 * vence, la matriz muestra MENSAJE_TIEMPO_AGOTADO.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Rol } from '@guachafit/shared';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', rol: Rol.ALUMNO },
    isDemoMode: false,
  }),
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

import { ErrorTiempoAgotado, MENSAJE_TIEMPO_AGOTADO, apiClient } from '../../lib/api-client';
import { buildDemoPreferenciasNotificacion } from '../../lib/demo-notificaciones';
import { MatrizPreferenciasNotificacion } from './MatrizPreferenciasNotificacion';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & { get: MockFn; post: MockFn };

// Fixture válida derivada del contrato compartido; la fila de Finanzas queda con canales activos
// para que alternar otra fila no dispare la confirmación RN-02.
const PREFERENCIAS_ALUMNO = buildDemoPreferenciasNotificacion(Rol.ALUMNO);
const FILA_PLANIFICACION = PREFERENCIAS_ALUMNO.matriz.find(
  (fila) => fila.id === 'PLANIFICACION_DEPORTIVA'
)!;

/** Carga la matriz con la fixture y alterna el canal Push de Planificación Deportiva. */
async function prepararCambio() {
  render(<MatrizPreferenciasNotificacion />);
  await screen.findByText(FILA_PLANIFICACION.etiqueta);
  fireEvent.click(
    screen.getByRole('switch', { name: `${FILA_PLANIFICACION.etiqueta}: avisos Push` })
  );
}

beforeEach(() => {
  mockApi.mockReset();
  mockApi.post.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MatrizPreferenciasNotificacion: tiempo límite del guardado (RF-018 P2)', () => {
  it('resilience H2: el guardado pasa { tiempoLimiteMs: 15000 }', async () => {
    mockApi.mockResolvedValue(PREFERENCIAS_ALUMNO);

    await prepararCambio();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(
        '/notificaciones/preferencias',
        expect.objectContaining({ tiempoLimiteMs: 15000, method: 'PUT' })
      )
    );
  });

  it('resilience H2: al vencer el plazo se muestra MENSAJE_TIEMPO_AGOTADO', async () => {
    mockApi.mockImplementation((_endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PUT') return Promise.reject(new ErrorTiempoAgotado());
      return Promise.resolve(PREFERENCIAS_ALUMNO);
    });

    await prepararCambio();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(MENSAJE_TIEMPO_AGOTADO)).toBeTruthy();
  });
});
