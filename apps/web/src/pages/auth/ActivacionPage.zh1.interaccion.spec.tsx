// @vitest-environment jsdom
/**
 * Specs ZH-1 · Envío de zonaDispositivo en activación de cuenta (Fase roja TDD).
 * Contrato E: ActivacionPage incluye zonaDispositivo en POST /auth/invitacion/establecer-password.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: mockApiClient,
  };
});

vi.mock('../../lib/date-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/date-format')>();
  return {
    ...actual,
    obtenerTimezoneDispositivo: () => 'Europe/Madrid',
  };
});

import { ActivacionPage } from './ActivacionPage';

describe('ActivacionPage · Contrato E (ZH-1)', () => {
  beforeEach(() => {
    vi.setConfig({ testTimeout: 20000 });
    mockApiClient.mockReset();
    mockApiClient.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('W13: Se activa una cuenta con token válido y contraseña válida enviando zonaDispositivo', async () => {
    render(
      <MemoryRouter initialEntries={['/activar?token=token-valido-123']}>
        <ActivacionPage />
      </MemoryRouter>
    );

    const inputPassword = screen.getByLabelText(/^nueva contraseña/i);
    const inputConfirmacion = screen.getByLabelText(/^confirma tu contraseña/i);
    const botonSubmit = screen.getByRole('button', { name: /crear contraseña/i });

    fireEvent.change(inputPassword, { target: { value: 'Guachafit2026!' } });
    fireEvent.change(inputConfirmacion, { target: { value: 'Guachafit2026!' } });
    fireEvent.click(botonSubmit);

    await waitFor(() => {
      expect(mockApiClient).toHaveBeenCalled();
    });

    const llamada = mockApiClient.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/auth/invitacion/establecer-password')
    );
    expect(llamada).toBeDefined();

    const cuerpo = JSON.parse(llamada?.[1]?.body ?? '{}');
    expect(cuerpo).toHaveProperty('token', 'token-valido-123');
    expect(cuerpo).toHaveProperty('password', 'Guachafit2026!');
    expect(cuerpo).toHaveProperty('zonaDispositivo', 'Europe/Madrid');
  });
});
