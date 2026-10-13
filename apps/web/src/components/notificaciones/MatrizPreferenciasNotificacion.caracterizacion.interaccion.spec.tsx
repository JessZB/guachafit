// @vitest-environment jsdom
/**
 * Characterization of the CURRENT behavior of `MatrizPreferenciasNotificacion`.
 *
 * Written green against the untouched component (base `0660780`); it pins the
 * observable behavior that the Ola-3 extraction must preserve: loading state,
 * load error with retry, channel toggling with dirty tracking, RN-01 locked
 * channels, the RN-02 finance confirmation dialog (open / cancel / confirm),
 * save success (real and demo), generic save errors with retry, and the
 * server-side RN-02 400 that reopens the dialog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Rol } from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({
  rol: 'alumno' as string,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
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

import { ApiError, apiClient } from '../../lib/api-client';
import { buildDemoPreferenciasNotificacion } from '../../lib/demo-notificaciones';
import { MatrizPreferenciasNotificacion } from './MatrizPreferenciasNotificacion';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & { get: MockFn; post: MockFn };

const PREFERENCIAS_ALUMNO = buildDemoPreferenciasNotificacion(Rol.ALUMNO);
const ETIQUETA_FINANZAS = 'Finanzas y Pagos';
const ETIQUETA_PLANIFICACION = 'Planificación Deportiva';
const ETIQUETA_SEGURIDAD = 'Seguridad de Cuenta';

/** Renders the matrix with the fixture loaded and waits for the rows. */
async function renderCargado() {
  render(<MatrizPreferenciasNotificacion />);
  await screen.findByText(ETIQUETA_FINANZAS);
}

/** Turns both finance channels off (RN-02 scenario for the alumno role). */
function apagarFinanzas() {
  fireEvent.click(screen.getByRole('switch', { name: `${ETIQUETA_FINANZAS}: avisos Push` }));
  fireEvent.click(screen.getByRole('switch', { name: `${ETIQUETA_FINANZAS}: avisos por Email` }));
}

/** Returns the body of the PUT call to `/notificaciones/preferencias`. */
function cuerpoPut(): Record<string, unknown> {
  const llamadaPut = mockApi.mock.calls.find((args) => args[1]?.method === 'PUT');
  expect(llamadaPut).toBeTruthy();
  return JSON.parse(llamadaPut![1].body as string) as Record<string, unknown>;
}

beforeEach(() => {
  sesionMock.rol = Rol.ALUMNO;
  sesionMock.isDemoMode = false;
  mockApi.mockReset();
  mockApi.post.mockReset();
  mockApi.mockResolvedValue(PREFERENCIAS_ALUMNO);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MatrizPreferenciasNotificacion: characterization (current behavior)', () => {
  it('shows a loading message while the preferences load', async () => {
    render(<MatrizPreferenciasNotificacion />);
    expect(screen.getByText('Cargando tus preferencias...')).toBeTruthy();
    await screen.findByText(ETIQUETA_FINANZAS);
  });

  it('starts clean: no pending changes and the save button disabled', async () => {
    await renderCargado();
    expect(screen.getByText('Sin cambios pendientes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('toggling a channel marks the draft dirty and enables saving', async () => {
    await renderCargado();
    const interruptor = screen.getByRole('switch', {
      name: `${ETIQUETA_PLANIFICACION}: avisos Push`,
    });
    expect(interruptor.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(interruptor);
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Tienes cambios sin guardar.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }).hasAttribute('disabled')
    ).toBe(false);
  });

  it('RN-01: the mandatory security email channel is locked with its note', async () => {
    await renderCargado();
    const bloqueado = screen.getByRole('switch', {
      name: `${ETIQUETA_SEGURIDAD}: avisos por Email`,
    });
    expect(bloqueado.hasAttribute('disabled')).toBe(true);
    expect(bloqueado.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Obligatorio por motivos de seguridad')).toBeTruthy();
  });

  it('load failure shows an honest error with a retry button that reloads', async () => {
    mockApi.mockRejectedValueOnce(new Error('red caida'));
    render(<MatrizPreferenciasNotificacion />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText(ETIQUETA_FINANZAS);
  });

  it('RN-02: switching both finance channels off asks for confirmation before saving', async () => {
    await renderCargado();
    apagarFinanzas();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('¿Desactivar todos los avisos de pagos?')).toBeTruthy();
    expect(mockApi.mock.calls.some((args) => args[1]?.method === 'PUT')).toBe(false);
  });

  it('RN-02: cancelling keeps the dialog closed and sends nothing', async () => {
    await renderCargado();
    apagarFinanzas();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('¿Desactivar todos los avisos de pagos?');
    fireEvent.click(screen.getByRole('button', { name: 'Mantener canales activos' }));
    await waitFor(() =>
      expect(screen.queryByText('¿Desactivar todos los avisos de pagos?')).toBeNull()
    );
    expect(mockApi.mock.calls.some((args) => args[1]?.method === 'PUT')).toBe(false);
  });

  it('RN-02: confirming sends the confirmation flag and shows success', async () => {
    await renderCargado();
    apagarFinanzas();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('¿Desactivar todos los avisos de pagos?');
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar de todos modos' }));
    expect(
      await screen.findByText(
        'Preferencias guardadas. Se aplicarán a tus próximas notificaciones.'
      )
    ).toBeTruthy();
    expect(cuerpoPut().confirmarSinCanalesFinanzas).toBe(true);
  });

  it('normal save sends no confirmation flag and shows success', async () => {
    await renderCargado();
    fireEvent.click(
      screen.getByRole('switch', { name: `${ETIQUETA_PLANIFICACION}: avisos Push` })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText(
        'Preferencias guardadas. Se aplicarán a tus próximas notificaciones.'
      )
    ).toBeTruthy();
    expect(cuerpoPut().confirmarSinCanalesFinanzas).toBeUndefined();
  });

  it('generic save failure shows an error with a retry button that resends', async () => {
    mockApi.mockImplementation((_endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PUT') return Promise.reject(new Error('boom'));
      return Promise.resolve(PREFERENCIAS_ALUMNO);
    });
    await renderCargado();
    fireEvent.click(
      screen.getByRole('switch', { name: `${ETIQUETA_PLANIFICACION}: avisos Push` })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText(
        'No se pudieron guardar tus preferencias. Revisa tu conexión e inténtalo de nuevo.'
      )
    ).toBeTruthy();
    mockApi.mockResolvedValue(PREFERENCIAS_ALUMNO);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText(
        'Preferencias guardadas. Se aplicarán a tus próximas notificaciones.'
      )
    ).toBeTruthy();
  });

  it('server-side RN-02 400 reopens the confirmation dialog', async () => {
    mockApi.mockImplementation((_endpoint: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PUT') {
        return Promise.reject(
          new ApiError(400, { error: 'RN-02', requiereConfirmacion: true } as never)
        );
      }
      return Promise.resolve(PREFERENCIAS_ALUMNO);
    });
    await renderCargado();
    fireEvent.click(
      screen.getByRole('switch', { name: `${ETIQUETA_PLANIFICACION}: avisos Push` })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('¿Desactivar todos los avisos de pagos?')).toBeTruthy();
  });

  it('demo mode saves to the session without touching the network', async () => {
    sesionMock.isDemoMode = true;
    await renderCargado();
    expect(mockApi).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('switch', { name: `${ETIQUETA_PLANIFICACION}: avisos Push` })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('Preferencias guardadas en esta sesión de demostración.')
    ).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });
});
