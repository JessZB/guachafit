// @vitest-environment happy-dom
/**
 * Lote E9 (RF-001 §7.10) · contrato del plazo del envío directo (41-H1).
 *
 * `useEnvioSesion` pasa `tiempoLimiteMs: 15_000` al `apiClient` del intento
 * directo. Si la red se queda colgada, el vencimiento lanza `ErrorTiempoAgotado`
 * (sin `status`, así que `esFalloParaEncolar` lo trata como fallo de red): la
 * mutación se re-encola con la hora de la acción y la misma `idempotencyKey`, y
 * el `finally` libera el vuelo en vez de retener la sesión.
 *
 * Montaje: `fake-indexeddb/auto` para la cola, `apiClient` mockeado que rechaza
 * con `ErrorTiempoAgotado` (un PUT que nunca resuelve se simula así sin
 * temporizadores falsos, que cuelgan `fake-indexeddb`), componente Testigo que
 * expone `enviarOEncolar` (patrón de `use-registro-onboarding.spec.tsx`).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient, ErrorTiempoAgotado } from '../../../lib/api-client';
import {
  hayEnvioEnVuelo,
  reiniciarEnviosEnVueloParaTests,
} from '../../../lib/envios-en-vuelo';
import { offlineDb } from '../../../lib/offline-db';
import {
  useEnvioSesion,
  type EnviarOEncolarFn,
  type ResultadoEnvio,
} from './use-envio-sesion';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

let enviarCapturado: EnviarOEncolarFn | null = null;

function Testigo(): null {
  const { enviarOEncolar } = useEnvioSesion({
    user: { id: 'alumno-1' },
    isDemoMode: false,
  });
  enviarCapturado = enviarOEncolar;
  return null;
}

beforeEach(async () => {
  mockApi.mockReset();
  enviarCapturado = null;
  reiniciarEnviosEnVueloParaTests();
  await offlineDb.outboxMutations.clear();
  await offlineDb.rutinaHoy.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useEnvioSesion · plazo del envío directo (41-H1)', () => {
  it('el directo vencido se re-encola con la hora de la acción y la misma key, y el vuelo se libera', async () => {
    render(<Testigo />);
    expect(enviarCapturado).not.toBeNull();

    // El intento directo se queda colgado: vence el plazo y rechaza como tiempo agotado.
    mockApi.mockRejectedValueOnce(new ErrorTiempoAgotado());
    const antes = Date.now();
    let resultado: ResultadoEnvio<unknown> | null = null;
    await act(async () => {
      resultado = await enviarCapturado!('s1', '/sesiones/s1/series', 'PUT', { series: [] }, 'Serie 1', 'key-plazo');
    });
    const despues = Date.now();

    // El directo llevó el plazo de 15 s.
    expect(mockApi).toHaveBeenCalledTimes(1);
    const opciones = mockApi.mock.calls[0]?.[1] as { tiempoLimiteMs?: number } | undefined;
    expect(opciones?.tiempoLimiteMs).toBe(15_000);

    // El vencimiento es fallo reintentable: se encola en vez de rechazarse.
    const final = resultado as ResultadoEnvio<unknown> | null;
    expect(final?.estado).toBe('encolado');
    const filas = await offlineDb.outboxMutations.toArray();
    expect(filas).toHaveLength(1);
    expect(filas[0]?.idempotencyKey).toBe('key-plazo');
    // Hora de la acción (marca del toque), no de un reintento posterior.
    expect(filas[0]?.createdAt).toBeGreaterThanOrEqual(antes);
    expect(filas[0]?.createdAt).toBeLessThanOrEqual(despues);

    // El vuelo se liberó: la sesión no queda retenida.
    expect(hayEnvioEnVuelo('sesion:s1')).toBe(false);
  });
});
