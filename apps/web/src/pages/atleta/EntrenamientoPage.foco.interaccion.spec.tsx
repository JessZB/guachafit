// @vitest-environment jsdom
/**
 * Lote E5 (RF-001) · contrato C3: integración del modo foco en `EntrenamientoPage` (modo demo).
 *
 * Montaje (mismo patrón que `EntrenamientoPage.vista.interaccion.spec.tsx`):
 * - `useAuth` mockeado con `isDemoMode: true`: la página usa la sesión demo del bloque `d2`
 *   (4 ejercicios con 4, 4, 3 y 3 series = 14 series) y no toca la API.
 * - `apiClient` mockeado: ninguna llamada de red puede colarse desde la página ni sus módulos.
 * - `fake-indexeddb/auto`: `offline-db`/`offline-sync` se importan a nivel de módulo; sin
 *   IndexedDB en jsdom esa promesa rechazaría. Se usa la devDependency existente.
 *
 * Fase roja esperada: hoy, tras iniciar, la página pinta TODAS las tarjetas con sus series;
 * los tests deben fallar por ASERCIÓN (el modo foco aún no existe), nunca por mocks rotos:
 * el ancla de render (`Tu entrenamiento de hoy` + `Entrenamiento en curso`) debe cumplirse.
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

/** Sesión demo `d2`: 4 ejercicios con 4, 4, 3 y 3 series. */
const SERIES_POR_EJERCICIO = [4, 4, 3, 3];

/**
 * Renderiza la página en modo demo, inicia la sesión y espera al estado EN_PROGRESO.
 * El ancla sr-only "Entrenamiento en curso" existe desde el lote E4: si aparece, la página
 * renderizó de verdad y los fallos posteriores son de aserción, no de montaje.
 */
async function renderizarDemoEIniciar(): Promise<void> {
  render(<EntrenamientoPage />);
  await screen.findByRole('heading', { name: 'Tu entrenamiento de hoy' });

  const iniciar = screen.queryByRole('button', { name: 'Iniciar entrenamiento' });
  expect(iniciar).not.toBeNull();
  fireEvent.click(iniciar as HTMLElement);

  await screen.findByText('Entrenamiento en curso');
}

/** Pulsa un botón por su nombre accesible (falla por aserción si no existe). */
function pulsarBoton(nombre: string | RegExp): void {
  const boton = screen.queryByRole('button', { name: nombre });
  expect(boton).not.toBeNull();
  fireEvent.click(boton as HTMLElement);
}

/** Marca la primera serie `numeroSerie` pendiente que aparece en pantalla. */
function marcarPrimeraSeriePendiente(numeroSerie: number): void {
  const boton = screen.queryAllByRole('button', {
    name: `Marcar serie ${numeroSerie} como completada`,
  })[0];
  expect(boton).toBeDefined();
  fireEvent.click(boton as HTMLElement);
}

/** Fila compacta de la serie 1 completada (nombre con "Serie 1" y "corregir"). */
function filaCompactaSerie1(): HTMLElement | null {
  return screen.queryByRole('button', {
    name: (nombre) => /serie 1/i.test(nombre) && /corregir/i.test(nombre),
  });
}

afterEach(() => {
  cleanup();
});

describe('EntrenamientoPage · modo foco en modo demo (C3)', () => {
  it('tras iniciar enfoca la serie actual: progreso, un solo input, "Siguiente:" y "Ver entrenamiento completo"', async () => {
    await renderizarDemoEIniciar();

    expect(screen.queryByText(/Ejercicio 1 de \d+ · Serie 1 de \d+/)).not.toBeNull();

    const inputs = screen.queryAllByLabelText(/Peso real en kg/);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute('aria-label')).toBe('Peso real en kg, serie 1');

    expect(screen.queryByText((contenido) => contenido.startsWith('Siguiente:'))).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver entrenamiento completo' })).not.toBeNull();
  });

  it('marcar la serie actual mueve el foco a la serie 2 y deja un solo input de peso', async () => {
    await renderizarDemoEIniciar();

    marcarPrimeraSeriePendiente(1);

    expect(screen.queryByText(/Serie 2 de/)).not.toBeNull();

    const inputs = screen.queryAllByLabelText(/Peso real en kg/);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].getAttribute('aria-label')).toBe('Peso real en kg, serie 2');
  });

  it('al completar todas las series del ejercicio 1 el progreso pasa a "Ejercicio 2 de"', async () => {
    await renderizarDemoEIniciar();

    for (let numeroSerie = 1; numeroSerie <= SERIES_POR_EJERCICIO[0]; numeroSerie++) {
      marcarPrimeraSeriePendiente(numeroSerie);
    }

    expect(screen.queryByText(/Ejercicio 2 de/)).not.toBeNull();
  });

  it('"Ver entrenamiento completo" muestra la serie hecha compacta, "Volver al enfoque" y "Hacer ahora"', async () => {
    await renderizarDemoEIniciar();
    marcarPrimeraSeriePendiente(1);

    pulsarBoton('Ver entrenamiento completo');

    expect(filaCompactaSerie1()).not.toBeNull();
    expect(screen.queryAllByLabelText('Peso real en kg, serie 2').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Volver al enfoque' })).not.toBeNull();
    expect(screen.queryAllByRole('button', { name: /Hacer ahora/ }).length).toBeGreaterThanOrEqual(
      SERIES_POR_EJERCICIO.length
    );
  });

  it('"Hacer ahora" sobre el tercer ejercicio vuelve al foco con "Ejercicio 3 de"', async () => {
    await renderizarDemoEIniciar();

    pulsarBoton('Ver entrenamiento completo');

    const botonesHacerAhora = screen.queryAllByRole('button', { name: /Hacer ahora/ });
    expect(botonesHacerAhora.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(botonesHacerAhora[2]);

    expect(screen.queryByText(/Ejercicio 3 de/)).not.toBeNull();
  });

  it('con todas las series completadas el foco muestra "Completaste todas las series" y "Finalizar entrenamiento" sigue', async () => {
    await renderizarDemoEIniciar();

    for (const totalSeries of SERIES_POR_EJERCICIO) {
      for (let numeroSerie = 1; numeroSerie <= totalSeries; numeroSerie++) {
        marcarPrimeraSeriePendiente(numeroSerie);
      }
    }

    expect(screen.queryByText('Completaste todas las series')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalizar entrenamiento' })).not.toBeNull();
  });
});
