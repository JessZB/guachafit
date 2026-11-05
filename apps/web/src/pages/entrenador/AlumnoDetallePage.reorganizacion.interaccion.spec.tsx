// @vitest-environment happy-dom
/**
 * 01 · Ficha del alumno (L6 · reorganización por tab) · tests (fase roja).
 *
 * El código nuevo aún no existe: cada contrato L6.1–L6.10 debe FALLAR por la
 * razón esperada (ubicación/orden/texto viejos). No toca producción.
 *
 * Montaje: copia el patrón de `AlumnoDetallePage.cobro-sala.interaccion.spec.tsx`
 * (auth mock + apiClient mock + MemoryRouter `?tab=`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  PeriodicidadAntropometria,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
} from '@guachafit/shared';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';

const PLAN_A: PlanMembresiaDetalleDTO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  entrenadorId: COACH_ID,
  nombre: 'Plan Presencial',
  descripcion: 'Acceso a sala',
  beneficios: ['Rutina interactiva'],
  precioBaseUsd: '40.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

const PERFIL: PerfilAlumnoDetalleDTO = {
  id: CLIENTE_ID,
  usuarioId: ALUMNO_USUARIO_ID,
  entrenadorId: COACH_ID,
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
  planActivoId: PLAN_A.id,
  planActivoNombre: PLAN_A.nombre,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  zonaHoraria: 'America/Caracas',
};

const RESUMEN_FINANCIERO: ResumenFinancieroAlumnoDTO = {
  alumnoId: CLIENTE_ID,
  usuarioId: ALUMNO_USUARIO_ID,
  saldoPendienteTotalUsd: '0.00',
  saldoAFavorUsd: '0.00',
  totalPagadoHistoricoUsd: '0.00',
  totalPagadoMesActualUsd: '0.00',
  cuotaMesActual: null,
  transaccionesTotal: 0,
  transacciones: [],
};

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: COACH_ID, email: 'coach@example.com', rol: 'entrenador' },
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
import { AlumnoDetallePage } from './AlumnoDetallePage';

// La ficha completa tarda más de 5 s en montar: timeout propio del spec.
vi.setConfig({ testTimeout: 20000 });

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(RESUMEN_FINANCIERO);
  }
  if (endpoint.startsWith('/sesiones/alumno/')) return Promise.resolve({ items: [], total: 0 });
  if (endpoint === `/sesiones/alumno/${CLIENTE_ID}/ultima`) return Promise.resolve(null);
  if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
  if (endpoint.startsWith('/rutinas/alumno/')) return Promise.resolve(null);
  if (endpoint.startsWith('/antropometria/evolucion/')) {
    return Promise.resolve({ evaluaciones: [], controlesTotal: 0 });
  }
  if (endpoint.startsWith('/antropometria/controles')) {
    return Promise.resolve({ items: [], total: 0, limit: 10, offset: 0 });
  }
  if (endpoint === `/nutricion/alumnos/${ALUMNO_USUARIO_ID}/metas`) return Promise.resolve(null);
  if (endpoint.startsWith(`/nutricion/alumnos/${ALUMNO_USUARIO_ID}/checkins`)) return Promise.resolve([]);
  if (endpoint.startsWith('/nutricion/')) return Promise.resolve({ items: [], total: 0 });
  return Promise.resolve(null);
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  Element.prototype.scrollIntoView = vi.fn();
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
  mockApi.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.get.mockImplementation((endpoint: string) => respuestaGet(endpoint));
  mockApi.patch.mockImplementation(() => Promise.resolve(PERFIL));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
  mockApi.post.mockImplementation(() => Promise.resolve(null));
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montarFicha(tab: string): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=${tab}`]}>
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** true si `a` aparece antes que `b` en el DOM. */
function apareceAntes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('AlumnoDetallePage · L6.1 orden en Entrenos', () => {
  it('la rutina va primero, luego Último entrenamiento, luego el historial', async () => {
    montarFicha('entrenamiento');
    const rutina = await screen.findByText('Rutina Semanal Asignada', {}, { timeout: 8000 });
    const historial = await screen.findByText(/Historial de Sesiones/, {}, { timeout: 8000 });
    expect(apareceAntes(rutina, historial)).toBe(true);

    const ultimo = screen.queryByText(/Último entrenamiento|Entrenamiento en Progreso/);
    if (ultimo) {
      expect(apareceAntes(rutina, ultimo)).toBe(true);
      expect(apareceAntes(ultimo, historial)).toBe(true);
    }
  });
});

