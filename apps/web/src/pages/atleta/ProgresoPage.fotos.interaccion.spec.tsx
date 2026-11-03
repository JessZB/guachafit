// @vitest-environment jsdom
/**
 * RF-003 "fotos del check-in" · ProgresoPage (contrato 17: UI de fotos y envío CON foto).
 *
 * Cubre:
 * - las tres entradas de archivo de `SelectorFotosCheckin` dentro del formulario;
 * - el POST a `/antropometria/checkin` con `fotos: [{ angulo, storageKey }]` cuando hay foto lista;
 * - el botón de enviar deshabilitado mientras una foto se sube;
 * - el selector vuelve a estar vacío tras un envío correcto.
 *
 * `antropometria-fotos` se mockea: su compresión real no es ejercitable en jsdom y el componente la
 * usa por defecto. El montaje de la página usa el patrón de los specs de Ajustes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnguloFoto } from '@guachafit/shared';

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';
/** Clave con la estructura que emite el presign (UUID válidos), como exige el API real. */
const CLAVE_FRONTAL_MOCK = `antropometria/${ALUMNO_ID}/2026/00000000-0000-4000-8000-0000000000f1.webp`;

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
    zonaHoraria: 'America/Caracas',
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
    }),
  };
});

vi.mock('../../lib/antropometria-fotos', () => ({
  MENSAJE_FOTO_FORMATO: 'No se pudo procesar la imagen. Prueba con una foto JPG o WebP.',
  MENSAJE_FOTO_SIN_CONEXION:
    'No se pudo subir la foto: revisa tu conexión e inténtalo de nuevo.',
  MENSAJE_FOTO_SIN_URL:
    'No se pudo subir la foto: el servidor no devolvió una URL de subida. Inténtalo de nuevo en unos minutos.',
  mensajeFotoPutFallido: (status: number) =>
    `No se pudo subir la foto (${status}). Revisa tu conexión e inténtalo de nuevo.`,
  prepararFotoAntropometria: vi.fn(async (archivo: File) => archivo),
  subirFotoAntropometria: vi.fn(
    async (_archivo: File, alumnoId: string, _angulo: string) =>
      `antropometria/${alumnoId}/2026/00000000-0000-4000-8000-0000000000f1.webp`
  ),
  avisoFotosFaltantes: vi.fn(() => null),
}));

import { apiClient } from '../../lib/api-client';
import { ProgresoPage } from './ProgresoPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

const EVOLUCION_VACIA = {
  alumnoId: ALUMNO_ID,
  totalEvaluaciones: 0,
  controlesTotal: 0,
  evaluaciones: [],
  cambioNetoPesoKg: null,
  cambioNetoGrasaPorcentaje: null,
  rangoSeleccionado: 'todo',
};

beforeEach(() => {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:foto');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === '/auth/me') return Promise.resolve({ usuario: sesionMock.usuario });
    if (endpoint.startsWith('/antropometria/evolucion/')) return Promise.resolve(EVOLUCION_VACIA);
    if (endpoint === '/antropometria/checkin') return Promise.resolve({});
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function abrirFormularioCheckin(): Promise<void> {
  render(<ProgresoPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tus medidas/ }));
  await screen.findByLabelText('Peso (kg)');
}

async function moduloFotosMockeado() {
  const modulo = await import('../../lib/antropometria-fotos');
  return {
    prepararFotoAntropometria: modulo.prepararFotoAntropometria as unknown as MockFn,
    subirFotoAntropometria: modulo.subirFotoAntropometria as unknown as MockFn,
  };
}

describe('ProgresoPage · UI de fotos del check-in (contrato 17)', () => {
  it('las tres entradas de SelectorFotosCheckin aparecen en el formulario del check-in', async () => {
    await abrirFormularioCheckin();

    for (const etiqueta of ['Foto frontal', 'Foto lateral', 'Foto posterior']) {
      const entrada = screen.getByLabelText(etiqueta);
      expect(entrada).toBeInstanceOf(HTMLInputElement);
      expect((entrada as HTMLInputElement).type).toBe('file');
      expect((entrada as HTMLInputElement).accept).toBe('image/*');
    }
  });

  it('con una foto lista, el POST lleva fotos: [{ angulo, storageKey }]', async () => {
    const { subirFotoAntropometria } = await moduloFotosMockeado();
    subirFotoAntropometria.mockImplementation(
      async (_archivo: File, alumnoId: string, _angulo: string) =>
        `antropometria/${alumnoId}/2026/00000000-0000-4000-8000-0000000000f1.webp`
    );

    await abrirFormularioCheckin();

    const archivo = new File(['foto'], 'progreso.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    await screen.findByAltText('Foto frontal lista');

    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '74.50' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar a mi entrenador/ }));

    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(([endpoint]) => endpoint === '/antropometria/checkin')
      ).toBe(true)
    );

    const llamada = mockApi.mock.calls.find(
      ([endpoint]) => endpoint === '/antropometria/checkin'
    ) as [string, { body: string }];
    const cuerpo = JSON.parse(llamada[1].body);
    expect(cuerpo.fotos).toEqual([
      {
        angulo: AnguloFoto.FRONTAL,
        storageKey: CLAVE_FRONTAL_MOCK,
      },
    ]);
  });

  it('mientras una foto se sube, el botón de enviar está deshabilitado', async () => {
    const { subirFotoAntropometria } = await moduloFotosMockeado();
    let resolverSubida: (clave: string) => void = () => undefined;
    subirFotoAntropometria.mockImplementationOnce(
      () =>
        new Promise<string>((resolver) => {
          resolverSubida = resolver;
        })
    );

    await abrirFormularioCheckin();

    const archivo = new File(['foto'], 'progreso.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });

    const botonEnviar = screen.getByRole('button', { name: /Enviar a mi entrenador/ });
    await waitFor(() => expect((botonEnviar as HTMLButtonElement).disabled).toBe(true));

    await act(async () => {
      resolverSubida(CLAVE_FRONTAL_MOCK);
    });
    await screen.findByAltText('Foto frontal lista');
  });

  it('tras un envío correcto, el selector se descarta y al reabrir el formulario vuelve a estar vacío', async () => {
    await abrirFormularioCheckin();

    const archivo = new File(['foto'], 'progreso.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    await screen.findByAltText('Foto frontal lista');

    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '74.50' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar a mi entrenador/ }));

    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(([endpoint]) => endpoint === '/antropometria/checkin')
      ).toBe(true)
    );

    // El panel de éxito desmonta el formulario (y con él, el selector con su foto).
    expect(await screen.findByText('¡Medidas guardadas!')).toBeTruthy();
    expect(screen.queryByLabelText('Foto frontal')).toBeNull();

    // Al reabrir el formulario, el selector se monta vacío (el padre ya cambió su `key`).
    const reabrir = await screen.findByRole(
      'button',
      { name: /Nuevo check-in/ },
      { timeout: 3000 }
    );
    fireEvent.click(reabrir);
    await screen.findByLabelText('Peso (kg)');
    // Selector recién montado y vacío (en este spec `avisoFotosFaltantes` está mockeado).
    expect(screen.getByLabelText('Foto frontal')).toBeTruthy();
    expect(screen.queryByAltText('Foto frontal lista')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quitar foto frontal' })).toBeNull();
  });
});
