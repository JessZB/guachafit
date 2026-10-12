// @vitest-environment jsdom
/**
 * Lote E8 (RF-001) · borrador de repeticiones en la página real SIN modo demo.
 * La sesión de hoy llega EN_PROGRESO y `PUT /sesiones/{id}/series` responde con
 * éxito capturando el cuerpo, para fijar qué `repsLogradas` viaja al marcar.
 *
 * Montaje (patrón de `EntrenamientoPage.rechazo.interaccion.spec.tsx`):
 * - `useAuth` con `isDemoMode: false`.
 * - `apiClient` mockeado: GET de la semana y GET de la sesión devuelven fixtures;
 *   el PUT de series resuelve `{}` y guarda el cuerpo enviado.
 * - `fake-indexeddb/auto`: la página cachea la sesión en Dexie al cargar.
 *
 * Punto 3.5 del prompt: es SOLO observación informativa (ver reporte); este spec
 * no contiene ningún test en rojo por ese hallazgo.
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

const SESION_ID = 'sesion-hoy-reps';

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

/** "Sentadilla" con 2 series; la 1 trae 8 reps guardadas y objetivo 10. */
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
          repsLogradas: 8,
          pesoKg: '60.00',
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

/** Cuerpos enviados al PUT de series, en orden de llegada. */
let putsRecibidos: Array<{ series: Array<{ serieId: string; repsLogradas: number }> }>;

