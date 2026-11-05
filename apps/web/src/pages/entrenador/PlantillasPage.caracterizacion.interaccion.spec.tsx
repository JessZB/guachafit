// @vitest-environment happy-dom
/**
 * Prompt 50 (fase B0) · tests de caracterización del banco de plantillas (M8).
 *
 * Fijan el comportamiento ACTUAL de `PlantillasPage` en verde sobre el código vigente
 * (ODD `modularizacion-vistas-web.md`, R5): describen lo que hay, no lo que debería haber.
 * La extracción de fase B deberá mantenerlos en verde con el mismo número de tests.
 *
 * Patrón de montaje copiado de `AjustesPage.interaccion.spec.tsx`: providers (`MemoryRouter`),
 * `useAuth` mockeado con bandera conmutable y `apiClient` mockeado preservando
 * `resolverUrlApi` vía `importOriginal`.
 *
 * Alcance honesto de los dobles (no son producción):
 * - `BloquesRutinaEditor` se sustituye por un marcador funcional que expone los bloques
 *   recibidos y un botón accesible para añadir un ejercicio válido. El editor real es un
 *   componente de 830 líneas (ola 2 del ODD, fuera de la superficie de M8) con specs propios;
 *   lo que aquí se caracteriza es la página contenedora (filtros, modal, payload, cierres).
 * - `AsignacionMasivaPlantilla` se sustituye por un diálogo marcador con su nombre y cierre,
 *   para caracterizar solo el cableado abrir/cerrar de la tarjeta.
 * - `useFrescuraOffline` se mockea con bandera `isOnline` conmutable (D7,.guardado offline).
 * - `DialogoConfirmacion` y `AvisoDatosOffline` se usan REALES.
 *
 * Consultas solo por rol, label o texto accesible. Nunca por clases ni estructura interna.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  NivelObjetivoPlantilla,
  type PlantillaRutinaDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({ isDemoMode: true, isOnline: true }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: sesionMock.isDemoMode }),
}));

vi.mock('../../lib/use-frescura-offline', () => ({
  useFrescuraOffline: () => ({ isOnline: sesionMock.isOnline, frescura: null }),
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

/** Marcador funcional del editor (ver cabecera): expone conteo y añade un ejercicio válido. */
vi.mock('../../components/entrenador/BloquesRutinaEditor', () => ({
  BloquesRutinaEditor: ({
    bloques,
    onCambiar,
  }: {
    bloques: Array<{
      diaId: string;
      diaNumero: number;
      anotacion: string;
      titulo: string;
      ejercicios: Array<{ nombre: string }>;
    }>;
    onCambiar: (bloques: unknown) => void;
  }) => {
    const totalEjercicios = bloques.reduce((total, b) => total + b.ejercicios.length, 0);
    return (
      <div>
        <p>
          Editor de bloques (marcador): {totalEjercicios} ejercicios
        </p>
        <button
          type="button"
          onClick={() =>
            onCambiar([
              {
                diaId: 'd-marcador-1',
                diaNumero: 1,
                anotacion: '',
                titulo: 'Día 1',
                enfoque: 'General',
                ejercicios: [
                  {
                    id: 'e-marcador-1',
                    nombre: 'Press Banca Marcador',
                    series: 3,
                    reps: '10-12',
                    peso: '',
                    rpe: '8.0',
                    descansoSegundos: 90,
                  },
                ],
              },
            ])
          }
        >
          Añadir ejercicio válido
        </button>
      </div>
    );
  },
}));

/** Marcador de la asignación masiva (ver cabecera): solo cableado abrir/cerrar. */
vi.mock('../../components/entrenador/AsignacionMasivaPlantilla', () => ({
  AsignacionMasivaPlantilla: ({
    plantilla,
    onCerrar,
  }: {
    plantilla: { nombre: string };
    onCerrar: () => void;
  }) => (
    <div role="dialog" aria-label={`Asignar ${plantilla.nombre}`}>
      <p>Asignación masiva (marcador): {plantilla.nombre}</p>
      <button type="button" onClick={onCerrar}>
        Cerrar asignación
      </button>
    </div>
  ),
}));

