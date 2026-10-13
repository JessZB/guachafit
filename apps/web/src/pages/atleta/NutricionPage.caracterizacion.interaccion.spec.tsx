// @vitest-environment jsdom
/**
 * Módulo 6 · Nutrición — caracterización de interacción (fase B, prompt 56).
 *
 * Línea base en verde sobre el código actual (inventario 45 §6.2: los 6 tests SSR no
 * ejercitan interacción). Fija el comportamiento observable antes de extraer:
 * guardar sin semáforo, guardado feliz, 409, offline, ventana cerrada, fotos y bloqueo.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { NutricionPage } from './NutricionPage';
import { SemaforoNutricional } from '@guachafit/shared';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    isDemoMode: false,
  }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

vi.mock('../../lib/imagen-comprimida', () => ({
  comprimirImagenAWebp: (archivo: File) => Promise.resolve(archivo),
}));

import { ApiError, apiClient } from '../../lib/api-client';
import { clearOfflineData } from '../../lib/offline-db';

type MockApi = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockApi;

const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';

function checkinHoy() {
  return {
    id: 'checkin-hoy',
    alumnoId: ALUMNO_ID,
    fecha: '2026-09-21',
    semaforo: SemaforoNutricional.CUMPLIDO,
    caloriasReportadas: null,
    proteinaGramosReportada: null,
    aguaLitros: null,
    notasAlumno: null,
    fotosPlatos: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

function respuestaPorDefecto(url: string, opciones?: { method?: string }): unknown {
  if (typeof url === 'string' && url.includes('/nutricion/checkin-diario') && opciones?.method === 'POST') {
    return { checkin: checkinHoy() };
  }
  return null;
}

function renderPagina() {
  return render(createElement(MemoryRouter, null, createElement(NutricionPage)));
}

function fotoJpeg(nombre: string): File {
  return new File(['contenido-foto'], nombre, { type: 'image/jpeg' });
}

function cambiarArchivos(input: HTMLInputElement, archivos: File[]) {
  fireEvent.change(input, { target: { files: archivos } });
}

let contadorUrls = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 21, 19, 0, 0));
  contadorUrls = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:mock-${++contadorUrls}`,
    revokeObjectURL: () => {},
  });
  mockApi.mockImplementation((url: string, opciones?: { method?: string }) =>
    Promise.resolve(respuestaPorDefecto(url, opciones))
  );
});

afterEach(async () => {
  cleanup();
  await clearOfflineData();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('NutricionPage · caracterización (render inicial)', () => {
  it('muestra el encabezado, el semáforo sin elegir y el Guardar habilitado', async () => {
    renderPagina();

    expect(await screen.findByText('Mi Comida de Hoy')).toBeDefined();
    expect(screen.getByText('¿Cómo te fue hoy con tu plan?')).toBeDefined();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    const guardar = screen.getByRole('button', { name: /Guardar reporte nutricional/ });
    expect(guardar.hasAttribute('disabled')).toBe(false);
  });
});

describe('NutricionPage · caracterización (guardado)', () => {
  it('guardar sin semáforo muestra el mensaje junto al grupo y le da el foco', async () => {
    renderPagina();
    const guardar = await screen.findByRole('button', { name: /Guardar reporte nutricional/ });

    fireEvent.click(guardar);

    const alerta = await screen.findByText(/Elige cómo te fue hoy con tu plan\./);
    expect(alerta.closest('[role="alert"]')).not.toBeNull();
    expect(document.activeElement?.tagName).toBe('FIELDSET');
    expect(mockApi).not.toHaveBeenCalledWith(
      expect.stringContaining('/nutricion/checkin-diario'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('guardado feliz envía el POST y deja el reporte como ya registrado', async () => {
    renderPagina();
    fireEvent.click(await screen.findByRole('button', { name: /^Cumplido/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar reporte nutricional/ }));

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringContaining('/nutricion/checkin-diario'),
        expect.objectContaining({ method: 'POST' })
      );
    });
    expect(await screen.findByRole('button', { name: /Reporte de hoy ya registrado/ })).toBeDefined();
  });

  it('conflicto 409 refresca y muestra el reporte ya registrado con aviso', async () => {
    let postIntentado = false;
    mockApi.mockImplementation((url: string, opciones?: { method?: string }) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin-diario') && opciones?.method === 'POST') {
        postIntentado = true;
        return Promise.reject(
          new ApiError(409, {
            type: 'about:blank',
            title: 'Conflicto',
            status: 409,
            detail: 'El reporte de hoy ya existe.',
            timestampUtc: new Date().toISOString(),
          })
        );
      }
      if (typeof url === 'string' && url.includes('/nutricion/checkin/hoy')) {
        return Promise.resolve(postIntentado ? checkinHoy() : null);
      }
      return Promise.resolve(null);
    });
    renderPagina();
    fireEvent.click(await screen.findByRole('button', { name: /^Cumplido/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar reporte nutricional/ }));

    expect(await screen.findByRole('button', { name: /Reporte de hoy ya registrado/ })).toBeDefined();
    // 409: el refresco deja el reporte registrado Y el aviso informativo (2 `status`;
    // en el guardado feliz solo hay 1).
    const estados = await screen.findAllByRole('status');
    expect(estados.length).toBeGreaterThanOrEqual(2);
  });

  it('sin conexión encola el reporte y lo declara pendiente, sin llamar a la API', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      renderPagina();
      fireEvent.click(await screen.findByRole('button', { name: /^Cumplido/ }));
      fireEvent.click(screen.getByRole('button', { name: /Guardar reporte nutricional/ }));

      expect(
        await screen.findByRole('button', { name: /Guardado sin conexión · pendiente de envío/ })
      ).toBeDefined();
      expect(mockApi).not.toHaveBeenCalledWith(
        expect.stringContaining('/nutricion/checkin-diario'),
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('NutricionPage · caracterización (ventana y bloqueo)', () => {
  it('fuera de ventana avisa y deja el Guardar como disponible desde las 18:00', async () => {
    vi.setSystemTime(new Date(2026, 8, 21, 10, 0, 0));
    renderPagina();

    expect(await screen.findByText('El reporte aún no está abierto')).toBeDefined();
    const guardar = screen.getByRole('button', { name: /Disponible a partir de las 18:00/ });
    expect(guardar.hasAttribute('disabled')).toBe(true);
  });

  it('bloqueo RF-012 reemplaza el formulario por el panel con reintento', async () => {
    mockApi.mockImplementation((url: string, opciones?: { method?: string }) => {
      if (typeof url === 'string' && url.includes('/nutricion/checkin-diario') && opciones?.method === 'POST') {
        return Promise.reject(
          new ApiError(403, {
            type: 'about:blank',
            title: 'Bloqueado',
            status: 403,
            code: 'ALUMNO_BLOQUEADO',
            estado: 'suspendido_pago',
          } as never)
        );
      }
      return Promise.resolve(null);
    });
    renderPagina();
    fireEvent.click(await screen.findByRole('button', { name: /^Cumplido/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar reporte nutricional/ }));

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeDefined();
    expect(screen.queryByText('Mi Comida de Hoy')).toBeNull();
  });
});

describe('NutricionPage · caracterización (fotos)', () => {
  it('rechaza el formato inválido con aviso y sin agregar nada', async () => {
    renderPagina();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    cambiarArchivos(input, [new File(['texto'], 'nota.txt', { type: 'text/plain' })]);

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText(/JPG, PNG o WebP/)).toBeDefined();
    expect(screen.getByText(/0\/4 fotos/)).toBeDefined();
  });

  it('al intentar la quinta foto avisa del máximo del día', async () => {
    renderPagina();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    cambiarArchivos(input, [fotoJpeg('a.jpg'), fotoJpeg('b.jpg'), fotoJpeg('c.jpg'), fotoJpeg('d.jpg')]);
    await waitFor(() => expect(screen.getByText(/4\/4 fotos/)).toBeDefined());

    cambiarArchivos(input, [fotoJpeg('e.jpg')]);
    expect(await screen.findByText(/el máximo del día/)).toBeDefined();
  });
});