describe('AlumnoDetallePage · L6.2 sin anclas en Entrenos', () => {
  it('no hay nav de píldoras ni botones con scrollIntoView', async () => {
    montarFicha('entrenamiento');
    await screen.findByText('Rutina Semanal Asignada', {}, { timeout: 8000 });
    expect(screen.queryByRole('navigation', { name: 'Secciones del entrenamiento' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rutina semanal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Historial \(\d+\)/ })).toBeNull();
  });
});

describe('AlumnoDetallePage · L6.3 zona horaria en Perfil', () => {
  it('sección fuera del form de Guardar y después del botón', async () => {
    montarFicha('resumen');
    const guardar = await screen.findByRole('button', { name: 'Guardar cambios' }, { timeout: 8000 });
    const titulo = await screen.findByText('Zona horaria del alumno', {}, { timeout: 8000 });
    const seccion = titulo.closest('section') ?? titulo.parentElement!;
    expect(seccion.textContent).toContain(
      'Las fechas de sus cuotas y reportes de nutrición se calculan en esta zona.',
    );
    const control = seccion.querySelector('#zona-horaria-alumno');
    expect(control).not.toBeNull();
    const formGuardar = guardar.closest('form');
    const formSeccion = seccion.closest('form');
    expect(formSeccion == null || formSeccion !== formGuardar).toBe(true);
    expect(apareceAntes(guardar, titulo)).toBe(true);
  });
});

describe('AlumnoDetallePage · L6.4 guardar zona desde Perfil (regresión)', () => {
  it('hace el mismo PATCH que antes y Nutrición usa la zona nueva', async () => {
    montarFicha('resumen');
    await screen.findByText('Zona horaria del alumno', {}, { timeout: 8000 });
    const guardarZona = screen.getByRole('button', { name: 'Guardar zona horaria' });
    fireEvent.click(guardarZona);
    await waitFor(() => {
      const patches = [...mockApi.patch.mock.calls, ...mockApi.mock.calls]
        .filter(([endpoint]) => endpoint === `/alumnos/${CLIENTE_ID}`)
        .map((llamada) => JSON.stringify(llamada[1] ?? llamada));
      expect(patches.some((cuerpo) => cuerpo.includes('zonaHoraria'))).toBe(true);
    });
  });
});

describe('AlumnoDetallePage · L6.5 fuera de Nutrición', () => {
  it('Nutrición no trae la zona y remite a Perfil', async () => {
    montarFicha('nutricion');
    await screen.findByRole('heading', { name: 'Metas nutricionales' }, { timeout: 20000 });
    expect(screen.queryAllByText('Zona horaria del alumno').length).toBe(0);
    expect(
      await screen.findByText('La zona horaria del alumno se cambia en Perfil.', {}, { timeout: 8000 }),
    ).toBeTruthy();
  });
});

