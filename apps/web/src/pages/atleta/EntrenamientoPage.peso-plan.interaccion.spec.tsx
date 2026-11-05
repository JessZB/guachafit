// @vitest-environment happy-dom
/**
 * Precarga del peso con el plan en EntrenamientoPage (RF-001).
 * Sesión en progreso con dos series pendientes del mismo ejercicio,
 * ambas con pesoPrescritoKg: '60.00' y pesoKg: null.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  EstadoSesion,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

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
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: false }),
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
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { offlineDb } from '../../lib/offline-db';
import { EntrenamientoPage } from './EntrenamientoPage';
import { clonar, tarjetaDe } from './entrenamiento.spec-helper';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const SESION_ID = 'sesion-hoy-peso-plan';

const SEMANA: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W41',
  inicioSemana: '2026-10-05',
  finSemana: '2026-10-11',
  totalBloques: 1,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0.00',
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Día 1 (Lunes): Fuerza',
      enfoque: 'Fuerza general',
      diaSugerido: 1,
      totalEjercicios: 1,
      completado: false,
      esSugeridoHoy: true,
      estadoSesion: null,
      motivoOmision: null,
    },
  ],
  siguienteBloqueSugeridoId: 'b-1',
  esDiaDescansoHoy: false,
  rachaDias: 0,
};

const SESION_HOY: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: SESION_ID,
      ejercicioId: 'ej-1',
      orden: 1,
      ejercicio: {
        id: 'ej-1',
        nombre: 'Sentadilla',
        grupoMuscular: 'Piernas',
        activo: true,
        createdAtUtc: '2026-10-01T00:00:00.000Z',
      },
      series: [
        {
          id: 's-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        },
        {
          id: 's-2',
          ejercicioSesionId: 'es-1',
          numeroSerie: 2,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        },
      ],
    },
  ],
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

let putsRecibidos: Array<{ series: Array<{ serieId: string; pesoKg: string | null; repsLogradas: number | null }> }>;

beforeEach(async () => {
  await offlineDb.rutinaHoy.clear();
  putsRecibidos = [];
  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    const metodo = opciones?.method ?? 'GET';
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
      return Promise.resolve(clonar(SEMANA));
    }
    if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
      return Promise.resolve(clonar(SESION_HOY));
    }
    if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
      putsRecibidos.push(JSON.parse(opciones?.body ?? '{}'));
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
  });
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await offlineDb.rutinaHoy.clear();
});

function campoPesoEn(contenedor: HTMLElement, numeroSerie: number): HTMLInputElement {
  return within(contenedor).getByLabelText(
    new RegExp(`^Peso real.*serie ${numeroSerie}`)
  ) as HTMLInputElement;
}

async function abrirLista(): Promise<HTMLElement> {
  render(<EntrenamientoPage />);
  const seccion = await screen.findByRole(
    'region',
    { name: 'Entrenamiento en foco' },
    { timeout: 5000 }
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.click(within(seccion).getByRole('button', { name: 'Ver entrenamiento completo' }));
  await screen.findByRole('button', { name: 'Volver al enfoque' }, { timeout: 5000 });
  return tarjetaDe('Sentadilla');
}

describe('EntrenamientoPage · precarga del peso con el plan (interacción)', () => {
  it('(a) el input de la serie 1 muestra 60', async () => {
    const tarjeta = await abrirLista();
    const input = campoPesoEn(tarjeta, 1);
    expect(input.value).toBe('60');
  });

  it('(b) marcar la serie 1 sin tocar el peso envía pesoKg "60.00" al API', async () => {
    const tarjeta = await abrirLista();
    fireEvent.click(
      within(tarjeta).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(putsRecibidos[0].series[0].serieId).toBe('s-1');
    expect(putsRecibidos[0].series[0].pesoKg).toBe('60.00');
  });

  it('(c) con el input de la serie 1 cambiado a 62,5 y marcada, la serie 2 (sin tocar) pasa a mostrar 62,5 (la herencia gana al plan) y NO 60', async () => {
    const tarjeta = await abrirLista();
    const input1 = campoPesoEn(tarjeta, 1);
    fireEvent.change(input1, { target: { value: '62,5' } });
    fireEvent.blur(input1);
    fireEvent.click(
      within(tarjeta).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    const input2 = campoPesoEn(tarjetaDe('Sentadilla'), 2);
    expect(['62,5', '62.5']).toContain(input2.value);
    expect(input2.value).not.toBe('60');
  });

  it('(d) vaciar el input de la serie 1 y marcar envía pesoKg: null', async () => {
    const tarjeta = await abrirLista();
    const input1 = campoPesoEn(tarjeta, 1);
    fireEvent.change(input1, { target: { value: '' } });
    fireEvent.blur(input1);
    fireEvent.click(
      within(tarjeta).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(putsRecibidos[0].series[0].serieId).toBe('s-1');
    expect(putsRecibidos[0].series[0].pesoKg).toBeNull();
  });
});