import { apiClient } from '../../lib/api-client';
import { PlantillasPage } from './PlantillasPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

/* ------------------------------------------------------------------ */
/* Fixtures del modo real (contrato PlantillaRutinaResumenDTO / DTO).  */
/* ------------------------------------------------------------------ */

const RESUMEN_REAL: PlantillaRutinaResumenDTO = {
  id: 'p-real-1',
  entrenadorId: 'e1',
  nombre: 'Rutina Real Fuerza',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  totalDias: 1,
  totalEjercicios: 1,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
};

const DETALLE_REAL: PlantillaRutinaDTO = {
  id: 'p-real-1',
  entrenadorId: 'e1',
  nombre: 'Rutina Real Fuerza',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  activa: true,
  createdAtUtc: '2026-09-01T10:00:00.000Z',
  updatedAtUtc: '2026-09-20T10:00:00.000Z',
  bloques: [
    {
      diaId: 'd1',
      diaSugerido: 1,
      titulo: 'Día 1 (Lunes)',
      enfoque: 'Fuerza',
      ejercicios: [
        {
          id: 'e-real-1',
          ejercicioId: '11111111-1111-4111-8111-111111111c01',
          nombre: 'Press Plano con Mancuernas',
          series: 4,
          reps: '8-10',
          peso: '28.00',
          rpe: '8.0',
          descansoSegundos: 90,
        },
      ],
    },
  ],
};

type OpcionesLlamada = { method?: string; body?: string };

function montar() {
  render(
    <MemoryRouter initialEntries={['/coach/plantillas']}>
      <PlantillasPage />
    </MemoryRouter>
  );
}

/** Responde el listado y el catálogo en modo real; resto de endpoints, `null`. */
function responderModoReal(
  resumen: PlantillaRutinaResumenDTO[] = [RESUMEN_REAL],
  detalle: PlantillaRutinaDTO = DETALLE_REAL
) {
  mockApi.mockImplementation((endpoint: string, opciones?: OpcionesLlamada) => {
    if (endpoint === '/plantillas' && !opciones?.method) return Promise.resolve(resumen);
    if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
    if (endpoint === `/plantillas/${RESUMEN_REAL.id}` && !opciones?.method) {
      return Promise.resolve(detalle);
    }
    if (endpoint === `/plantillas/${RESUMEN_REAL.id}` && opciones?.method === 'PATCH') {
      const payload = JSON.parse(opciones.body ?? '{}');
      return Promise.resolve({
        ...detalle,
        nombre: payload.nombre ?? detalle.nombre,
        nivelObjetivo: payload.nivelObjetivo ?? detalle.nivelObjetivo,
        bloques: payload.bloques ?? detalle.bloques,
      });
    }
    return Promise.resolve(null);
  });
}

function llamadasApi(): Array<[string, OpcionesLlamada?]> {
  return mockApi.mock.calls as Array<[string, OpcionesLlamada?]>;
}

beforeEach(() => {
  sesionMock.isDemoMode = true;
  sesionMock.isOnline = true;
  mockApi.mockReset();
});

afterEach(() => {
  cleanup();
});

/* ================================================================== */
/* Modo demo (isDemoMode): banco local sin llamadas al API.            */
/* ================================================================== */

