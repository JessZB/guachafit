// @vitest-environment jsdom
/**
 * Prompt 83 (Ola 3) · tests de caracterización de `AsignacionMasivaPlantilla`.
 *
 * Fijan el comportamiento ACTUAL en verde sobre el código vigente (ODD
 * `modularizacion-vistas-web.md`, R5): describen lo que hay, no lo que debería haber.
 * La extracción deberá mantenerlos en verde con el mismo número de tests.
 *
 * Patrón de montaje copiado de `PlantillasPage.caracterizacion.interaccion.spec.tsx`:
 * `useAuth` mockeado con bandera `isDemoMode` conmutable y `apiClient` mockeado
 * preservando el resto vía `importOriginal`. Sin `QueryClientProvider`: el archivo usa
 * `useEffect`/`useState` + `apiClient` directo (R9).
 * `@testing-library/user-event` no está instalado: se usa `fireEvent`.
 *
 * Consultas solo por rol, label o texto accesible. Nunca por clases ni estructura interna.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ModoAsignacionPlantilla,
  NivelObjetivoPlantilla,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({ isDemoMode: true }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: sesionMock.isDemoMode }),
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

import { apiClient } from '../../lib/api-client';
import { ROSTER_DEMO_DIRECTORIO } from '../../lib/directorio-alumnos';
import { AsignacionMasivaPlantilla } from './AsignacionMasivaPlantilla';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

const PLANTILLA: PlantillaRutinaResumenDTO = {
  id: 'p-demo-1',
  entrenadorId: 'e1',
  nombre: 'Tren Superior Hipertrofia A',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  totalDias: 3,
  totalEjercicios: 9,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
};

const NOMBRE_1 = 'Carlos Alberto Mendoza Silva';
const NOMBRE_2 = 'Mariana Pérez Gómez';
const NOMBRE_3 = 'Roberto Díaz Navarro';

function montar() {
  const onCerrar = vi.fn();
  render(
    <MemoryRouter>
      <AsignacionMasivaPlantilla plantilla={PLANTILLA} onCerrar={onCerrar} />
    </MemoryRouter>
  );
  return { onCerrar };
}

function marcarAlumno(nombre: string): void {
  fireEvent.click(screen.getByRole('checkbox', { name: nombre }));
}

beforeEach(() => {
  sesionMock.isDemoMode = true;
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
});

/* ================================================================== */
/* Modo demo (isDemoMode): roster local sin llamadas al API.            */
/* ================================================================== */

