// @vitest-environment jsdom
/**
 * Specs ZH-1 · Integración de AvisoZonaDiscrepante en AppLayout (Fase roja TDD).
 * Contrato C: AppLayout renderiza el aside dentro del main y tras el Outlet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const sesionMock = vi.hoisted(() => ({
  user: {
    id: 'alu-1',
    rol: 'alumno',
    zonaHoraria: 'America/Caracas',
  } as { id: string; rol: string; zonaHoraria?: string } | null,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: sesionMock.user,
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../lib/date-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/date-format')>();
  return {
    ...actual,
    obtenerTimezoneDispositivo: () => 'Europe/Madrid',
  };
});

vi.mock('./Header', () => ({
  Header: () => <header data-testid="header-mock" />,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-mock" />,
}));

vi.mock('./BottomNav', () => ({
  BottomNav: () => <nav data-testid="bottom-nav-mock" />,
}));

vi.mock('../common/ActualizacionDisponible', () => ({
  ActualizacionDisponible: () => null,
}));

import { AppLayout } from './AppLayout';

describe('AppLayout · Contrato C (ZH-1)', () => {
  beforeEach(() => {
    sesionMock.user = {
      id: 'alu-1',
      rol: 'alumno',
      zonaHoraria: 'America/Caracas',
    };
    sesionMock.isDemoMode = false;
  });

  afterEach(() => {
    cleanup();
  });

  it('W11: AppLayout con alumno y discrepancia renderiza el aside dentro del main y después del contenido de la ruta; no aparece para entrenador', () => {
    sesionMock.user = { id: 'alu-1', rol: 'alumno', zonaHoraria: 'America/Caracas' };
    sesionMock.isDemoMode = false;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/hoy']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route path="hoy" element={<div data-testid="marcador-ruta">Contenido de la ruta</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const aside = screen.getByRole('complementary', { name: /aviso de zona horaria/i });
    const main = screen.getByRole('main');
    const marcador = screen.getByTestId('marcador-ruta');

    // El aside está dentro del main
    expect(main.contains(aside)).toBe(true);

    // Aparece después del marcador (orden de documento)
    expect(Boolean(marcador.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    unmount();

    // Con rol entrenador no aparece
    sesionMock.user = { id: 'coach-1', rol: 'entrenador', zonaHoraria: 'America/Caracas' };
    render(
      <MemoryRouter initialEntries={['/app/hoy']}>
        <Routes>
          <Route path="/app" element={<AppLayout />}>
            <Route path="hoy" element={<div data-testid="marcador-ruta">Contenido de la ruta</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
  });
});
