// @vitest-environment jsdom
/**
 * Prompt 71 (caracterización, fuera de demo): fija el comportamiento ACTUAL del
 * `SelectorPlantillaAsignacion` en las rutas con red, inalcanzables en demo
 * (carga, error con reintento, vacío, error de detalle, asignación real).
 *
 * Monta como los specs existentes del proyecto: `apiClient` mockeado con el
 * patrón de `PlantillasPage.caracterizacion` y fixtures de `demo-plantillas`
 * como respuestas de red. Sin `QueryClientProvider` (R9).
 * `@testing-library/user-event` no está instalado: se usa `fireEvent`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: false }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }),
  };
});

import { ModoAsignacionPlantilla, type PlantillaRutinaDTO } from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { detallePlantillaDemo, plantillasDemoActivas } from '../../lib/demo-plantillas';
import { SelectorPlantillaAsignacion } from './SelectorPlantillaAsignacion';

const apiMock = apiClient as unknown as ReturnType<typeof vi.fn>;

const ALUMNO_ID = 'alumno-1';
const ALUMNO_NOMBRE = 'Ana Pérez';
const PLANTILLA_ELEGIDA = 'Tren Superior Hipertrofia A';
const EJERCICIO_AJUSTADO = 'Fondos en Paralelas Asistidos';

const RESUMENES = plantillasDemoActivas();
const DETALLE: PlantillaRutinaDTO = (() => {
  const detalle = detallePlantillaDemo(RESUMENES[0].id);
  if (!detalle) throw new Error('Sin fixture de detalle para caracterización');
  return detalle;
})();

function respuestaAsignacion() {
  return {
    plantillaId: DETALLE.id,
    modo: ModoAsignacionPlantilla.FUSIONAR,
    totalSolicitados: 1,
    exitosos: 1,
    fallidos: 0,
    resultados: [
      {
        alumnoId: ALUMNO_ID,
        exito: true,
        rutinaId: 'rutina-1',
        rutinaNombre: DETALLE.nombre,
        bloquesTotal: DETALLE.bloques.length,
      },
    ],
  };
}

function mockRedListaYDetalle() {
  apiMock.mockImplementation((url: string) => {
    if (url === '/plantillas?activa=true') return Promise.resolve(RESUMENES);
    if (url === `/plantillas/${RESUMENES[0].id}`) return Promise.resolve(DETALLE);
    throw new Error(`URL no mockeada: ${url}`);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderizarSelector() {
  const onCerrar = vi.fn();
  const onAsignada = vi.fn();
  render(
    <MemoryRouter>
      <SelectorPlantillaAsignacion
        alumnoId={ALUMNO_ID}
        alumnoNombre={ALUMNO_NOMBRE}
        onCerrar={onCerrar}
        onAsignada={onAsignada}
      />
    </MemoryRouter>
  );
  return { onCerrar, onAsignada };
}

function elegirPlantilla(nombre: string = PLANTILLA_ELEGIDA): void {
  const nodo = screen.getByText(nombre);
  fireEvent.click(nodo.closest('button') ?? nodo);
}

function avanzar(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

async function irAlPaso3ConUnAjusteFusionar() {
  mockRedListaYDetalle();
  apiMock.mockImplementation((url: string, opciones?: { method?: string; body?: string }) => {
    if (url === '/plantillas?activa=true') return Promise.resolve(RESUMENES);
    if (url === `/plantillas/${RESUMENES[0].id}` && !opciones?.method)
      return Promise.resolve(DETALLE);
    if (url === `/plantillas/${DETALLE.id}/asignar`) return Promise.resolve(respuestaAsignacion());
    throw new Error(`URL no mockeada: ${url}`);
  });
  const mocks = renderizarSelector();
  await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });
  elegirPlantilla();
  // Espera el detalle: el botón "Siguiente" se habilita al resolver.
  await waitFor(() => {
    expect(
      (screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
  avanzar();
  await screen.findByText('Paso 2 de 3 · Revisar y ajustar', undefined, { timeout: 5000 });
  fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
  avanzar();
  await screen.findByText('Paso 3 de 3 · Confirmar', undefined, { timeout: 5000 });
  fireEvent.click(screen.getByRole('radio', { name: /Añadir a la rutina actual/ }));
  return mocks;
}

describe('SelectorPlantillaAsignacion · caracterización de carga: skeleton', () => {
  it('muestra "Cargando plantillas" mientras la red pende y luego la lista', async () => {
    const diferido: { resolver?: (valor: unknown) => void } = {};
    apiMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          diferido.resolver = resolve;
        })
    );
    renderizarSelector();

    expect(screen.getByLabelText('Cargando plantillas')).toBeTruthy();

    diferido.resolver?.(RESUMENES);
    await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });
    expect(
      within(screen.getByRole('list')).getAllByRole('listitem')
    ).toHaveLength(RESUMENES.length);
  });
});

describe('SelectorPlantillaAsignacion · caracterización de carga: error y vacío', () => {
  it('el error de carga muestra el mensaje y "Reintentar" recarga la lista', async () => {
    apiMock.mockRejectedValueOnce(new Error('Fallo de red'));
    renderizarSelector();

    await screen.findByText('Fallo de red', undefined, { timeout: 5000 });

    apiMock.mockResolvedValueOnce(RESUMENES);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });
  });

  it('sin plantillas activas ofrece crear una en "Plantillas de ejercicios"', async () => {
    apiMock.mockResolvedValueOnce([]);
    renderizarSelector();

    await screen.findByText('No tienes plantillas activas', undefined, { timeout: 5000 });
    expect(screen.getByRole('link', { name: 'Plantillas de ejercicios' })).toBeTruthy();
  });
});

describe('SelectorPlantillaAsignacion · caracterización de carga: detalle', () => {
  it('el error de detalle muestra su alerta y "Siguiente" sigue deshabilitado', async () => {
    apiMock.mockImplementation((url: string) => {
      if (url === '/plantillas?activa=true') return Promise.resolve(RESUMENES);
      return Promise.reject(new Error('Detalle caído'));
    });
    renderizarSelector();
    await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });

    elegirPlantilla();

    await screen.findByText('Detalle caído', undefined, { timeout: 5000 });
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});

describe('SelectorPlantillaAsignacion · caracterización de carga: asignación real', () => {
  it('con "Añadir" asigna sin diálogo, muestra el éxito y llama a onAsignada', async () => {
    const { onAsignada } = await irAlPaso3ConUnAjusteFusionar();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));

    const exito = await screen.findByRole('status', undefined, { timeout: 5000 });
    expect(exito.textContent).toContain(ALUMNO_NOMBRE);
    expect(onAsignada).toHaveBeenCalledTimes(1);

    const llamadaAsignar = apiMock.mock.calls.find((args) =>
      String(args[0]).endsWith('/asignar')
    );
    expect(llamadaAsignar).toBeTruthy();
    expect(String(llamadaAsignar?.[1]?.body)).toContain(ModoAsignacionPlantilla.FUSIONAR);
  });

  it('si la red falla al asignar, muestra su alerta sin éxito', async () => {
    apiMock.mockImplementation((url: string, opciones?: { method?: string }) => {
      if (url === '/plantillas?activa=true') return Promise.resolve(RESUMENES);
      if (url === `/plantillas/${RESUMENES[0].id}` && !opciones?.method)
        return Promise.resolve(DETALLE);
      return Promise.reject(new Error('Asignación caída'));
    });
    renderizarSelector();
    await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });
    elegirPlantilla();
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled
      ).toBe(false);
    });
    avanzar();
    await screen.findByText('Paso 2 de 3 · Revisar y ajustar', undefined, { timeout: 5000 });
    avanzar();
    await screen.findByText('Paso 3 de 3 · Confirmar', undefined, { timeout: 5000 });
    fireEvent.click(screen.getByRole('radio', { name: /Añadir a la rutina actual/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));

    await screen.findByText('Asignación caída', undefined, { timeout: 5000 });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
