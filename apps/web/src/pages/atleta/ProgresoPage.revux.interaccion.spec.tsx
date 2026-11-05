// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.setConfig({ testTimeout: 20000 });

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
  MENSAJE_FOTO_FORMATO: 'No se pudo procesar la imagen.',
  MENSAJE_FOTO_SIN_CONEXION: 'No se pudo subir la foto: revisa tu conexión.',
  MENSAJE_FOTO_SIN_URL: 'No se pudo subir la foto.',
  mensajeFotoPutFallido: (status: number) => `No se pudo subir (${status}).`,
  prepararFotoAntropometria: vi.fn(async (archivo: File) => archivo),
  subirFotoAntropometria: vi.fn(
    async (_archivo: File, alumnoId: string, angulo: string) =>
      `antropometria/${alumnoId}/2026/foto-${angulo}.webp`
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

const EVOLUCION_CON_DATOS = {
  alumnoId: sesionMock.usuario.id,
  totalEvaluaciones: 1,
  controlesTotal: 1,
  evaluaciones: [
    {
      id: 'eval-1',
      fecha: '2026-10-01',
      pesoKg: '72.00',
      porcentajeGrasa: '15.5',
      cinturaCm: '80.0',
      brazoRelajadoCm: '32.0',
      brazoContraidoCm: '34.0',
      musloMedioCm: '55.0',
      tricepsMm: '10.0',
      subescapularMm: '12.0',
      suprailiacoMm: '11.0',
      abdominalMm: '14.0',
      fotos: [],
      tipoRegistro: 'remoto',
    },
  ],
  cambioNetoPesoKg: null,
  cambioNetoGrasaPorcentaje: null,
  rangoSeleccionado: 'todo',
};

async function abrirFormulario() {
  const botonAbrir = await screen.findByRole('button', { name: /Tus medidas/i });
  fireEvent.click(botonAbrir);
  await screen.findByRole('button', { name: /Volver a opciones de progreso/i });
}

describe('ProgresoPage · REVUX (G2)', () => {
  beforeEach(() => {
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:foto');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    mockApi.mockReset();
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/me') return Promise.resolve({ usuario: sesionMock.usuario });
      if (endpoint.startsWith('/antropometria/evolucion/')) return Promise.resolve(EVOLUCION_CON_DATOS);
      if (endpoint === '/antropometria/checkin') return Promise.resolve({});
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('R7: al abrir nuevo check-in (precarga última medición) y pulsar «Volver» sin editar nada, regresa al hub sin diálogo', async () => {
    render(<ProgresoPage />);
    await abrirFormulario();

    // El peso precargado es 72.00
    const inputPeso = screen.getByLabelText('Peso (kg)') as HTMLInputElement;
    expect(inputPeso.value).toBe('72.00');

    // Pulsar Volver sin editar nada
    const botonVolver = screen.getByRole('button', { name: /Volver a opciones de progreso/i });
    fireEvent.click(botonVolver);

    // Regresa al hub sin diálogo de confirmación de descarte
    expect(screen.queryByText('¿Descartar cambios sin guardar?')).toBeNull();
    expect(await screen.findByRole('button', { name: /Tus medidas/i })).not.toBeNull();
  });

  it('R8: al cambiar un campo y pulsar «Volver», aparece el diálogo de descarte y «Continuar editando» conserva lo escrito', async () => {
    render(<ProgresoPage />);
    await abrirFormulario();

    // Modificar el peso
    const inputPeso = screen.getByLabelText('Peso (kg)') as HTMLInputElement;
    fireEvent.change(inputPeso, { target: { value: '75.50' } });

    // Pulsar Volver
    const botonVolver = screen.getByRole('button', { name: /Volver a opciones de progreso/i });
    fireEvent.click(botonVolver);

    // Aparece el diálogo de descarte
    expect(screen.getByText('¿Descartar cambios sin guardar?')).not.toBeNull();

    // Cancelar el descarte (continuar editando)
    const botonContinuar = screen.getByRole('button', { name: /Continuar editando/i });
    fireEvent.click(botonContinuar);

    // Diálogo cerrado y el valor escrito se conserva
    await waitFor(() => expect(screen.queryByText('¿Descartar cambios sin guardar?')).toBeNull());
    expect((screen.getByLabelText('Peso (kg)') as HTMLInputElement).value).toBe('75.50');
  });

  it('R9: al escribir un valor, pulsar «Volver», confirmar descarte y reabrir, muestra la medición real original', async () => {
    render(<ProgresoPage />);
    await abrirFormulario();

    // Modificar peso a 88.00
    const inputPeso = screen.getByLabelText('Peso (kg)') as HTMLInputElement;
    fireEvent.change(inputPeso, { target: { value: '88.00' } });

    // Pulsar Volver y confirmar descarte
    fireEvent.click(screen.getByRole('button', { name: /Volver a opciones de progreso/i }));
    fireEvent.click(screen.getByRole('button', { name: /Descartar y salir/i }));

    // Regresó al hub
    expect(await screen.findByRole('button', { name: /Tus medidas/i })).not.toBeNull();

    // Reabrir formulario
    await abrirFormulario();

    // Los campos muestran la medición real precargada (72.00), no lo descartado (88.00)
    expect((screen.getByLabelText('Peso (kg)') as HTMLInputElement).value).toBe('72.00');
    expect(screen.queryByAltText(/Foto .* lista/i)).toBeNull();
  });

  it('R10: al adjuntar una foto sin tocar medidas y pulsar «Volver», aparece diálogo; tras descartar y reabrir no hay fotos', async () => {
    render(<ProgresoPage />);
    await abrirFormulario();

    // Adjuntar foto
    const archivo = new File(['contenido-foto'], 'progreso.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Foto frontal'), { target: { files: [archivo] } });
    await screen.findByAltText('Foto frontal lista');

    // Permitir que se sincronicen los efectos de subida de fotos con el hook del formulario
    await act(async () => {
      await Promise.resolve();
    });

    // Pulsar Volver sin tocar medidas
    fireEvent.click(screen.getByRole('button', { name: /Volver a opciones de progreso/i }));

    // Aparece el diálogo de descarte por las fotos adjuntas
    expect(await screen.findByText('¿Descartar cambios sin guardar?')).not.toBeNull();

    // Confirmar descarte
    fireEvent.click(screen.getByRole('button', { name: /Descartar y salir/i }));

    // Reabrir formulario
    await abrirFormulario();

    // El selector está limpio: no hay fotos listas
    expect(screen.queryByAltText('Foto frontal lista')).toBeNull();
  });

  it('R11: el botón de enviar tiene como nombre accesible exactamente su texto visible «Enviar a mi entrenador»', async () => {
    render(<ProgresoPage />);
    await abrirFormulario();

    const botonEnviar = screen.getByRole('button', { name: 'Enviar a mi entrenador' });
    expect(botonEnviar).not.toBeNull();
    expect(botonEnviar.getAttribute('aria-label')).toBeNull();
    expect(botonEnviar.textContent).toContain('Enviar a mi entrenador');
  });

  it('R12: sin conexión a internet el selector de fotos está deshabilitado; con conexión está habilitado', async () => {
    // 1. Sin conexión
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const { unmount } = render(<ProgresoPage />);
    await abrirFormulario();

    const inputFotoOffline = screen.getByLabelText('Foto frontal') as HTMLInputElement;
    expect(inputFotoOffline.disabled).toBe(true);
    unmount();

    // 2. Con conexión
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    render(<ProgresoPage />);
    await abrirFormulario();

    const inputFotoOnline = screen.getByLabelText('Foto frontal') as HTMLInputElement;
    expect(inputFotoOnline.disabled).toBe(false);
  });
});
