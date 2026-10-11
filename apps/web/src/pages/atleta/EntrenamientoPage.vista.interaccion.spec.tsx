// @vitest-environment jsdom
/**
 * Lote E4 (RF-001) · contrato C4: integración de la vista previa y la fila compacta en
 * `EntrenamientoPage`, en modo demo (sesión `d2` en estado PLANIFICADA).
 *
 * Montaje (patrón de `ProgresoPage.demo.interaccion.spec.tsx`):
 * - `useAuth` mockeado con `isDemoMode: true`: la página usa `buildDemoSesion` y no toca la API.
 * - `apiClient` mockeado: ninguna llamada de red puede colarse desde la página ni sus módulos.
 * - `fake-indexeddb/auto`: `offline-db`/`offline-sync` se importan a nivel de módulo y
 *   `subscribeToSyncStatus` refresca los contadores de la cola al montar; sin IndexedDB en
 *   jsdom esa promesa rechazaría. Se usa la devDependency existente en vez de mockear las capas.
 *
 * Fase roja esperada: la página aún pinta los inputs deshabilitados y "Comenzar a entrenar";
 * los tests deben fallar por ASERCIÓN, no por mocks rotos ni errores de render.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: true }),
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

import { EntrenamientoPage } from './EntrenamientoPage';

/** Renderiza la página en modo demo y espera a que termine la carga (héroe de la sesión). */
async function renderizarDemo(): Promise<void> {
  render(<EntrenamientoPage />);
  // "Tu entrenamiento de hoy" es el ancla de "ya renderizó": existe hoy y no lo toca el lote E4.
  await screen.findByRole('heading', { name: 'Tu entrenamiento de hoy' });
}

function botonIniciar(): HTMLElement | null {
  return screen.queryByRole('button', { name: 'Iniciar entrenamiento' });
}

/** Botón de la fila compacta de la serie 1 (nombre con "Serie 1" y "corregir"). */
function filaCompactaSerie1(): HTMLElement | null {
  return screen.queryByRole('button', {
    name: (nombre) => /serie 1/i.test(nombre) && /corregir/i.test(nombre),
  });
}

/** Inicia la sesión demo pulsando el botón principal de la vista previa. */
function iniciarEntrenamiento(): void {
  const iniciar = botonIniciar();
  expect(iniciar).not.toBeNull();
  fireEvent.click(iniciar as HTMLElement);
}

afterEach(() => {
  cleanup();
});

describe('EntrenamientoPage · vista previa en modo demo (C4)', () => {
  it('en PLANIFICADA muestra "Tu plan de hoy" sin inputs ni botones de serie, con "Iniciar entrenamiento"', async () => {
    await renderizarDemo();

    expect(screen.queryByText('Tu plan de hoy')).not.toBeNull();
    expect(screen.queryAllByLabelText(/Peso real en/)).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /Marcar serie/ })).toHaveLength(0);
    expect(botonIniciar()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Comenzar a entrenar' })).toBeNull();
  });

  it('al pulsar "Iniciar entrenamiento" desaparece la vista previa y aparecen los inputs y botones de la serie 1', async () => {
    await renderizarDemo();

    iniciarEntrenamiento();

    expect(screen.queryByText('Tu plan de hoy')).toBeNull();
    expect(screen.queryAllByLabelText('Peso real en kg, serie 1').length).toBeGreaterThan(0);
    expect(
      screen.queryAllByRole('button', { name: 'Marcar serie 1 como completada' }).length
    ).toBeGreaterThan(0);
  });

  it('al marcar la serie 1 del primer ejercicio aparece la fila compacta y baja en 1 el número de inputs de esa serie', async () => {
    await renderizarDemo();
    iniciarEntrenamiento();

    const inputsAntes = screen.queryAllByLabelText('Peso real en kg, serie 1');
    expect(inputsAntes.length).toBeGreaterThan(0);

    const marcar = screen.queryAllByRole('button', { name: 'Marcar serie 1 como completada' })[0];
    expect(marcar).toBeDefined();
    fireEvent.click(marcar as HTMLElement);

    expect(filaCompactaSerie1()).not.toBeNull();

    const inputsDespues = screen.queryAllByLabelText('Peso real en kg, serie 1');
    expect(inputsDespues.length).toBe(inputsAntes.length - 1);
  });

  it('al pulsar la fila compacta vuelve la fila completa con su botón "Marcar serie 1 como pendiente"', async () => {
    await renderizarDemo();
    iniciarEntrenamiento();

    const marcar = screen.queryAllByRole('button', { name: 'Marcar serie 1 como completada' })[0];
    expect(marcar).toBeDefined();
    fireEvent.click(marcar as HTMLElement);

    const compacta = filaCompactaSerie1();
    expect(compacta).not.toBeNull();
    fireEvent.click(compacta as HTMLElement);

    expect(
      screen.queryAllByRole('button', { name: 'Marcar serie 1 como pendiente' }).length
    ).toBeGreaterThan(0);
  });

  it('marcar la serie 1 sin escribir peso la completa (el peso es opcional) y no aparece ningún "Peso inválido"', async () => {
    await renderizarDemo();
    iniciarEntrenamiento();

    // No se toca el input de peso: queda vacío (RN-01: el peso es opcional).
    const marcar = screen.queryAllByRole('button', { name: 'Marcar serie 1 como completada' })[0];
    expect(marcar).toBeDefined();
    fireEvent.click(marcar as HTMLElement);

    expect(filaCompactaSerie1()).not.toBeNull();

    const alertasDePeso = screen
      .queryAllByRole('alert')
      .filter((alerta) => /peso inválido/i.test(alerta.textContent ?? ''));
    expect(alertasDePeso).toHaveLength(0);
  });
});
