// @vitest-environment jsdom
/**
 * Prompt 52 · verificación del layout Sidebar.
 *
 * Cubre: 1) clases responsive/sticky del `<aside>` (offset `lg:top` y altura
 * `lg:h-[calc(100dvh-…)]` iguales, sin el `min-h` heredado del layout móvil);
 * 2-4) enlaces distintivos por rol (alumno, entrenador, superadmin).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

import { Sidebar } from './Sidebar';

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    sesionMock.rol = 'alumno';
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('el aside usa el offset sticky de desktop y coincide con su altura', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    const className = aside?.className ?? '';

    expect(className).toContain('hidden');
    expect(className).toContain('lg:flex');
    expect(className).toContain('lg:sticky');
    expect(className).toContain('lg:self-start');
    expect(className).toContain('lg:overflow-y-auto');
    expect(className).not.toContain('min-h-[calc(100vh-57px)]');

    const topMatch = className.match(/lg:top-\[([^\]]+)\]/);
    const heightMatch = className.match(/lg:h-\[calc\(100dvh-([^)\]]+)\)\]/);
    expect(topMatch).not.toBeNull();
    expect(heightMatch).not.toBeNull();
    expect(heightMatch?.[1]).toBe(topMatch?.[1]);
  });

  it('rol alumno muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'alumno';
    renderSidebar();
    expect(screen.getByRole('link', { name: /¡A entrenar!/ })).toBeTruthy();
  });

  it('rol entrenador muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'entrenador';
    renderSidebar();
    expect(screen.getByRole('link', { name: /Mis Alumnos/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Plantillas de ejercicios/ })).toBeTruthy();
  });

  it('rol superadmin muestra sus enlaces distintivos', () => {
    sesionMock.rol = 'superadmin';
    renderSidebar();
    expect(screen.getByRole('link', { name: /Administración/ })).toBeTruthy();
  });
});
