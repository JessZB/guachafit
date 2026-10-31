// @vitest-environment jsdom
/**
 * Spec 5 · CoachMenuPage.saludo.interaccion.spec.tsx
 * Contratos MS1–MS4: saludo con nombre real, remoción de insignias decorativas y datos vivos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { MiPerfilDTO } from '@guachafit/shared';

const authMock = vi.hoisted(() => ({
  user: {
    id: 'coach-1',
    email: 'jesusnbz22@gmail.com',
    rol: 'entrenador',
  },
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => authMock,
}));

const perfilMock = vi.hoisted(() => ({
  current: {
    perfil: null as MiPerfilDTO | null,
    cargando: false,
    error: null as string | null,
    recargar: vi.fn(),
    setPerfil: vi.fn(),
  },
}));

vi.mock('../../lib/use-mi-perfil', () => ({
  useMiPerfil: () => perfilMock.current,
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

import { CoachMenuPage } from './CoachMenuPage';

function renderCoachMenuPage() {
  return render(
    <MemoryRouter>
      <CoachMenuPage />
    </MemoryRouter>
  );
}

describe('CoachMenuPage · Saludo e insignias (UX-16)', () => {
  beforeEach(() => {
    authMock.user = {
      id: 'coach-1',
      email: 'jesusnbz22@gmail.com',
      rol: 'entrenador',
    };
    authMock.isDemoMode = false;

    perfilMock.current = {
      perfil: {
        id: 'coach-1',
        email: 'jesusnbz22@gmail.com',
        rol: 'entrenador' as any,
        correoPendiente: null,
        correoPendienteExpiraUtc: null,
        alumno: null,
        entrenador: {
          nombres: 'María José',
          apellidos: 'Pérez',
          nombreComercial: 'Gym María',
          telefonoContacto: '+584141234567',
        },
      },
      cargando: false,
      error: null,
      recargar: vi.fn(),
      setPerfil: vi.fn(),
    };

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

  it('MS1 · Nombre real: con entrenador.nombres "María José" el h1 es "Hola, María"', () => {
    renderCoachMenuPage();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent?.trim()).toBe('Hola, María');
  });

  it('MS2 · Sin perfil: mientras carga o sin perfil el h1 es "Hola" sin derivar del correo', () => {
    // Mientras carga
    perfilMock.current = {
      perfil: null,
      cargando: true,
      error: null,
      recargar: vi.fn(),
      setPerfil: vi.fn(),
    };
    const { unmount } = renderCoachMenuPage();

    const headingCargando = screen.getByRole('heading', { level: 1 });
    expect(headingCargando.textContent?.trim()).toBe('Hola');
    expect(screen.queryByText(/Jesusnbz22/i)).toBeNull();
    expect(screen.queryByText(/Coach Jesus/i)).toBeNull();

    unmount();
    cleanup();

    // Sin perfil
    perfilMock.current = {
      perfil: null,
      cargando: false,
      error: null,
      recargar: vi.fn(),
      setPerfil: vi.fn(),
    };
    renderCoachMenuPage();

    const headingSinPerfil = screen.getByRole('heading', { level: 1 });
    expect(headingSinPerfil.textContent?.trim()).toBe('Hola');
    expect(screen.queryByText(/Jesusnbz22/i)).toBeNull();
    expect(screen.queryByText(/Coach Jesus/i)).toBeNull();
  });

  it('MS3 · Sin decoración: no existen los textos "Sesión Segura", "Datos Protegidos" ni "Por orden de llegada"', () => {
    renderCoachMenuPage();

    expect(screen.queryByText(/Sesión Segura/i)).toBeNull();
    expect(screen.queryByText(/Datos Protegidos/i)).toBeNull();
    expect(screen.queryByText(/Por orden de llegada/i)).toBeNull();
  });

  it('MS4 · Datos vivos: con pendientes el enlace hacia /coach/conciliacion contiene "3 por validar" en su nombre accesible', () => {
    renderCoachMenuPage();

    const enlace = screen.getByRole('link', {
      name: (name) => /3 por validar/i.test(name),
    });
    expect(enlace.getAttribute('href')).toBe('/coach/conciliacion');
  });
});