beforeEach(() => {
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function campoRepsEn(contenedor: HTMLElement, numeroSerie: number): HTMLInputElement {
  return within(contenedor).getByLabelText(
    `Repeticiones hechas, serie ${numeroSerie}`
  ) as HTMLInputElement;
}

/** Fila editable de una serie dentro de la tarjeta (las etiquetas de steppers se repiten por serie). */
function filaDeSerie(tarjeta: HTMLElement, numeroSerie: number): HTMLElement {
  // H-06: sin `closest('div[class*="rounded-2xl"]')`. La fila (`FilaSerieEdicion.tsx:71-77`)
  // es un `div` sin `role="group"` propio, así que se sube desde el input hasta el primer
  // ancestro que contenga a la vez el campo y su botón de marcar de esa serie.
  const etiqueta = `Repeticiones hechas, serie ${numeroSerie}`;
  const input = within(tarjeta).getByLabelText(etiqueta);
  let actual: HTMLElement | null = input.parentElement;
  while (actual) {
    const tieneCampo = within(actual).queryByLabelText(etiqueta);
    const tieneMarcar =
      within(actual).queryByRole('button', {
        name: `Marcar serie ${numeroSerie} como completada`,
      }) ??
      within(actual).queryByRole('button', {
        name: `Marcar serie ${numeroSerie} como pendiente`,
      });
    if (tieneCampo && tieneMarcar) return actual;
    actual = actual.parentElement;
  }
  expect(actual).not.toBeNull();
  throw new Error(`filaDeSerie: no se encontró la fila de la serie ${numeroSerie}`);
}

/** Abre la lista completa y devuelve la tarjeta de Sentadilla asentada. */
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

describe('EntrenamientoPage · borrador de repeticiones (E8)', () => {
  it('contrato 1: vaciar el campo muestra "" (no 0) y al salir vuelve el último valor guardado', async () => {
    const tarjeta = await abrirLista();
    const reps = campoRepsEn(tarjeta, 1);
    expect(reps.value).toBe('8');

    fireEvent.change(reps, { target: { value: '' } });
    expect(campoRepsEn(tarjetaDe('Sentadilla'), 1).value).toBe('');

    fireEvent.blur(campoRepsEn(tarjetaDe('Sentadilla'), 1));
    expect(campoRepsEn(tarjetaDe('Sentadilla'), 1).value).toBe('8');
  });

  it('contrato 2: escribir 12 y salir deja 12 visible', async () => {
    const tarjeta = await abrirLista();
    const reps = campoRepsEn(tarjeta, 1);

    fireEvent.change(reps, { target: { value: '12' } });
    expect(campoRepsEn(tarjetaDe('Sentadilla'), 1).value).toBe('12');

    fireEvent.blur(campoRepsEn(tarjetaDe('Sentadilla'), 1));
    expect(campoRepsEn(tarjetaDe('Sentadilla'), 1).value).toBe('12');
  });

  it('contrato 3: con el campo vacío, Sumar parte del último guardado (8) y muestra 9', async () => {
    await abrirLista();
    const fila = () => filaDeSerie(tarjetaDe('Sentadilla'), 1);
    fireEvent.change(campoRepsEn(fila(), 1), { target: { value: '' } });
    expect(campoRepsEn(fila(), 1).value).toBe('');

    fireEvent.click(
      within(fila()).getByRole('button', { name: 'Sumar 1 repetición' })
    );
    expect(campoRepsEn(fila(), 1).value).toBe('9');
  });

  it('contrato 3: Restar no baja de 0', async () => {
    await abrirLista();
    const fila = () => filaDeSerie(tarjetaDe('Sentadilla'), 1);
    fireEvent.change(campoRepsEn(fila(), 1), { target: { value: '1' } });
    fireEvent.blur(campoRepsEn(fila(), 1));
    expect(campoRepsEn(fila(), 1).value).toBe('1');

    fireEvent.click(
      within(fila()).getByRole('button', { name: 'Restar 1 repetición' })
    );
    expect(campoRepsEn(fila(), 1).value).toBe('0');

    fireEvent.click(
      within(fila()).getByRole('button', { name: 'Restar 1 repetición' })
    );
    expect(campoRepsEn(fila(), 1).value).toBe('0');
  });

  it('contrato 4: con reps 12 escritas, salir y marcar envía repsLogradas: 12', async () => {
    await abrirLista();
    fireEvent.change(campoRepsEn(tarjetaDe('Sentadilla'), 1), { target: { value: '12' } });
    // Como el navegador al tocar el botón: blur antes del clic de marcar.
    fireEvent.blur(campoRepsEn(tarjetaDe('Sentadilla'), 1));
    fireEvent.click(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(putsRecibidos[0].series[0].serieId).toBe('s-1');
    expect(putsRecibidos[0].series[0].repsLogradas).toBe(12);
  });

  it('contrato 4: con el campo vaciado, salir y marcar envía el último valor guardado (8)', async () => {
    await abrirLista();
    fireEvent.change(campoRepsEn(tarjetaDe('Sentadilla'), 1), { target: { value: '' } });
    // Como el navegador al tocar el botón: blur antes del clic de marcar.
    fireEvent.blur(campoRepsEn(tarjetaDe('Sentadilla'), 1));
    fireEvent.click(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(putsRecibidos[0].series[0].serieId).toBe('s-1');
    expect(putsRecibidos[0].series[0].repsLogradas).toBe(8);
  });

  it('contrato nuevo: vaciar reps y marcar SIN blur envía 8 y al reabrir muestra 8 (no "")', async () => {
    await abrirLista();
    fireEvent.change(campoRepsEn(tarjetaDe('Sentadilla'), 1), { target: { value: '' } });
    expect(campoRepsEn(tarjetaDe('Sentadilla'), 1).value).toBe('');

    // SIN blur: se marca directamente con el borrador '' aún vivo.
    fireEvent.click(
      within(tarjetaDe('Sentadilla')).getByRole('button', {
        name: 'Marcar serie 1 como completada',
      })
    );

    await waitFor(() => expect(putsRecibidos.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(putsRecibidos[0].series[0].serieId).toBe('s-1');
    expect(putsRecibidos[0].series[0].repsLogradas).toBe(8);

    // Al reabrir la corrección el campo muestra el valor guardado, no el borrador huérfano ''.
    const corregir = await within(tarjetaDe('Sentadilla')).findByRole(
      'button',
      { name: /Completada, toca para corregir/ },
      { timeout: 5000 }
    );
    fireEvent.click(corregir);
    expect(
      (
        within(tarjetaDe('Sentadilla')).getByLabelText(
          'Repeticiones hechas, serie 1'
        ) as HTMLInputElement
      ).value
    ).toBe('8');
  });
});