describe('AsignacionMasivaPlantilla caracterización · modo demo', () => {
  it('1. render inicial: título, plantilla, radios, buscador, roster y asignar deshabilitado', async () => {
    montar();

    expect(screen.getByRole('dialog', { name: 'Asignar a alumnos' })).toBeTruthy();
    expect(screen.getByText('Plantilla «Tren Superior Hipertrofia A» · elige hasta 50 alumnos.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Añadir a la rutina actual/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Reemplazar la rutina actual/ })).toBeTruthy();
    expect(screen.getByLabelText('Alumnos')).toBeTruthy();
    expect(screen.getByPlaceholderText('Buscar por nombre...')).toBeTruthy();

    // Roster demo visible sin llamadas al API.
    expect(await screen.findByText(NOMBRE_1)).toBeTruthy();
    expect(screen.getByText(NOMBRE_2)).toBeTruthy();
    expect(screen.getByText(/0 de 50 seleccionados/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Asignar a 0 alumnos' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Asignar a 0 alumnos' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('2. marcar y desmarcar un alumno actualiza el contador y el botón de asignar', async () => {
    montar();
    await screen.findByText(NOMBRE_1);

    marcarAlumno(NOMBRE_1);
    expect(screen.getByText(/1 de 50 seleccionados/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Asignar a 1 alumno' })).toBeTruthy();

    marcarAlumno(NOMBRE_1);
    expect(screen.getByText(/0 de 50 seleccionados/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Asignar a 0 alumnos' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('3. búsqueda en demo filtra por nombre; sin coincidencias muestra el vacío de búsqueda', async () => {
    montar();
    await screen.findByText(NOMBRE_1);

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre...'), { target: { value: 'mendoza' } });
    // La búsqueda va al servidor (demo local) con debounce de ~300 ms: espera a que filtre.
    await waitFor(() => expect(screen.queryByText(NOMBRE_2)).toBeNull());
    expect(screen.getByText(NOMBRE_1)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre...'), {
      target: { value: 'zzz-sin-coincidencia' },
    });
    expect(await screen.findByText('Ningún alumno coincide con la búsqueda.')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('4. modo añadir asigna directo en demo y muestra el resultado por alumno con "Listo"', async () => {
    const { onCerrar } = montar();
    await screen.findByText(NOMBRE_1);

    marcarAlumno(NOMBRE_1);
    marcarAlumno(NOMBRE_2);
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 alumnos' }));

    expect(await screen.findByText('Plantilla asignada a 2 de 2 alumnos.')).toBeTruthy();
    expect(screen.getAllByText('Rutina asignada: «Tren Superior Hipertrofia A»')).toHaveLength(2);
    expect(screen.queryByPlaceholderText('Buscar por nombre...')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('5. modo reemplazar pide confirmación con el nombre del único alumno; cancelar no asigna', async () => {
    montar();
    await screen.findByText(NOMBRE_1);

    marcarAlumno(NOMBRE_1);
    fireEvent.click(screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    expect(await screen.findByRole('button', { name: 'Sí, reemplazar' })).toBeTruthy();
    expect(
      screen.getByText(`Vas a reemplazar la rutina actual de ${NOMBRE_1}. ¿Continuar?`)
    ).toBeTruthy();

    // El diálogo de confirmación es el último `dialog` (el contenedor es el primero).
    const dialogoConfirmacion = screen.getAllByRole('dialog').at(-1);
    expect(dialogoConfirmacion).toBeTruthy();
    fireEvent.click(
      within(dialogoConfirmacion as HTMLElement).getByRole('button', { name: 'Cancelar' })
    );
    expect(screen.queryByText(/Plantilla asignada a/)).toBeNull();
    expect(screen.getByPlaceholderText('Buscar por nombre...')).toBeTruthy();
  });

  it('6. confirmar el reemplazo en demo asigna y el texto usa el conteo con varios alumnos', async () => {
    montar();
    await screen.findByText(NOMBRE_1);

    marcarAlumno(NOMBRE_1);
    marcarAlumno(NOMBRE_2);
    fireEvent.click(screen.getByRole('radio', { name: /Reemplazar la rutina actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 2 alumnos' }));

    expect(await screen.findByText('Vas a reemplazar la rutina actual de 2 alumnos. ¿Continuar?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar' }));
    expect(await screen.findByText('Plantilla asignada a 2 de 2 alumnos.')).toBeTruthy();
  });

  it('7. cerrar con X y con Cancelar llama a onCerrar', async () => {
    const { onCerrar } = montar();
    await screen.findByText(NOMBRE_1);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar asignación a alumnos' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================== */
/* Modo real (API simulada): carga, error+reintento, paginación, envío. */
/* ================================================================== */

describe('AsignacionMasivaPlantilla caracterización · modo real con API simulada', () => {
  const ALUMNO_A = ROSTER_DEMO_DIRECTORIO[0];
  const ALUMNO_B = ROSTER_DEMO_DIRECTORIO[1];
  const ALUMNO_C = ROSTER_DEMO_DIRECTORIO[2];

  function nombreCompleto(alumno: { nombres: string; apellidos: string }): string {
    return `${alumno.nombres} ${alumno.apellidos}`.trim();
  }

  function responderDirectorio(
    items: Array<(typeof ROSTER_DEMO_DIRECTORIO)[number]>,
    total: number
  ) {
    mockApi.mockImplementation((url: string) => {
      if (url.startsWith('/alumnos?')) return Promise.resolve({ items, total });
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
  }

  beforeEach(() => {
    sesionMock.isDemoMode = false;
  });

  it('8. carga la lista desde GET /alumnos y muestra los nombres', async () => {
    responderDirectorio([ALUMNO_A, ALUMNO_B], 2);
    montar();

    expect(await screen.findByText(nombreCompleto(ALUMNO_A))).toBeTruthy();
    expect(screen.getByText(nombreCompleto(ALUMNO_B))).toBeTruthy();
    expect(mockApi.mock.calls.some(([url]) => (url as string).startsWith('/alumnos?'))).toBe(true);
  });

  it('9. error de carga muestra role="alert" y "Reintentar" recupera la lista', async () => {
    let intentos = 0;
    mockApi.mockImplementation((url: string) => {
      if ((url as string).startsWith('/alumnos?')) {
        intentos += 1;
        if (intentos === 1) return Promise.reject(new Error('Fallo de red simulado'));
        return Promise.resolve({ items: [ALUMNO_A], total: 1 });
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Fallo de red simulado');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(nombreCompleto(ALUMNO_A))).toBeTruthy();
    expect(intentos).toBe(2);
  });

  it('10. con más alumnos muestra "Cargar más alumnos" y agrega la página sin repetir', async () => {
    mockApi.mockImplementation((url: string) => {
      if ((url as string).startsWith('/alumnos?')) {
        const params = new URLSearchParams((url as string).split('?')[1]);
        const offset = Number(params.get('offset') ?? '0');
        if (offset === 0) return Promise.resolve({ items: [ALUMNO_A, ALUMNO_B], total: 3 });
        return Promise.resolve({ items: [ALUMNO_C], total: 3 });
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(nombreCompleto(ALUMNO_A));

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más alumnos' }));
    expect(await screen.findByText(nombreCompleto(ALUMNO_C))).toBeTruthy();
    expect(screen.getByText(nombreCompleto(ALUMNO_A))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cargar más alumnos' })).toBeNull();
  });

  it('11. asignar envía POST con alumnoIds y modo, y muestra el resultado del servidor', async () => {
    mockApi.mockImplementation((url: string, opciones?: { method?: string; body?: string }) => {
      if ((url as string).startsWith('/alumnos?')) {
        return Promise.resolve({ items: [ALUMNO_A, ALUMNO_B], total: 2 });
      }
      if (url === `/plantillas/${PLANTILLA.id}/asignar` && opciones?.method === 'POST') {
        return Promise.resolve({
          plantillaId: PLANTILLA.id,
          modo: ModoAsignacionPlantilla.FUSIONAR,
          totalSolicitados: 1,
          exitosos: 1,
          fallidos: 0,
          resultados: [
            { alumnoId: ALUMNO_A.id, exito: true, rutinaNombre: PLANTILLA.nombre },
          ],
        });
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(nombreCompleto(ALUMNO_A));

    marcarAlumno(nombreCompleto(ALUMNO_A));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();
    const llamada = mockApi.mock.calls.find(
      ([url, opts]) => url === `/plantillas/${PLANTILLA.id}/asignar` && (opts as { method?: string })?.method === 'POST'
    );
    expect(llamada).toBeTruthy();
    const cuerpo = JSON.parse(((llamada as [string, { body?: string }])[1]?.body) ?? '{}');
    expect(cuerpo.alumnoIds).toEqual([ALUMNO_A.id]);
    expect(cuerpo.modo).toBe(ModoAsignacionPlantilla.FUSIONAR);
  });

  it('12. fallo ambiguo muestra el aviso incierto y el reintento en añadir pide confirmación', async () => {
    let intentosPost = 0;
    mockApi.mockImplementation((url: string, opciones?: { method?: string }) => {
      if ((url as string).startsWith('/alumnos?')) {
        return Promise.resolve({ items: [ALUMNO_A], total: 1 });
      }
      if (url === `/plantillas/${PLANTILLA.id}/asignar` && opciones?.method === 'POST') {
        intentosPost += 1;
        if (intentosPost === 1) return Promise.reject(new TypeError('Fallo de red simulado'));
        return Promise.resolve({
          plantillaId: PLANTILLA.id,
          modo: ModoAsignacionPlantilla.FUSIONAR,
          totalSolicitados: 1,
          exitosos: 1,
          fallidos: 0,
          resultados: [{ alumnoId: ALUMNO_A.id, exito: true, rutinaNombre: PLANTILLA.nombre }],
        });
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(nombreCompleto(ALUMNO_A));

    marcarAlumno(nombreCompleto(ALUMNO_A));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos confirmar la asignación.');

    // Segundo intento en modo añadir: pide confirmación explícita antes de reenviar.
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));
    expect(await screen.findByText('¿Volver a intentar la asignación?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, volver a intentar' }));
    expect(await screen.findByText('Plantilla asignada a 1 de 1 alumno.')).toBeTruthy();
    expect(intentosPost).toBe(2);
  });

  it('13. error claro del servidor (4xx) muestra su mensaje sin pedir reintento', async () => {
    const { ApiError } = await import('../../lib/api-client');
    mockApi.mockImplementation((url: string, opciones?: { method?: string }) => {
      if ((url as string).startsWith('/alumnos?')) {
        return Promise.resolve({ items: [ALUMNO_A], total: 1 });
      }
      if (url === `/plantillas/${PLANTILLA.id}/asignar` && opciones?.method === 'POST') {
        return Promise.reject(
          new ApiError(
            400,
            {
              type: 'https://api.guachafit.com/errors/rechazo',
              title: 'Rechazo',
              status: 400,
              detail: 'Rechazo claro simulado',
              timestampUtc: new Date().toISOString(),
            },
            'Rechazo claro simulado'
          )
        );
      }
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    montar();
    await screen.findByText(nombreCompleto(ALUMNO_A));

    marcarAlumno(nombreCompleto(ALUMNO_A));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar a 1 alumno' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Rechazo claro simulado');
    expect(screen.queryByText('¿Volver a intentar la asignación?')).toBeNull();
    await act(async () => {});
  });
});
