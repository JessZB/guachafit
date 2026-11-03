// @vitest-environment jsdom
/**
 * Specs ZH-1 · Componente de aviso de zona horaria discrepante (Fase roja TDD).
 * Contrato B: AvisoZonaDiscrepante.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Rol } from '@guachafit/shared';
import { rutaAjustes } from '../../lib/ajustes';
import { nombreZonaHoraria } from '../../lib/zona-horaria';

const sesionMock = vi.hoisted(() => ({
  user: {
    id: 'alu-1',
    rol: 'alumno',
    zonaHoraria: 'America/Caracas' as string | null | undefined,
  } as { id: string; rol: string; zonaHoraria?: string | null } | null,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: sesionMock.user,
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

const dispositivoMock = vi.hoisted(() => ({
  timezone: 'Europe/Madrid',
}));

vi.mock('../../lib/date-format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/date-format')>();
  return {
    ...actual,
    obtenerTimezoneDispositivo: () => dispositivoMock.timezone,
  };
});

const rutaComponente = './AvisoZonaDiscrepante';
let ComponenteProduccion: React.ComponentType<{ zonaDispositivo?: string }> | null = null;
try {
  const mod = (await import(/* @vite-ignore */ rutaComponente)) as {
    AvisoZonaDiscrepante?: React.ComponentType<{ zonaDispositivo?: string }>;
  };
  ComponenteProduccion = mod?.AvisoZonaDiscrepante ?? null;
} catch {
  ComponenteProduccion = null;
}

function AvisoZonaDiscrepante(props: { zonaDispositivo?: string }) {
  if (ComponenteProduccion) {
    return <ComponenteProduccion {...props} />;
  }
  return null;
}

function renderAviso(props: { zonaDispositivo?: string } = {}) {
  return render(
    <MemoryRouter>
      <AvisoZonaDiscrepante {...props} />
    </MemoryRouter>
  );
}

describe('AvisoZonaDiscrepante · Contrato B (ZH-1)', () => {
  beforeEach(() => {
    sesionMock.user = {
      id: 'alu-1',
      rol: 'alumno',
      zonaHoraria: 'America/Caracas',
    };
    sesionMock.isDemoMode = false;
    dispositivoMock.timezone = 'Europe/Madrid';
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('W4: Alumno con perfil America/Caracas y zonaDispositivo="Europe/Madrid" muestra el aside con enlace y botón sin alert', () => {
    renderAviso({ zonaDispositivo: 'Europe/Madrid' });

    const aside = screen.getByRole('complementary', { name: /aviso de zona horaria/i });
    expect(aside).not.toBeNull();
    expect(aside.getAttribute('role')).not.toBe('alert');
    expect(aside.getAttribute('aria-live')).toBeNull();

    // Contiene los textos de las dos zonas
    expect(aside.textContent).toContain(nombreZonaHoraria('Europe/Madrid'));
    expect(aside.textContent).toContain(nombreZonaHoraria('America/Caracas'));

    // Enlace accesible «Cambiar zona horaria»
    const enlace = screen.getByRole('link', { name: /cambiar zona horaria/i });
    expect(enlace.getAttribute('href')).toBe(rutaAjustes(Rol.ALUMNO, 'zona-horaria'));

    // Botón accesible «Entendido»
    const boton = screen.getByRole('button', { name: /entendido/i });
    expect(boton).not.toBeNull();
  });

  it('W5: Perfil America/Caracas y dispositivo America/La_Paz no renderiza nada', () => {
    renderAviso({ zonaDispositivo: 'America/La_Paz' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
  });

  it('W6: Rol entrenador; rol administrador; alumno en modo demo; perfil sin zona no renderiza nada en ninguno', () => {
    // 1. Entrenador
    sesionMock.user = { id: 'coach-1', rol: 'entrenador', zonaHoraria: 'America/Caracas' };
    const r1 = renderAviso({ zonaDispositivo: 'Europe/Madrid' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    r1.unmount();

    // 2. Administrador
    sesionMock.user = { id: 'admin-1', rol: 'superadmin', zonaHoraria: 'America/Caracas' };
    const r2 = renderAviso({ zonaDispositivo: 'Europe/Madrid' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    r2.unmount();

    // 3. Alumno en modo demo
    sesionMock.user = { id: 'alu-demo', rol: 'alumno', zonaHoraria: 'America/Caracas' };
    sesionMock.isDemoMode = true;
    const r3 = renderAviso({ zonaDispositivo: 'Europe/Madrid' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    r3.unmount();

    // 4. Perfil sin zona
    sesionMock.user = { id: 'alu-sin-zona', rol: 'alumno', zonaHoraria: null };
    sesionMock.isDemoMode = false;
    const r4 = renderAviso({ zonaDispositivo: 'Europe/Madrid' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    r4.unmount();
  });

  it('W7: Se pulsa «Entendido» oculta el aviso y guarda en sessionStorage bajo claveAvisoZona', () => {
    renderAviso({ zonaDispositivo: 'Europe/Madrid' });

    const boton = screen.getByRole('button', { name: /entendido/i });
    fireEvent.click(boton);

    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    expect(
      sessionStorage.getItem('guachafit:aviso-zona:alu-1:America/Caracas|Europe/Madrid')
    ).toBe('1');
  });

  it('W8: Con clave guardada queda oculto para la misma pareja pero visible con otro zonaDispositivo', () => {
    sessionStorage.setItem('guachafit:aviso-zona:alu-1:America/Caracas|Europe/Madrid', '1');

    const { unmount } = renderAviso({ zonaDispositivo: 'Europe/Madrid' });
    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
    unmount();

    renderAviso({ zonaDispositivo: 'Asia/Tokyo' });
    expect(screen.getByRole('complementary', { name: /aviso de zona horaria/i })).not.toBeNull();
  });

  it('W9: sessionStorage.getItem y setItem lanzan error y el aviso igualmente se muestra y se oculta sin lanzar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage bloqueado');
    });

    renderAviso({ zonaDispositivo: 'Europe/Madrid' });

    const aside = screen.getByRole('complementary', { name: /aviso de zona horaria/i });
    expect(aside).not.toBeNull();

    const boton = screen.getByRole('button', { name: /entendido/i });
    expect(() => fireEvent.click(boton)).not.toThrow();

    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
  });

  it('W10: Rerender con user.zonaHoraria cambiada a una zona de igual desfase que el dispositivo hace desaparecer el aviso', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AvisoZonaDiscrepante zonaDispositivo="Europe/Madrid" />
      </MemoryRouter>
    );

    expect(screen.getByRole('complementary', { name: /aviso de zona horaria/i })).not.toBeNull();

    // Se cambia la zona del perfil a Europe/Madrid (mismo desfase que el dispositivo)
    sesionMock.user = {
      id: 'alu-1',
      rol: 'alumno',
      zonaHoraria: 'Europe/Madrid',
    };

    rerender(
      <MemoryRouter>
        <AvisoZonaDiscrepante zonaDispositivo="Europe/Madrid" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('complementary', { name: /aviso de zona horaria/i })).toBeNull();
  });
});