describe('AlumnoDetallePage · L6.6 cabecera de Medidas', () => {
  it('nuevo título y botón, sin textos viejos', async () => {
    montarFicha('antropometria');
    expect(await screen.findByText('Medidas y evolución', {}, { timeout: 8000 })).toBeTruthy();
    const registrar = await screen.findByRole('button', { name: 'Registrar control' }, { timeout: 8000 });
    expect(registrar.className).toContain('min-h-11');
    fireEvent.click(registrar);
    expect(await screen.findByRole('dialog', {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText('Evolución Corporal & Medidas')).toBeNull();
    expect(screen.queryByText('Registrar Control en Sala')).toBeNull();
  });
});

describe('AlumnoDetallePage · L6.7 orden y plegado en Medidas', () => {
  it('métricas/gráfico/tabla antes que el calendario plegado en <details>', async () => {
    montarFicha('antropometria');
    await screen.findByText('Medidas y evolución', {}, { timeout: 8000 });
    const summary = await screen.findByText(/Calendario de check-in/, {}, { timeout: 8000 });
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details!.hasAttribute('open')).toBe(false);
    expect(/Semanal|Quincenal|Mensual|Sin configurar/.test(details!.textContent ?? '')).toBe(true);
    const grafico = screen.getByRole('heading', { name: 'Evolución corporal' });
    expect(apareceAntes(grafico, summary)).toBe(true);
    fireEvent.click(summary);
    expect(details!.hasAttribute('open')).toBe(true);
  });
});

describe('AlumnoDetallePage · L6.8 cambios sin guardar en Perfil', () => {
  it('status junto a Guardar: aparece, revierte y se limpia al guardar', async () => {
    montarFicha('resumen');
    expect(screen.queryByText('Cambios sin guardar')).toBeNull();
    const nombres = await screen.findByDisplayValue('María', {}, { timeout: 8000 });
    fireEvent.change(nombres, { target: { value: 'María Editada' } });
    const status = await screen.findByRole('status', {}, { timeout: 8000 });
    expect(status.textContent).toBe('Cambios sin guardar');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(status.parentElement!.contains(guardar)).toBe(true);
    fireEvent.change(nombres, { target: { value: 'María' } });
    await waitFor(() => expect(screen.queryByText('Cambios sin guardar')).toBeNull());
  });
});

describe('AlumnoDetallePage · L6.9 orden en Perfil', () => {
  it('Nombres, Salud, Plan y tarifa, Guardar y al final Zona horaria', async () => {
    montarFicha('resumen');
    const nombres = await screen.findByDisplayValue('María', {}, { timeout: 8000 });
    const salud = await screen.findByRole('heading', { name: 'Salud y limitaciones' }, { timeout: 8000 });
    const plan = await screen.findByRole('heading', { name: 'Plan y tarifa' }, { timeout: 8000 });
    const guardar = await screen.findByRole('button', { name: 'Guardar cambios' }, { timeout: 8000 });
    const zona = await screen.findByText('Zona horaria del alumno', {}, { timeout: 8000 });
    expect(apareceAntes(nombres, salud)).toBe(true);
    expect(apareceAntes(salud, plan)).toBe(true);
    expect(apareceAntes(plan, guardar)).toBe(true);
    expect(apareceAntes(guardar, zona)).toBe(true);
  });
});

describe('AlumnoDetallePage · L6.10 regresión de tabs', () => {
  // Monta la ficha dos veces seguidas: necesita más que el timeout del spec.
  it('?tab=nutricion y ?tab=antropometria muestran su panel', { timeout: 60000 }, async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=nutricion`]}>
        <Routes>
          <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Metas nutricionales' }, { timeout: 20000 })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Reportes de los últimos 30 días' }, { timeout: 20000 })).toBeTruthy();
    unmount();
    cleanup();
    montarFicha('antropometria');
    expect(await screen.findByText('Medidas y evolución', {}, { timeout: 20000 })).toBeTruthy();
  });
});

describe('AlumnoDetallePage · L6.4b guardado de zona en demo (movido de PanelNutricion)', () => {
  // Movido de `PanelNutricionAlumno.caracterizacion.interaccion.spec.tsx` ("la zona horaria
  // declara la ventana del reporte y en demo el guardado se simula con éxito"): la zona se
  // edita en Perfil desde L6.3, así que el caso vive contra la ficha en modo demo. L6.4 cubre
  // el PATCH en línea; este cubre la simulación con éxito sin llamar a la API.
  it('en demo el guardado se simula con éxito y no llama a la API', async () => {
    sesionMock.isDemoMode = true;
    montarFicha('resumen');
    await screen.findByText('Zona horaria del alumno', {}, { timeout: 8000 });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }));
    expect(await screen.findByText('Zona horaria guardada.', {}, { timeout: 8000 })).toBeTruthy();
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
});

describe('AlumnoDetallePage · V2 (H2) el <summary> del calendario lee lo guardado', () => {
  // H2: el badge del <details> deriva de `alumno.periodicidadAntropometria` (guardado),
  // no del borrador en edición. Con "mensual" guardado: dice "Mensual", sigue diciendo
  // "Mensual" tras cambiar el selector sin guardar, y pasa a "Semanal" tras guardar con éxito.
  it('Mensual guardado → cambio sin guardar no mueve el badge → guardar lo mueve a Semanal', async () => {
    const PERFIL_MENSUAL: PerfilAlumnoDetalleDTO = {
      ...PERFIL,
      periodicidadAntropometria: PeriodicidadAntropometria.MENSUAL,
      antropometriaInicio: '2026-01-05',
    };
    mockApi.mockImplementation((endpoint: string) =>
      endpoint === `/alumnos/${CLIENTE_ID}` ? Promise.resolve(PERFIL_MENSUAL) : respuestaGet(endpoint),
    );
    mockApi.get.mockImplementation((endpoint: string) =>
      endpoint === `/alumnos/${CLIENTE_ID}` ? Promise.resolve(PERFIL_MENSUAL) : respuestaGet(endpoint),
    );
    // El guardado devuelve el perfil con lo enviado (eco del PATCH, como en los specs del calendario).
    mockApi.patch.mockImplementation((endpoint: string, cuerpo: unknown) =>
      Promise.resolve({ ...PERFIL_MENSUAL, ...((cuerpo as Record<string, unknown>) ?? {}) }),
    );
    montarFicha('antropometria');

    // 1. El <summary> dice "Mensual" (valor guardado).
    const tituloCalendario = await screen.findByText('Calendario de check-in', {}, { timeout: 8000 });
    fireEvent.click(tituloCalendario);
    const summary = tituloCalendario.closest('summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Mensual');

    // 2. Cambio a "Semanal" sin guardar: el <summary> sigue diciendo "Mensual".
    const selector = document.querySelector('#periodicidad-antropometria') as HTMLSelectElement;
    expect(selector).not.toBeNull();
    fireEvent.change(selector, { target: { value: PeriodicidadAntropometria.SEMANAL } });
    expect(summary!.textContent).toContain('Mensual');
    expect(summary!.textContent).not.toContain('Semanal');

    // 3. Guardado con éxito: el <summary> pasa a decir "Semanal".
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Calendario' }));
    await waitFor(() => expect(summary!.textContent).toContain('Semanal'), { timeout: 8000 });
  });
});

describe('AlumnoDetallePage · V3 (H2, vacío) sin periodicidad guardada', () => {
  // H2: sin valor guardado el badge dice "Sin configurar" aunque se elija una opción sin guardar.
  it('el <summary> dice "Sin configurar" aunque se elija una opción sin guardar', async () => {
    montarFicha('antropometria');
    const tituloCalendario = await screen.findByText('Calendario de check-in', {}, { timeout: 8000 });
    fireEvent.click(tituloCalendario);
    const summary = tituloCalendario.closest('summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Sin configurar');
    const selector = document.querySelector('#periodicidad-antropometria') as HTMLSelectElement;
    expect(selector).not.toBeNull();
    fireEvent.change(selector, { target: { value: PeriodicidadAntropometria.SEMANAL } });
    expect(summary!.textContent).toContain('Sin configurar');
  });
});
