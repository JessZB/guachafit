// @vitest-environment happy-dom
/**
 * RF-003 "fotos del check-in" · contrato 18 (opcional): el modal "Registrar control" de
 * `AlumnoDetallePage` contiene `SelectorFotosCheckin` y el POST `/antropometria/checkin` lleva
 * `fotos: [{ angulo, storageKey }]` cuando hay una foto lista.
 *
 * Montaje: la página se abre con el deep-link `?tab=antropometria` (WU16) sobre un `MemoryRouter`;
 * el expediente y sus consultas neutras se responden con el `apiClient` parcialmente mockeado
 * (mismo patrón que `AjustesPage.interaccion.spec.tsx`). La subida real de fotos se sustituye por
 * el módulo `antropometria-fotos` mockeado (mismo patrón que `ProgresoPage.fotos`), porque la
 * compresión real no es ejercitable en jsdom.
 *
 * El formulario del modal asocia sus etiquetas sin `htmlFor`, así que los dos campos numéricos
 * requeridos se localizan por orden dentro del diálogo (`input[type="text"]`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  AnguloFoto,
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const CLAVE_FRONTAL = `antropometria/${ALUMNO_USUARIO_ID}/2026/22222222-2222-4222-8222-000000000001.webp`;

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: false,
  }),
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
      `antropometria/${alumnoId}/2026/22222222-2222-4222-8222-000000000001.webp`
  ),
  avisoFotosFaltantes: vi.fn(() => null),
}));

import { apiClient } from '../../lib/api-client';
import { AlumnoDetallePage } from './AlumnoDetallePage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

async function moduloFotosMockeado() {
  const modulo = await import('../../lib/antropometria-fotos');
  return {
    subirFotoAntropometria: modulo.subirFotoAntropometria as unknown as MockFn,
  };
}

const PERFIL: PerfilAlumnoDetalleDTO = {
  id: CLIENTE_ID,
  usuarioId: ALUMNO_USUARIO_ID,
  entrenadorId: 'e1111111-1111-4111-8111-111111111111',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '12345678',
  nombres: 'María',
  apellidos: 'López',
  email: 'maria@example.com',
  fechaNacimiento: '1995-04-12',
  edadCalculada: 31,
  telefonoWhatsapp: '+584140000000',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  periodicidadAntropometria: null,
  antropometriaInicio: null,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:foto');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
    if (endpoint === '/finanzas/planes') return Promise.resolve([]);
    if (endpoint.startsWith('/antropometria/evolucion/')) {
      return Promise.resolve({ evaluaciones: [], controlesTotal: 0 });
    }
    if (endpoint === '/antropometria/checkin') {
      return Promise.resolve({
        id: 'ctrl-nuevo',
        fechaEvaluacion: '2026-10-08',
        pesoKg: '80.00',
        porcentajeGrasa: '18.50',
        perimetros: null,
      });
    }
    if (endpoint.startsWith('/sesiones/alumno/')) return Promise.resolve({ items: [], total: 0 });
    if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
    if (endpoint.startsWith('/rutinas/alumno/')) return Promise.resolve(null);
    if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Monta el expediente en el tab Antropometría y abre el modal "Registrar control". */
async function abrirModalControl(): Promise<HTMLElement> {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=antropometria`]}>
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );

  const abrir = await screen.findByRole('button', { name: 'Registrar control' });
  fireEvent.click(abrir);
  return screen.findByRole('dialog');
}

describe('AlumnoDetallePage · contrato 18 (opcional): fotos del control en sala', () => {
  it('con una foto lista, el POST /antropometria/checkin lleva fotos: [{ angulo, storageKey }]', async () => {
    const dialogo = await abrirModalControl();

    // Peso (kg) y % Grasa Corporal son los dos primeros `input[type="text"]` del modal y son
    // requeridos; el resto son perímetros opcionales.
    const entradasTexto = dialogo.querySelectorAll<HTMLInputElement>('input[type="text"]');
    expect(entradasTexto.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(entradasTexto[0] as HTMLInputElement, { target: { value: '80.00' } });
    fireEvent.change(entradasTexto[1] as HTMLInputElement, { target: { value: '18.50' } });

    const archivo = new File(['foto'], 'frontal.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    await screen.findByAltText('Foto frontal lista');

    const enviar = screen.getByRole('button', {
      name: /Guardar Control Antropométrico/,
    }) as HTMLButtonElement;
    // El botón no puede estar bloqueado por una subida en curso (estado del padre).
    await waitFor(() => expect(enviar.disabled).toBe(false));
    fireEvent.click(enviar);

    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(([endpoint]) => endpoint === '/antropometria/checkin')
      ).toBe(true)
    );

    const llamada = mockApi.mock.calls.find(
      ([endpoint]) => endpoint === '/antropometria/checkin'
    ) as [string, { body: string }];
    const cuerpo = JSON.parse(llamada[1].body);
    expect(cuerpo.alumnoId).toBe(ALUMNO_USUARIO_ID);
    expect(cuerpo.fotos).toEqual([{ angulo: AnguloFoto.FRONTAL, storageKey: CLAVE_FRONTAL }]);
  });

  it('mientras una foto se sube, Guardar Control Antropométrico está deshabilitado', async () => {
    const dialogo = await abrirModalControl();

    const entradasTexto = dialogo.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireEvent.change(entradasTexto[0] as HTMLInputElement, { target: { value: '80.00' } });
    fireEvent.change(entradasTexto[1] as HTMLInputElement, { target: { value: '18.50' } });

    const { subirFotoAntropometria } = await moduloFotosMockeado();
    let resolverSubida: (clave: string) => void = () => undefined;
    subirFotoAntropometria.mockImplementationOnce(
      () =>
        new Promise<string>((resolver) => {
          resolverSubida = resolver;
        })
    );

    const archivo = new File(['foto'], 'frontal.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });

    const enviar = screen.getByRole('button', {
      name: /Guardar Control Antropométrico/,
    }) as HTMLButtonElement;
    await waitFor(() => expect(enviar.disabled).toBe(true));

    await act(async () => {
      resolverSubida(CLAVE_FRONTAL);
    });
    await screen.findByAltText('Foto frontal lista');
    await waitFor(() => expect(enviar.disabled).toBe(false));
  });

  it('S-01: tras un guardado correcto, al reabrir el modal el selector vuelve a estar vacío', async () => {
    const dialogo = await abrirModalControl();

    const entradasTexto = dialogo.querySelectorAll<HTMLInputElement>('input[type="text"]');
    fireEvent.change(entradasTexto[0] as HTMLInputElement, { target: { value: '80.00' } });
    fireEvent.change(entradasTexto[1] as HTMLInputElement, { target: { value: '18.50' } });

    const archivo = new File(['foto'], 'frontal.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    await screen.findByAltText('Foto frontal lista');

    const guardar = screen.getByRole('button', {
      name: /Guardar Control Antropométrico/,
    }) as HTMLButtonElement;
    await waitFor(() => expect(guardar.disabled).toBe(false));
    fireEvent.click(guardar);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar control' }));
    const dialogoReabierto = await screen.findByRole('dialog');
    expect(within(dialogoReabierto).queryByAltText('Foto frontal lista')).toBeNull();
    expect(
      within(dialogoReabierto).queryByRole('button', { name: 'Quitar foto frontal' })
    ).toBeNull();
  });
});
