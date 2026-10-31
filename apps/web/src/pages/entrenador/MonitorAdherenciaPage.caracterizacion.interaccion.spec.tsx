// @vitest-environment jsdom
/**
 * Prompt 72 (Ola 2, módulo `monitor-adherencia`) · tests de caracterización.
 *
 * Fijan el comportamiento ACTUAL de `MonitorAdherenciaPage` sobre el código vigente
 * (base `3341ccc`): describen lo que hay, no lo que debería haber. Si un comportamiento
 * parece un bug, se caracteriza tal cual y se reporta como WARNING en
 * `.opencode-prompts/reportes/monitor-adherencia/72-monitor-adherencia-validacion.reporte.md`
 * (nunca se corrige aquí).
 *
 * Montaje (copiado de `AlumnosPage.caracterizacion.interaccion.spec.tsx`, que también usa
 * `usePaginacionServidor` → TanStack Query y por eso SÍ lleva `QueryClientProvider`, R9):
 * `QueryClientProvider` de test por caso, `MemoryRouter` con marcador de expediente,
 * `api-client` parcialmente mockeado (callable) y `useAuth` mockeado con demo conmutable.
 *
 * Selectores solo por rol/label/texto accesible (R5: deben sobrevivir al refactor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoSesion,
  SemaforoAdherencia,
  type HistorialSesionesAlumnoDTO,
  type MonitorAdherenciaDTO,
  type MonitorAdherenciaSemanalDTO,
  type ResumenMonitorAdherenciaDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: sesionMock.isDemoMode,
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
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { MonitorAdherenciaPage } from './MonitorAdherenciaPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALUMNO_ROJO: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-rojo',
  alumnoPerfilId: 'al-rojo',
  nombreCompleto: 'Rosa Riesgo',
  sesionesPrescritas: 4,
  sesionesCompletadas: 1,
  porcentajeCumplimientoSemanal: '25.00',
  semaforoAdherencia: SemaforoAdherencia.ROJO,
  tienePlanActivo: true,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 1,
  diasInactivo: 6,
  ultimaSesionUtc: '2026-10-05T10:00:00.000Z',
};

const ALUMNO_AMARILLO: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-amarillo',
  alumnoPerfilId: 'al-amarillo',
  nombreCompleto: 'Ana Observación',
  sesionesPrescritas: 5,
  sesionesCompletadas: 3,
  porcentajeCumplimientoSemanal: '60.00',
  semaforoAdherencia: SemaforoAdherencia.AMARILLO,
  tienePlanActivo: true,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 2,
  diasInactivo: 2,
  ultimaSesionUtc: '2026-10-08T10:00:00.000Z',
};

const ALUMNO_VERDE: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-verde',
  alumnoPerfilId: 'al-verde',
  nombreCompleto: 'Vera Aldía',
  sesionesPrescritas: 4,
  sesionesCompletadas: 4,
  porcentajeCumplimientoSemanal: '100.00',
  semaforoAdherencia: SemaforoAdherencia.VERDE,
  tienePlanActivo: true,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 12,
  diasInactivo: 0,
  ultimaSesionUtc: '2026-10-10T10:00:00.000Z',
};

const ALUMNO_SIN_PLAN: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-sin-plan',
  alumnoPerfilId: 'al-sin-plan',
  nombreCompleto: 'Pablo Sinplan',
  sesionesPrescritas: 0,
  sesionesCompletadas: 0,
  porcentajeCumplimientoSemanal: '0.00',
  semaforoAdherencia: SemaforoAdherencia.ROJO,
  tienePlanActivo: false,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 0,
  diasInactivo: 14,
  ultimaSesionUtc: '2026-09-20T10:00:00.000Z',
};

const ALUMNO_SIN_PENDIENTES: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-sin-pendientes',
  alumnoPerfilId: 'al-sin-pendientes',
  nombreCompleto: 'Ema Temprano',
  sesionesPrescritas: 0,
  sesionesCompletadas: 0,
  porcentajeCumplimientoSemanal: '0.00',
  semaforoAdherencia: SemaforoAdherencia.ROJO,
  tienePlanActivo: true,
  sinPendientesSemana: true,
  rachaDiasConsecutivos: 0,
  diasInactivo: 8,
  ultimaSesionUtc: '2026-10-02T10:00:00.000Z',
};

const RESUMEN_BASE: ResumenMonitorAdherenciaDTO = {
  rojo: 1,
  amarillo: 1,
  verde: 1,
  sinPlan: 1,
  sinPendientes: 1,
  total: 5,
};

function respuestaMonitor(
  items: MonitorAdherenciaSemanalDTO[],
  total: number,
  resumen: ResumenMonitorAdherenciaDTO = RESUMEN_BASE,
): MonitorAdherenciaDTO {
  return { items, total, limit: 25, offset: 0, resumen };
}

const RESPUESTA_BASE = respuestaMonitor(
  [ALUMNO_ROJO, ALUMNO_AMARILLO, ALUMNO_VERDE, ALUMNO_SIN_PLAN, ALUMNO_SIN_PENDIENTES],
  5,
);

const RESUMEN_CERO: ResumenMonitorAdherenciaDTO = {
  rojo: 0,
  amarillo: 0,
  verde: 0,
  sinPlan: 0,
  sinPendientes: 0,
  total: 0,
};
const RESPUESTA_VACIA = respuestaMonitor([], 0, RESUMEN_CERO);

function sesionFixture(indice: number): SesionEntrenamientoDetalleDTO {
  const id = `6e6e6e6e-6e6e-46e6-86e6-6e6e6e6e6e${String(indice).padStart(2, '0')}`;
  return {
    id,
    alumnoId: 'u-rojo',
    bloqueId: 'd1',
    fechaProgramada: '2026-10-05',
    fechaInicioUtc: '2026-10-05T10:00:00.000Z',
    fechaFinUtc: '2026-10-05T11:00:00.000Z',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    volumenTotalKg: '1200.00',
    notasAlumno: null,
    ejercicios: [],
    duracionMinutos: 60,
    createdAtUtc: '2026-10-05T11:00:00.000Z',
    updatedAtUtc: '2026-10-05T11:00:00.000Z',
  };
}

function respuestaHistorial(items: SesionEntrenamientoDetalleDTO[], total: number): HistorialSesionesAlumnoDTO {
  return { items, total, limit: 10, offset: 0 };
}

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let monitorActual: MonitorAdherenciaDTO = RESPUESTA_BASE;
let errorMonitor: Error | null = null;
let retenerMonitor = false;
const resolversMonitor: Array<(v: MonitorAdherenciaDTO) => void> = [];
let responderVacioConQuery = false;
let historialTotal = 1;
let errorHistorial: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function llamadasMonitor(): string[] {
  return mockApi.mock.calls
    .map(([endpoint]) => String(endpoint))
    .filter((endpoint) => endpoint.startsWith('/entrenador/monitor-adherencia'));
}

function ultimaLlamadaMonitor(): string {
  const llamadas = llamadasMonitor();
  if (llamadas.length === 0) throw new Error('No se llamó a GET /entrenador/monitor-adherencia?...');
  return llamadas[llamadas.length - 1];
}

function llamadasHistorial(): string[] {
  return mockApi.mock.calls
    .map(([endpoint]) => String(endpoint))
    .filter((endpoint) => String(endpoint).includes('/historial?'));
}

function montar(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/adherencia']}>
        <Routes>
          <Route path="/coach/adherencia" element={<MonitorAdherenciaPage />} />
          <Route path="/coach/alumnos/:id" element={<ExpedienteMarcador />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ExpedienteMarcador() {
  const { id } = useParams();
  return <p>Expediente {id}</p>;
}

/** Espera a que el monitor pinte la tarjeta del alumno en rojo (carga lista). */
async function esperarMonitor(): Promise<void> {
  await screen.findByRole('heading', { name: 'Rosa Riesgo' }, { timeout: 4000 });
}

