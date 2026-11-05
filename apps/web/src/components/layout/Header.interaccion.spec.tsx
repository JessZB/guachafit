// @vitest-environment happy-dom
/**
 * 01 · UX-04 · Specs de interacción para Header (Contrato E).
 *
 * Requisitos:
 * - Menú "Cuenta" unificado en todos los tamaños; desaparecen el botón de logout suelto y los selectores de tema sueltos.
 * - Abriendo "Cuenta", muestra correo completo, rol formateado ("Entrenador"), enlace a Ajustes y logout seguro.
 * - Ya no se deriva el nombre del usuario a partir del correo ("ana.perez") fuera del menú.
 * - El nombre "GUACHAFIT" se oculta en móvil (hidden sm:flex) cuando hay opción de instalar o incidencias de sincronización.
 * - El botón de sincronización mide 44px (min-h-11).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React, { useEffect } from 'react';
import type { SyncStatusState } from '../../lib/offline-sync';
import { Header } from './Header';

vi.setConfig({ testTimeout: 20000 });

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let estadoSyncActual: SyncStatusState = {
  isSyncing: false,
  summary: { pending: 0, failed: 0, rejected: 0 },
};
let listenerSync: ((state: SyncStatusState) => void) | null = null;

vi.mock('../../lib/offline-sync', () => ({
  subscribeToSyncStatus: vi.fn((listener: (state: SyncStatusState) => void) => {
    listenerSync = listener;
    listener(estadoSyncActual);
    return () => {
      listenerSync = null;
    };
  }),
  processOutboxQueue: vi.fn(),
}));

const solicitarCierreMock = vi.fn();
vi.mock('../../lib/use-logout-seguro', () => ({
  useLogoutSeguro: () => ({
    solicitarCierre: solicitarCierreMock,
    dialogoAbierto: false,
    pendientes: 0,
    sincronizando: false,
    mensaje: null,
    cancelar: vi.fn(),
    confirmar: vi.fn(),
    sincronizarAhora: vi.fn(),
  }),
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana.perez@correo.com', rol: 'entrenador' },
  }),
}));

vi.mock('../../lib/theme', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('../notificaciones/CampanaNotificaciones', () => ({
  CampanaNotificaciones: () => <button type="button">Notificaciones</button>,
}));

let instalarDisponibleSimulado = false;
vi.mock('../common/InstalarAppPrompt', () => ({
  InstalarAppPrompt: ({
    onDisponibilidad,
  }: {
    onDisponibilidad?: (disponible: boolean) => void;
  }) => {
    useEffect(() => {
      onDisponibilidad?.(instalarDisponibleSimulado);
    }, [onDisponibilidad]);

    return instalarDisponibleSimulado ? (
      <button type="button" aria-label="Instalar app">
        Instalar
      </button>
    ) : null;
  },
}));

vi.mock('../common/SyncQueuePanel', () => ({
  SyncQueuePanel: () => null,
}));

vi.mock('../common/DialogoLogoutPendientes', () => ({
  DialogoLogoutPendientes: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clases(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function montarHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );
}

async function abrirMenuCuenta(): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: 'Cuenta' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return await screen.findByRole('menu');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header · Contrato E', () => {
  beforeEach(() => {
    instalarDisponibleSimulado = false;
    estadoSyncActual = {
      isSyncing: false,
      summary: { pending: 0, failed: 0, rejected: 0 },
    };
    solicitarCierreMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Hay un botón "Cuenta" y NO hay botón "Cerrar sesión" ni controles de tema sueltos fuera del menú', () => {
    montarHeader();

    const botonCuenta = screen.getByRole('button', { name: 'Cuenta' });
    expect(botonCuenta).toBeTruthy();

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambiar tema de la interfaz' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modo Claro/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modo Oscuro/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modo Sistema/i })).toBeNull();
  });

  it('2. Al abrir "Cuenta" con ArrowDown: se ve el correo ana.perez@correo.com, "Entrenador", "Ajustes" (/coach/ajustes) y Cerrar sesión delega en solicitarCierre', async () => {
    montarHeader();

    const menu = await abrirMenuCuenta();
    expect(menu.textContent).toContain('ana.perez@correo.com');
    expect(menu.textContent).toContain('Entrenador');

    const itemAjustes = screen.getByRole('menuitem', { name: 'Ajustes' });
    const link = itemAjustes.closest('a');
    expect(link?.getAttribute('href')).toBe('/coach/ajustes');

    const itemCerrar = screen.getByRole('menuitem', { name: 'Cerrar sesión' });
    fireEvent.click(itemCerrar);
    expect(solicitarCierreMock).toHaveBeenCalledTimes(1);
  });

  it('3. El nombre del correo (ana.perez) ya no aparece fuera del menú (SEG-28)', () => {
    montarHeader();

    // No debe existir el nodo de texto que extraía user.email.split('@')[0]
    expect(screen.queryByText('ana.perez')).toBeNull();
  });

  describe('4. Marca en el móvil: el contenedor de GUACHAFIT oculta el texto en móvil cuando hay instalar o incidencias', () => {
    it('sin Instalar disponible y sin incidencias: el contenedor de GUACHAFIT no incluye la clase hidden', () => {
      instalarDisponibleSimulado = false;
      estadoSyncActual = {
        isSyncing: false,
        summary: { pending: 0, failed: 0, rejected: 0 },
      };
      montarHeader();

      const marcaTexto = screen.getByText('GUACHAFIT');
      const contenedorMarca = marcaTexto.closest('div') ?? marcaTexto;
      expect(clases(contenedorMarca)).not.toContain('hidden');
    });

    it('con Instalar disponible: el contenedor de GUACHAFIT incluye hidden y sm:flex', () => {
      instalarDisponibleSimulado = true;
      estadoSyncActual = {
        isSyncing: false,
        summary: { pending: 0, failed: 0, rejected: 0 },
      };
      montarHeader();

      const marcaTexto = screen.getByText('GUACHAFIT');
      const contenedorMarca = marcaTexto.closest('div') ?? marcaTexto;
      const tokens = clases(contenedorMarca);
      expect(tokens).toContain('hidden');
      expect(tokens).toContain('sm:flex');
    });

    it('con incidencias de sincronización: el contenedor de GUACHAFIT incluye hidden y sm:flex', () => {
      instalarDisponibleSimulado = false;
      estadoSyncActual = {
        isSyncing: false,
        summary: { pending: 0, failed: 1, rejected: 0 },
      };
      montarHeader();

      const marcaTexto = screen.getByText('GUACHAFIT');
      const contenedorMarca = marcaTexto.closest('div') ?? marcaTexto;
      const tokens = clases(contenedorMarca);
      expect(tokens).toContain('hidden');
      expect(tokens).toContain('sm:flex');
    });
  });

  it('5. El botón de sincronización de la cabecera mide 44px: incluye min-h-11', () => {
    montarHeader();

    const botonSync = screen.getByRole('button', {
      name: 'Sincronizar cambios pendientes',
    });
    expect(clases(botonSync)).toContain('min-h-11');
  });
});