describe('PlantillasPage caracterización · modo demo (§6.2 puntos 1–9, 11)', () => {
  it('1. render inicial: título, "Nueva plantilla", chips con conteos y tarjetas demo', async () => {
    montar();

    expect(screen.getByRole('heading', { name: 'Plantillas de ejercicios' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nueva plantilla' })).toBeTruthy();

    // Banco demo: 3 plantillas, todas activas.
    await screen.findByText('Tren Superior Hipertrofia A');
    expect(screen.getByText('Fullbody 3 Días Principiante')).toBeTruthy();
    expect(screen.getByText('Pierna Énfasis Isquios')).toBeTruthy();

    const chipActivas = screen.getByRole('button', { name: /Activas/ });
    expect(chipActivas.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Desactivadas/ }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      '3 plantillas'
    );
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('2. chips Activas/Desactivadas/Todas cambian tarjetas, contador y aria-pressed', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: /Desactivadas/ }));
    expect(
      screen.getByRole('button', { name: /Desactivadas/ }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByText('No tienes plantillas desactivadas')).toBeTruthy();
    expect(screen.queryByText('Tren Superior Hipertrofia A')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Todas/ }));
    expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      '3 plantillas'
    );
    expect(screen.getByText('Tren Superior Hipertrofia A')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Activas/ }));
    expect(screen.getByRole('button', { name: /Activas/ }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByText('Pierna Énfasis Isquios')).toBeTruthy();
  });

  it('3. búsqueda por nombre filtra; sin coincidencias muestra "Sin resultados" y "Limpiar filtros" restaura', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.change(screen.getByLabelText('Buscar plantilla por nombre'), {
      target: { value: 'fullbody' },
    });
    expect(screen.getByText('Fullbody 3 Días Principiante')).toBeTruthy();
    expect(screen.queryByText('Tren Superior Hipertrofia A')).toBeNull();

    fireEvent.change(screen.getByLabelText('Buscar plantilla por nombre'), {
      target: { value: 'zzz-sin-coincidencia' },
    });
    expect(screen.getByText('Sin resultados')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Tren Superior Hipertrofia A')).toBeTruthy();
    expect(screen.getByText('Pierna Énfasis Isquios')).toBeTruthy();
  });

  it('4. filtro por nivel objetivo (select) deja solo las del nivel elegido', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.change(screen.getByLabelText('Filtrar plantillas por nivel objetivo'), {
      target: { value: NivelObjetivoPlantilla.PRINCIPIANTE },
    });
    expect(screen.getByText('Fullbody 3 Días Principiante')).toBeTruthy();
    expect(screen.queryByText('Tren Superior Hipertrofia A')).toBeNull();
    expect(screen.queryByText('Pierna Énfasis Isquios')).toBeNull();
    expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      '1 plantilla'
    );

    fireEvent.change(screen.getByLabelText('Filtrar plantillas por nivel objetivo'), {
      target: { value: 'todos' },
    });
    expect(screen.getByText('Tren Superior Hipertrofia A')).toBeTruthy();
  });

  it('5. vacío por estado: sin desactivadas el copy es propio y "Crear plantilla" abre el modal', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: /Desactivadas/ }));
    expect(screen.getByText('No tienes plantillas desactivadas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Crear plantilla' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Nueva plantilla de rutina')).toBeTruthy();
  });

  it('6. modal crear: campos Nombre/Nivel, editor y pie con resumen; cerrar sin cambios no pregunta', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    expect(screen.getByText('Nueva plantilla de rutina')).toBeTruthy();
    expect(screen.getByLabelText('Nombre de la plantilla')).toBeTruthy();
    expect(screen.getByLabelText('Nivel objetivo')).toBeTruthy();
    expect(screen.getByText(/Editor de bloques \(marcador\)/)).toBeTruthy();
    // Pie con resumen del editor: 1 día recién creado, 0 ejercicios, 0 series.
    // (el "0 series" es del pie: el marcador del editor no menciona series).
    expect(screen.getByText(/1 día/)).toBeTruthy();
    expect(screen.getByText(/0 series/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(screen.queryByText('¿Salir sin guardar?')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('7. validación: nombre corto muestra role="alert" y no hay éxito ni llamada al API', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla'), { target: { value: 'AB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear plantilla' }));

    const alertas = screen.getAllByRole('alert');
    expect(alertas.some((a) => a.textContent?.includes('al menos 3 caracteres'))).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('8. crear válido en demo: role="status" de éxito y lista actualizada, sin llamada al API', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla'), {
      target: { value: 'Plantilla E2E Demo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir ejercicio válido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear plantilla' }));

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain('Plantilla creada y activa');
    expect(screen.getByText('Plantilla E2E Demo')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('9. cierre con cambios: X y fondo piden "¿Salir sin guardar?"; "Seguir editando" conserva; salir cierra', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const nombre = screen.getByLabelText('Nombre de la plantilla') as HTMLInputElement;
    fireEvent.change(nombre, { target: { value: 'Borrador sin guardar' } });

    // X pide confirmación.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(screen.getByText('¿Salir sin guardar?')).toBeTruthy();

    // Seguir editando conserva el diálogo y el texto.
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    await waitFor(() => expect(screen.queryByText('¿Salir sin guardar?')).toBeNull());
    expect((screen.getByLabelText('Nombre de la plantilla') as HTMLInputElement).value).toBe(
      'Borrador sin guardar'
    );

    // Clic en el fondo (overlay) también pide confirmación: mismo cerrarModal.
    const dialogo = screen.getByRole('dialog');
    const overlay = dialogo.parentElement;
    expect(overlay).not.toBeNull();
    if (overlay) fireEvent.click(overlay);
    expect(screen.getByText('¿Salir sin guardar?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('10. desactivar pide confirmación inline (Cancelar la cierra); confirmar marca "Desactivada" y Reactivar revierte, sin API', async () => {
    montar();
    await screen.findByText('Fullbody 3 Días Principiante');

    // Cancelar cierra la confirmación sin cambiar nada.
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    expect(screen.getByText(/¿Desactivar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/¿Desactivar/)).toBeNull();

    // Confirmar desactiva la segunda tarjeta: con el filtro "activas" la tarjeta
    // desaparece de la lista (filtrarPlantillas la excluye) y pasa al chip Desactivadas.
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    expect(screen.queryByText('Fullbody 3 Días Principiante')).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Desactivadas/ }));
    expect(screen.getByText('Fullbody 3 Días Principiante')).toBeTruthy();
    expect(await screen.findByText('Desactivada')).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      '1 plantilla'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));
    fireEvent.click(screen.getByRole('button', { name: /Activas/ }));
    expect(document.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe(
      '3 plantillas'
    );
    expect(screen.getByText('Fullbody 3 Días Principiante')).toBeTruthy();
  });

  it('11. editar en demo: precarga el nombre y guardar muestra éxito de actualización', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(await screen.findByText('Editar plantilla')).toBeTruthy();
    const nombre = screen.getByLabelText('Nombre de la plantilla') as HTMLInputElement;
    expect(nombre.value).toBe('Tren Superior Hipertrofia A');

    fireEvent.change(nombre, { target: { value: 'Tren Superior Hipertrofia A V2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain('Plantilla actualizada');
    expect(screen.getByText('Tren Superior Hipertrofia A V2')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('12. "Asignar a alumnos" abre la asignación masiva y se puede cerrar', async () => {
    montar();
    await screen.findByText('Tren Superior Hipertrofia A');

    fireEvent.click(screen.getAllByRole('button', { name: 'Asignar a alumnos' })[0]);
    expect(
      await screen.findByText('Asignación masiva (marcador): Tren Superior Hipertrofia A')
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar asignación' }));
    expect(
      screen.queryByText('Asignación masiva (marcador): Tren Superior Hipertrofia A')
    ).toBeNull();
  });
});

/* ================================================================== */
/* Modo real (API simulada): carga, error+reintento, payloads, offline.*/
/* ================================================================== */

describe('PlantillasPage caracterización · modo real con API simulada (§6.2 punto 10)', () => {
  beforeEach(() => {
    sesionMock.isDemoMode = false;
  });

  it('13. carga diferida: sin contador ni tarjetas hasta que resuelve GET /plantillas', async () => {
    let resolverLista!: (valor: PlantillaRutinaResumenDTO[]) => void;
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') {
        return new Promise<PlantillaRutinaResumenDTO[]>((resolver) => {
          resolverLista = resolver;
        });
      }
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    montar();

    expect(await screen.findByText('Plantillas de ejercicios')).toBeTruthy();
    expect(document.querySelector('p[aria-live="polite"]')).toBeNull();
    expect(screen.queryByText(/No se pudieron cargar/)).toBeNull();

    await act(async () => {
      resolverLista([RESUMEN_REAL]);
    });
    expect(await screen.findByText('Rutina Real Fuerza')).toBeTruthy();
    expect(llamadasApi().some(([ep]) => ep === '/plantillas')).toBe(true);
  });

  it('14. error de carga muestra "No se pudieron cargar las plantillas" y "Reintentar" recupera la lista', async () => {
    let intentos = 0;
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/plantillas') {
        intentos += 1;
        if (intentos === 1) return Promise.reject(new Error('Fallo de red simulado'));
        return Promise.resolve([RESUMEN_REAL]);
      }
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    montar();

    expect(await screen.findByText('No se pudieron cargar las plantillas')).toBeTruthy();
    expect(screen.getByText('Fallo de red simulado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Rutina Real Fuerza')).toBeTruthy();
    expect(intentos).toBe(2);
  });

  it('15. guardar edición envía PATCH /plantillas/:id con nombre, nivelObjetivo y bloques, y actualiza la lista', async () => {
    responderModoReal();
    montar();
    await screen.findByText('Rutina Real Fuerza');

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(await screen.findByText('Editar plantilla')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla'), {
      target: { value: 'Rutina Real Fuerza V2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain('Plantilla actualizada');

    const patch = llamadasApi().find(
      ([ep, opts]) => ep === '/plantillas/p-real-1' && opts?.method === 'PATCH'
    );
    expect(patch).toBeTruthy();
    const cuerpo = JSON.parse((patch as [string, OpcionesLlamada])[1]?.body ?? '{}');
    expect(cuerpo.nombre).toBe('Rutina Real Fuerza V2');
    expect(cuerpo.nivelObjetivo).toBe(NivelObjetivoPlantilla.INTERMEDIO);
    expect(cuerpo.bloques[0].ejercicios[0].nombre).toBe('Press Plano con Mancuernas');

    expect(screen.getByText('Rutina Real Fuerza V2')).toBeTruthy();
  });

  it('16. desactivar envía DELETE /plantillas/:id y la tarjeta pasa a "Desactivada"', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: OpcionesLlamada) => {
      if (endpoint === '/plantillas' && !opciones?.method) return Promise.resolve([RESUMEN_REAL]);
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      if (endpoint === '/plantillas/p-real-1' && opciones?.method === 'DELETE') {
        return Promise.resolve({});
      }
      return Promise.resolve(null);
    });
    montar();
    await screen.findByText('Rutina Real Fuerza');

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    // Con el filtro "activas" la tarjeta desactivada sale de la lista visible.
    await act(async () => {});
    expect(screen.queryByText('Rutina Real Fuerza')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Desactivadas/ }));
    expect(await screen.findByText('Desactivada')).toBeTruthy();
    expect(screen.getByText('Rutina Real Fuerza')).toBeTruthy();
    expect(
      llamadasApi().some(([ep, opts]) => ep === '/plantillas/p-real-1' && opts?.method === 'DELETE')
    ).toBe(true);
  });

  it('17. error de acción muestra role="alert" con "Descartar aviso" que lo cierra', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: OpcionesLlamada) => {
      if (endpoint === '/plantillas' && !opciones?.method) return Promise.resolve([RESUMEN_REAL]);
      if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
      if (endpoint === '/plantillas/p-real-1' && opciones?.method === 'DELETE') {
        return Promise.reject(new Error('No se pudo desactivar (simulado)'));
      }
      return Promise.resolve(null);
    });
    montar();
    await screen.findByText('Rutina Real Fuerza');

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo desactivar (simulado)');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
    // La tarjeta sigue activa: no se aplicó el cambio.
    expect(screen.getByText('Rutina Real Fuerza')).toBeTruthy();
  });

  it('18. sin conexión el guardado muestra "Necesitas internet para guardar" deshabilitado', async () => {
    sesionMock.isOnline = false;
    responderModoReal();
    montar();
    await screen.findByText('Rutina Real Fuerza');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla'), {
      target: { value: 'Plantilla offline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir ejercicio válido' }));

    const guardar = screen.getByRole('button', { name: 'Necesitas internet para guardar' });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
  });
});
