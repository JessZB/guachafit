// @vitest-environment happy-dom
/**
 * Spec 4 · BottomNav.insignias.interaccion.spec.tsx
 * Contratos BI1–BI2: insignias de pendientes en la barra inferior del entrenador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const sesionMock = vi.hoisted(() => ({
  rol: 'entrenador',
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'coach-1', email: 'coach@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

const pendientesMock = vi.hoisted(() => ({
  current: {
    pagosPorValidar: 3,
    evaluaciones: 2,
    enRiesgo: 4,
    enMora: 1,
  } as { pagosPorValidar: number; evaluaciones: number; enRiesgo: number; enMora: number } | null,
}));

vi.mock('../../lib/use-pendientes-navegacion', () => ({
  usePendientesNavegacion: () => pendientesMock.current,
}));

import { BottomNav } from './BottomNav';

function renderBottomNav() {
  return render(
    <MemoryRouter>
      <BottomNav />
    </MemoryRouter>
  );
}

describe('BottomNav · Insignias de pendientes (UX-16)', () => {
  beforeEach(() => {
    sesionMock.rol = 'entrenador';
    sesionMock.isDemoMode = false;
    pendientesMock.current = {
      pagosPorValidar: 3,
      evaluaciones: 2,
      enRiesgo: 4,
      enMora: 1,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('BI1 · Con pendientes: el enlace cuyo nombre empieza por Panel contiene "5 por revisar"', () => {
    renderBottomNav();

    const linkPanel = screen.getByRole('link', {
      name: (name) => name.startsWith('Panel') && name.includes('5 por revisar'),
    });
    expect(linkPanel).toBeTruthy();
  });

  it('BI2 · Sin datos: con el hook en null el enlace se llama exactamente Panel', () => {
    pendientesMock.current = null;
    renderBottomNav();

    const linkPanel = screen.getByRole('link', { name: 'Panel' });
    expect(linkPanel).toBeTruthy();
  });
});