/** Abre el modal de actividad clicando la tarjeta del alumno en rojo. */
async function abrirModalActividad(): Promise<void> {
  await esperarMonitor();
  fireEvent.click(screen.getByRole('button', { name: 'Rosa Riesgo' }));
  await screen.findByRole('dialog', undefined, { timeout: 4000 });
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  monitorActual = RESPUESTA_BASE;
  errorMonitor = null;
  retenerMonitor = false;
  resolversMonitor.length = 0;
  responderVacioConQuery = false;
  historialTotal = 1;
  errorHistorial = null;

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith('/entrenador/monitor-adherencia')) {
      if (errorMonitor) return Promise.reject(errorMonitor);
      if (retenerMonitor) {
        return new Promise<MonitorAdherenciaDTO>((resolver) => {
          resolversMonitor.push(resolver);
        });
      }
      if (responderVacioConQuery && (endpoint.includes('q=') || endpoint.includes('semaforo='))) {
        return Promise.resolve(respuestaMonitor([], 0, RESUMEN_BASE));
      }
      return Promise.resolve(monitorActual);
    }
    if (typeof endpoint === 'string' && endpoint.includes('/historial?')) {
      if (errorHistorial) return Promise.reject(errorHistorial);
      const url = new URL(endpoint, 'http://localhost');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      // Caracteriza la paginación del modal: el servidor sirve de a 1 por página en
      // este montaje para ejercitar "Ver más" (el tamaño real es 10).
      const todas = [sesionFixture(1), sesionFixture(2)];
      const items = historialTotal === 1 ? [sesionFixture(1)] : todas.slice(offset, offset + 1);
      return Promise.resolve(respuestaHistorial(items, historialTotal));
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

// ---------------------------------------------------------------------------
// 1. Cabecera, chips y búsqueda
// ---------------------------------------------------------------------------

describe('MonitorAdherenciaPage · caracterización: cabecera, chips y búsqueda', () => {
  it('C1 · renderiza el título y los 5 chips con los contadores del resumen del servidor', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Seguimiento de Alumnos' })).toBeTruthy();
    expect(screen.getByText('Cumplimiento semanal')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Todos 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En riesgo 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En observación 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Al día 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sin plan 1' })).toBeTruthy();
  });

  it('C2 · el chip rojo viaja al servidor como semaforo=rojo y el toggle lo limpia', async () => {
    montar();
    await esperarMonitor();
    fireEvent.click(screen.getByRole('button', { name: 'En riesgo 1' }));
    await waitFor(() => expect(ultimaLlamadaMonitor()).toContain('semaforo=rojo'), {
      timeout: 4000,
    });
    expect(
      screen.getByRole('button', { name: 'En riesgo 1' }).getAttribute('aria-pressed'),
    ).toBe('true');

    // Toggle: volver a tocar el chip activo limpia el filtro.
    const antes = llamadasMonitor().length;
    fireEvent.click(screen.getByRole('button', { name: 'En riesgo 1' }));
    await waitFor(
      () => {
        expect(llamadasMonitor().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaMonitor()).not.toContain('semaforo=');
      },
      { timeout: 4000 },
    );
  });

  it('C3 · el chip "Sin plan activo" viaja como semaforo=sinPlan', async () => {
    montar();
    await esperarMonitor();
    fireEvent.click(screen.getByRole('button', { name: 'Sin plan 1' }));
    await waitFor(() => expect(ultimaLlamadaMonitor()).toContain('semaforo=sinPlan'), {
      timeout: 4000,
    });
  });

  it('C4 · la búsqueda viaja con debounce como parámetro q y se puede limpiar', async () => {
    montar();
    await esperarMonitor();
    const antes = llamadasMonitor().length;
    fireEvent.change(screen.getByLabelText('Buscar alumno por nombre'), {
      target: { value: 'rosa' },
    });
    // Antes del debounce (300 ms) no hay petición nueva.
    expect(llamadasMonitor().length).toBe(antes);
    await waitFor(
      () => {
        expect(llamadasMonitor().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaMonitor()).toContain('q=rosa');
      },
      { timeout: 4000 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect((screen.getByLabelText('Buscar alumno por nombre') as HTMLInputElement).value).toBe('');
  });

  it('C5 · con filtro activo muestra el conteo de resultados y "Actualizar" refetchea', async () => {
    montar();
    await esperarMonitor();
    fireEvent.change(screen.getByLabelText('Buscar alumno por nombre'), {
      target: { value: 'rosa' },
    });
    expect(await screen.findByText('5 resultados')).toBeTruthy();

    const antes = llamadasMonitor().length;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(llamadasMonitor().length).toBeGreaterThan(antes), {
      timeout: 4000,
    });
  });

  it('C6 · la carga inicial pide limit/offset/timezone sin q ni semáforo', async () => {
    montar();
    await esperarMonitor();
    expect(llamadasMonitor()[0]).toContain('limit=25');
    expect(llamadasMonitor()[0]).toContain('offset=0');
    expect(llamadasMonitor()[0]).toContain('timezone=');
    expect(llamadasMonitor()[0]).not.toContain('q=');
    expect(llamadasMonitor()[0]).not.toContain('semaforo=');
  });
});

// ---------------------------------------------------------------------------
// 2. Carga, error, vacíos y paginación
// ---------------------------------------------------------------------------

describe('MonitorAdherenciaPage · caracterización: carga, error, vacíos y paginación', () => {
  it('C7 · mientras carga no muestra ni lista ni error ni vacíos', async () => {
    retenerMonitor = true;
    montar();
    expect(await screen.findByRole('heading', { name: 'Seguimiento de Alumnos' })).toBeTruthy();
    expect(await screen.findByText('Cargando monitor de adherencia…')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Rosa Riesgo' })).toBeNull();
    expect(screen.queryByText('No se pudo cargar el monitor')).toBeNull();
    expect(screen.queryByText('Todavía no tienes alumnos activos')).toBeNull();
    await act(async () => {
      resolversMonitor.forEach((resolver) => resolver(RESPUESTA_BASE));
    });
    await esperarMonitor();
  });

  it('C8 · error de carga con reintento que recupera la lista', async () => {
    errorMonitor = new Error('Fallo de red simulado');
    montar();
    expect(await screen.findByText('No se pudo cargar el monitor')).toBeTruthy();
    expect(screen.getByText('Fallo de red simulado')).toBeTruthy();

    errorMonitor = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await esperarMonitor();
  });

  it('C9 · cartera vacía sin alumnos: mensaje honesto, enlace al directorio y sin paginación', async () => {
    monitorActual = RESPUESTA_VACIA;
    montar();
    expect(await screen.findByText('Todavía no tienes alumnos activos')).toBeTruthy();
    const enlace = screen.getByRole('link', { name: 'Ir al directorio de alumnos' });
    expect(enlace.getAttribute('href')).toBe('/coach/alumnos');
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  it('C10 · filtro sin coincidencias: "Sin resultados" y "Limpiar filtros" restaura', async () => {
    responderVacioConQuery = true;
    montar();
    await esperarMonitor();
    fireEvent.change(screen.getByLabelText('Buscar alumno por nombre'), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
    expect(
      screen.getByText('Ningún alumno coincide con la búsqueda o el filtro seleccionado.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await esperarMonitor();
    expect((screen.getByLabelText('Buscar alumno por nombre') as HTMLInputElement).value).toBe('');
  });

  it('C11 · con total > 0 muestra la paginación y avanzar pide el siguiente offset', async () => {
    monitorActual = respuestaMonitor([ALUMNO_ROJO, ALUMNO_AMARILLO], 30, {
      ...RESUMEN_BASE,
      total: 30,
    });
    montar();
    await esperarMonitor();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
    const antes = llamadasMonitor().length;
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Paginación' })).getByRole('button', {
        name: 'Página siguiente',
      }),
    );
    await waitFor(
      () => {
        expect(llamadasMonitor().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaMonitor()).toContain('offset=25');
      },
      { timeout: 4000 },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Tarjetas del listado
// ---------------------------------------------------------------------------

describe('MonitorAdherenciaPage · caracterización: tarjetas del listado', () => {
  it('C12 · la tarjeta muestra badge, racha, barra de adherencia y última sesión', async () => {
    montar();
    await esperarMonitor();
    expect(screen.getByText('Racha: 1 día')).toBeTruthy();
    expect(screen.getByText('Racha: 12 días')).toBeTruthy();
    expect(screen.getByText('1/4 sesiones completadas')).toBeTruthy();
    expect(screen.getByText('25.00%')).toBeTruthy();
    const barra = screen.getByRole('progressbar', { name: 'Adherencia semanal de Rosa Riesgo' });
    expect(barra.getAttribute('aria-valuenow')).toBe('25');
    const tarjeta = screen.getByRole('heading', { name: 'Rosa Riesgo' }).closest('article');
    expect(tarjeta?.textContent).toMatch(/Última sesión:/);
  });

  it('C13 · el alumno con más de 4 días inactivo muestra el aviso de inactividad', async () => {
    montar();
    await esperarMonitor();
    expect(screen.getByText('6 días sin entrenar')).toBeTruthy();
  });

  it('C14 · sin plan muestra el aviso honesto y sin pendientes el estado neutral', async () => {
    montar();
    await esperarMonitor();
    expect(
      screen.getByText(
        'Sin rutina activa: asígnale una planificación para calcular su adherencia semanal.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Al día — sin pendientes esta semana: aún no vence ningún bloque de su plan.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Sin plan')).toBeTruthy();
  });

  it('C15 · el chevrón enlaza al expediente sin abrir el modal', async () => {
    montar();
    await esperarMonitor();
    const chevron = screen.getByRole('link', { name: 'Abrir el expediente de Rosa Riesgo' });
    expect(chevron.getAttribute('href')).toBe('/coach/alumnos/al-rojo');
    fireEvent.click(chevron);
    expect(await screen.findByText('Expediente al-rojo')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('C16 · clicar la tarjeta abre el modal de actividad', async () => {
    montar();
    await abrirModalActividad();
    expect(screen.getByRole('heading', { name: 'Actividad de Rosa Riesgo' })).toBeTruthy();
  });

  it('C17 · el botón "Ver últimas sesiones en detalle" también abre el modal', async () => {
    montar();
    await esperarMonitor();
    const botones = screen.getAllByRole('button', { name: 'Ver últimas sesiones en detalle' });
    fireEvent.click(botones[0]);
    expect(await screen.findByRole('dialog', undefined, { timeout: 4000 })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. Modal de actividad
// ---------------------------------------------------------------------------

describe('MonitorAdherenciaPage · caracterización: modal de actividad', () => {
  it('C18 · el modal muestra el resumen del alumno y el enlace a la ficha completa', async () => {
    montar();
    await abrirModalActividad();
    expect(
      screen.getByText('Últimas sesiones con series, cargas y tiempos reales.'),
    ).toBeTruthy();
    expect(screen.getByText('Mostrando 1 de 1 sesión')).toBeTruthy();
    const ficha = screen.getByRole('link', { name: 'Abrir ficha completa' });
    expect(ficha.getAttribute('href')).toBe('/coach/alumnos/al-rojo?tab=entrenamiento');
  });

  it('C19 · la sesión más reciente arranca expandida con su detalle', async () => {
    montar();
    await abrirModalActividad();
    const region = await screen.findByRole('region', undefined, { timeout: 4000 });
    expect(region.getAttribute('aria-label')).toMatch(/Detalle de la sesión del /);
  });

  it('C20 · "Ver más" acumula el historial hasta el total real', async () => {
    historialTotal = 2;
    montar();
    await abrirModalActividad();
    expect(await screen.findByText('Mostrando 1 de 2 sesiones')).toBeTruthy();
    const verMas = screen.getByRole('button', { name: 'Ver más sesiones (1 de 2)' });
    fireEvent.click(verMas);
    expect(await screen.findByText('Mostrando 2 de 2 sesiones')).toBeTruthy();
    expect(llamadasHistorial()[llamadasHistorial().length - 1]).toContain('offset=1');
    expect(screen.queryByRole('button', { name: 'Ver más sesiones (2 de 2)' })).toBeNull();
  });

  it('C21 · si el historial falla, el error queda en el modal y "Reintentar" recupera', async () => {
    // Un rechazo que NO es `ApiError` se traduce al mensaje genérico honesto (línea 171-176).
    errorHistorial = new Error('Historial caído');
    montar();
    await abrirModalActividad();
    expect(await screen.findByText('No se pudo cargar la actividad')).toBeTruthy();
    expect(screen.getByText('No pudimos cargar la actividad del alumno.')).toBeTruthy();

    errorHistorial = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Mostrando 1 de 1 sesión')).toBeTruthy();
  });

  it('C22 · cierre limpio: botón Cerrar, Escape y backdrop cierran el modal', async () => {
    montar();
    await abrirModalActividad();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la actividad del alumno' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await abrirModalActividad();
    const dialogo = screen.getByRole('dialog');
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await abrirModalActividad();
    const dialogo2 = screen.getByRole('dialog');
    // El overlay es el padre directo del diálogo: clicar ahí (target === currentTarget) cierra.
    const fondo = dialogo2.parentElement;
    if (!fondo) throw new Error('El diálogo no tiene contenedor de fondo.');
    fireEvent.click(fondo);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// 5. Modo demo
// ---------------------------------------------------------------------------

describe('MonitorAdherenciaPage · caracterización: modo demo', () => {
  it('C23 · en demo no consulta la API y usa el roster local con su resumen', async () => {
    sesionMock.isDemoMode = true;
    montar();
    expect(await screen.findByRole('heading', { name: 'Seguimiento de Alumnos' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Daniela Ríos Peña' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todos 15' })).toBeTruthy();
    expect(
      mockApi.mock.calls.some(([endpoint]) =>
        String(endpoint).startsWith('/entrenador/monitor-adherencia'),
      ),
    ).toBe(false);

    // Misma semántica de filtros sobre el roster local: el rojo oculta a los al día.
    fireEvent.click(screen.getByRole('button', { name: 'En riesgo 4' }));
    await waitFor(
      () =>
        expect(
          screen.queryByRole('heading', { name: 'Carlos Alberto Mendoza Silva' }),
        ).toBeNull(),
      { timeout: 4000 },
    );
    expect(screen.getByRole('heading', { name: 'Daniela Ríos Peña' })).toBeTruthy();
  });

  it('C24 · en demo el modal usa el fixture local sin llamadas al historial', async () => {
    sesionMock.isDemoMode = true;
    montar();
    expect(await screen.findByRole('heading', { name: 'Daniela Ríos Peña' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Daniela Ríos Peña' }));
    expect(
      await screen.findByRole('heading', { name: 'Actividad de Daniela Ríos Peña' }),
    ).toBeTruthy();
    expect(
      mockApi.mock.calls.some(([endpoint]) => String(endpoint).includes('/historial?')),
    ).toBe(false);
  });
});
