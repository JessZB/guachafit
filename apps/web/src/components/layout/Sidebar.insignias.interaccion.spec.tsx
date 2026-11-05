// @vitest-environment happy-dom
/**
 * Spec 3 · Sidebar.insignias.interaccion.spec.tsx
 * Contratos SI1–SI2: insignias de pendientes en la navegación lateral del entrenador.
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

import { Sidebar } from './Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar · Insignias de pendientes (UX-16)', () => {
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

  it('SI1 · Conteos en los destinos: cada enlace contiene su texto de conteo respectivo', () => {
    renderSidebar();

    // 1. Seguimiento -> 4 alumnos en riesgo
    const linkSeguimiento = screen.getByRole('link', {
      name: (name) => name.startsWith('Seguimiento') && name.includes('4 alumnos en riesgo'),
    });
    expect(linkSeguimiento).toBeTruthy();

    // 2. Evaluaciones -> 2 por revisar
    const linkEvaluaciones = screen.getByRole('link', {
      name: (name) => name.startsWith('Evaluaciones') && name.includes('2 por revisar'),
    });
    expect(linkEvaluaciones).toBeTruthy();

    // 3. Control de cobros -> 1 en mora
    const linkCobros = screen.getByRole('link', {
      name: (name) => name.startsWith('Control de cobros') && name.includes('1 en mora'),
    });
    expect(linkCobros).toBeTruthy();

    // 4. Pagos por validar -> 3 por validar
    const linkPagos = screen.getByRole('link', {
      name: (name) => name.startsWith('Pagos por validar') && name.includes('3 por validar'),
    });
    expect(linkPagos).toBeTruthy();

    // Con enRiesgo: 1, el primero contiene "1 alumno en riesgo"
    cleanup();
    pendientesMock.current = {
      pagosPorValidar: 3,
      evaluaciones: 2,
      enRiesgo: 1,
      enMora: 1,
    };
    renderSidebar();

    const linkSeguimientoSingular = screen.getByRole('link', {
      name: (name) => name.startsWith('Seguimiento') && name.includes('1 alumno en riesgo'),
    });
    expect(linkSeguimientoSingular).toBeTruthy();
  });

  it('SI2 · Sin datos: con el hook en null ninguno de los cuatro enlaces contiene un dígito en su nombre accesible', () => {
    pendientesMock.current = null;
    renderSidebar();

    const destinos = [
      '/coach/monitor-adherencia',
      '/coach/antropometria',
      '/coach/cartera',
      '/coach/conciliacion',
    ];

    const enlaces = screen.getAllByRole('link').filter((el) => {
      const href = el.getAttribute('href');
      return href && destinos.includes(href);
    });

    expect(enlaces).toHaveLength(4);
    for (const enlace of enlaces) {
      const nombreAccesible = enlace.getAttribute('aria-label') || enlace.textContent || '';
      expect(nombreAccesible).not.toMatch(/\d/);
    }
  });
});
