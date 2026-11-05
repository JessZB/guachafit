// @vitest-environment happy-dom
/**
 * 01 · Ficha del alumno (L5 · carga honesta y recarga silenciosa) · fase roja.
 *
 * Contrato: tras un cobro confirmado la página recarga en silencio (sin spinner,
 * sin perder el tab ni ediciones sin guardar); si la recarga falla con datos en
 * pantalla se conserva la ficha y se avisa ("No se pudo actualizar la ficha..."),
 * nunca la pantalla de error. La recarga silenciosa solo rehidrata el formulario
 * si no está modificado. Rutina sin datos (204/null o sin bloques) es estado
 * vacío; un fallo real (red/5xx) es error con reintento. Catálogo y última
 * sesión avisan al fallar (404 de última sesión = sin sesiones, sin aviso).
 *
 * Fase roja: el código aún no existe; estos tests fallan por esa razón
 * (no por imports ni configuración).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { apiClient, ApiError } from '../../lib/api-client';
import { AlumnoDetallePage } from './AlumnoDetallePage';

const CLIENTE_ID = 'a1111111-1111-4111-8111-111111111111';
const ALUMNO_USUARIO_ID = 'a3333333-3333-4333-8333-333333333333';
const COACH_ID = 'e1111111-1111-4111-8111-111111111111';
const ENDPOINT_COBRO = `/finanzas/clientes/${CLIENTE_ID}/cobro-directo-inteligente`;
const ENDPOINT_PERFIL = `/alumnos/${CLIENTE_ID}`;
const ENDPOINT_RUTINA = `/rutinas/alumno/${CLIENTE_ID}/activa`;
const ENDPOINT_ULTIMA = `/sesiones/alumno/${CLIENTE_ID}/ultima`;

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
  createdAtUtc: '2026-01-01T00:00:00.000Z',
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

const BLOQUE_EMPUJE = {
  diaId: 'd1',
  titulo: 'Día 1 (Lunes): Empuje',
  enfoque: 'Hipertrofia',
  ejercicios: [
    {
      id: 'ej-1',
      nombre: 'Press de banca',
      series: 4,
      reps: '8-10',
      peso: '60 kg',
      rpe: '8',
      descansoSegundos: 90,
    },
  ],
};

function sesionCompletada(): SesionEntrenamientoDetalleDTO {
  return {
    id: '5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e01',
    alumnoId: CLIENTE_ID,
    bloqueId: 'd1',
    fechaProgramada: '2026-10-05',
    fechaInicioUtc: '2026-10-05T10:00:00.000Z',
    fechaFinUtc: '2026-10-05T11:00:00.000Z',
    timezoneCliente: 'America/Caracas',
    estado: 'completada',
    porcentajeCumplimiento: '85.00',
    volumenTotalKg: '1200.00',
    notasAlumno: null,
    ejercicios: [],
    duracionMinutos: 60,
    createdAtUtc: '2026-10-05T11:00:00.000Z',
    updatedAtUtc: '2026-10-05T11:00:00.000Z',
  } as SesionEntrenamientoDetalleDTO;
}

function errorHttp(estado: number, detalle: string): ApiError {
  return new ApiError(
    estado,
    {
      type: 'about:blank',
      title: estado === 404 ? 'No encontrado' : 'Error del servidor',
      status: estado,
      detail: detalle,
      timestampUtc: '2026-10-19T12:00:00.000Z',
    },
    detalle
  );
}

// ---------------------------------------------------------------------------
// Mock de red con perillas por endpoint
// ---------------------------------------------------------------------------

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

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

let alHacerPostCobro: () => Promise<unknown>;
let perfilActual: PerfilAlumnoDetalleDTO = PERFIL;
// 'siempre-ok' responde PERFIL; 'segunda-falla' rechaza a partir de la 2ª llamada;
// 'segunda-cambia' responde perfilSegundaRespuesta a partir de la 2ª;
// 'segunda-retenida' deja la 2ª llamada pendiente hasta liberarla a mano (L5.1).
let modoPerfil: 'siempre-ok' | 'segunda-falla' | 'segunda-cambia' | 'segunda-retenida' =
  'siempre-ok';
let perfilSegundaRespuesta: PerfilAlumnoDetalleDTO = PERFIL;
let llamadasPerfil = 0;
/** Resolvedor de la 2ª llamada pendiente (modo 'segunda-retenida'). */
let retenedorSegundaCarga: ((valor: unknown) => void) | null = null;
let rutinaRespuesta: unknown = null;
let planesRespuesta: unknown[] | Error = [PLAN_A];
let ultimaRespuesta: unknown | Error | null = null;
/** Respuestas programadas por nº de llamada a GET /alumnos/:id (V5). */
let respuestasPerfilPorLlamada: Record<number, { tipo: 'ok' | 'falla' | 'retenida'; valor?: unknown }> = {};
/** Falla el PATCH de guardado del expediente (V2). */
let falloGuardado: Error | null = null;
let llamadasRutina = 0;
let retenerRutina = false;
let retenedorRutina: ((valor: unknown) => void) | null = null;

function esError(valor: unknown): valor is Error {
  return valor instanceof Error;
}

function llamadasGetPerfil(): unknown[][] {
  const directas = mockApi.mock.calls.filter(([endpoint]) => endpoint === ENDPOINT_PERFIL);
  const helper = mockApi.get.mock.calls.filter(([endpoint]) => endpoint === ENDPOINT_PERFIL);
  return [...directas, ...helper];
}

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === ENDPOINT_PERFIL) {
    llamadasPerfil += 1;
    const programada = respuestasPerfilPorLlamada[llamadasPerfil];
    if (programada) {
      if (programada.tipo === 'falla') return Promise.reject(new Error('caído'));
      if (programada.tipo === 'retenida') {
        return new Promise<unknown>((resolver) => {
          retenedorSegundaCarga = resolver;
        });
      }
      return Promise.resolve(programada.valor ?? perfilActual);
    }
    if (modoPerfil === 'segunda-falla' && llamadasPerfil > 1) {
      return Promise.reject(new Error('caído'));
    }
    if (modoPerfil === 'segunda-cambia' && llamadasPerfil > 1) {
      return Promise.resolve(perfilSegundaRespuesta);
    }
    if (modoPerfil === 'segunda-retenida' && llamadasPerfil > 1) {
      return new Promise<unknown>((resolver) => {
        retenedorSegundaCarga = resolver;
      });
    }
    return Promise.resolve(perfilActual);
  }
  if (endpoint === '/finanzas/planes') {
    if (esError(planesRespuesta)) return Promise.reject(planesRespuesta);
    return Promise.resolve(planesRespuesta);
  }
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(RESUMEN_FINANCIERO);
  }
  if (endpoint === ENDPOINT_ULTIMA) {
    if (esError(ultimaRespuesta)) return Promise.reject(ultimaRespuesta);
    return Promise.resolve(ultimaRespuesta);
  }
  if (endpoint.startsWith(`/sesiones/alumno/${CLIENTE_ID}/historial`)) {
    return Promise.resolve({ items: [], total: 0 });
  }
  if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
  if (endpoint === ENDPOINT_RUTINA) {
    llamadasRutina += 1;
    if (retenerRutina) {
      retenerRutina = false;
      return new Promise<unknown>((resolver) => {
        retenedorRutina = resolver;
      });
    }
    if (esError(rutinaRespuesta)) return Promise.reject(rutinaRespuesta);
    return Promise.resolve(rutinaRespuesta);
  }
  if (endpoint.startsWith('/antropometria/evolucion/')) {
    return Promise.resolve({ evaluaciones: [], controlesTotal: 0 });
  }
  return Promise.resolve(null);
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  Element.prototype.scrollIntoView = vi.fn();
  alHacerPostCobro = () => Promise.resolve({ id: 'tx-nueva' });
  perfilActual = PERFIL;
  modoPerfil = 'siempre-ok';
  perfilSegundaRespuesta = PERFIL;
  llamadasPerfil = 0;
  retenedorSegundaCarga = null;
  rutinaRespuesta = null;
  planesRespuesta = [PLAN_A];
  ultimaRespuesta = null;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (opciones?.method === 'POST' && endpoint === ENDPOINT_COBRO) return alHacerPostCobro();
    if (opciones?.method === 'PATCH' && endpoint === ENDPOINT_PERFIL && falloGuardado) {
      return Promise.reject(falloGuardado);
    }
    return respuestaGet(endpoint);
  });
  mockApi.post.mockImplementation((endpoint: string) =>
    endpoint === ENDPOINT_COBRO ? alHacerPostCobro() : Promise.resolve(null)
  );
  mockApi.patch.mockImplementation((endpoint: string) =>
    falloGuardado && endpoint === ENDPOINT_PERFIL
      ? Promise.reject(falloGuardado)
      : Promise.resolve(PERFIL)
  );
  mockApi.delete.mockImplementation(() => Promise.resolve(null));
  mockApi.put.mockImplementation(() => Promise.resolve(null));
  respuestasPerfilPorLlamada = {};
  falloGuardado = null;
  llamadasRutina = 0;
  retenerRutina = false;
  retenedorRutina = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montarFicha(tab = 'finanzas'): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=${tab}`]}>
      <Routes>
        <Route path="/coach/alumnos/:id" element={<AlumnoDetallePage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function abrirCobro(): Promise<HTMLElement> {
  const abrir = await screen.findByRole('button', { name: /Cobrar en sala/ }, { timeout: 4000 });
  fireEvent.click(abrir);
  return screen.findByRole('dialog');
}

async function confirmarCobro(dialogo: HTMLElement): Promise<void> {
  fireEvent.change(within(dialogo).getByLabelText('Monto Recibido'), { target: { value: '40.00' } });
  const boton = within(dialogo).getByRole('button', { name: /Registrar y Liquidar|Registrar cobro/ });
  fireEvent.click(boton);
  await waitFor(() => expect(llamadasPostCobro().length).toBeGreaterThan(0), { timeout: 4000 });
}

/** POST de cobro por el helper o por el callable (igual que `cobro-sala`). */
function llamadasPostCobro(): unknown[][] {
  const viaHelper = mockApi.post.mock.calls.filter(([endpoint]) => endpoint === ENDPOINT_COBRO);
  const viaCallable = mockApi.mock.calls.filter(
    ([endpoint, opciones]) =>
      endpoint === ENDPOINT_COBRO &&
      (opciones as { method?: string } | undefined)?.method === 'POST'
  );
  return [...viaHelper, ...viaCallable];
}

// ---------------------------------------------------------------------------
// L5.1-L5.4 · recarga silenciosa
// ---------------------------------------------------------------------------

describe('AlumnoDetallePage · L5 recarga silenciosa tras el cobro', () => {
  it('L5.1 · tras confirmar el cobro no vuelve el spinner, el tab sigue activo y solo hay 2 GET', async () => {
    modoPerfil = 'segunda-retenida';
    montarFicha('finanzas');
    await screen.findByRole('button', { name: /Cobrar en sala/ });

    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    // La recarga queda en vuelo: la 2a llamada ya se emitio pero no resolvio.
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    // Con recarga silenciosa nunca hay spinner de pantalla completa, ni siquiera
    // mientras la recarga sigue en vuelo: se le da tiempo a React de pintar.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(screen.queryByText(/Cargando Expediente Deportivo/)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Pagos' }).getAttribute('aria-selected')).toBe('true');

    // Se libera la recarga y la ficha termina de actualizarse sin spinner.
    act(() => {
      retenedorSegundaCarga?.(perfilActual);
    });
    await screen.findByRole('button', { name: /Cobrar en sala/ });
    expect(screen.queryByText(/Cargando Expediente Deportivo/)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Pagos' }).getAttribute('aria-selected')).toBe('true');
    expect(llamadasGetPerfil()).toHaveLength(2);
  });

  it('L5.2a · la recarga silenciosa conserva las ediciones sin guardar', async () => {
    montarFicha('resumen');
    const campoNombres = await screen.findByDisplayValue('María');
    fireEvent.change(campoNombres, { target: { value: 'Nombre editado' } });

    fireEvent.click(screen.getByRole('tab', { name: 'Pagos' }));
    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    expect(screen.getByDisplayValue('Nombre editado')).toBeTruthy();
  });

  it('L5.2b · sin ediciones, la recarga trae el nombre nuevo del servidor', async () => {
    modoPerfil = 'segunda-cambia';
    perfilSegundaRespuesta = { ...PERFIL, nombres: 'María Actualizada' };

    montarFicha('resumen');
    await screen.findByDisplayValue('María');

    fireEvent.click(screen.getByRole('tab', { name: 'Pagos' }));
    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    expect(screen.getByDisplayValue('María Actualizada')).toBeTruthy();
  });

  it('L5.3 · si la recarga falla con datos en pantalla se avisa y no se muestra el error genérico', async () => {
    modoPerfil = 'segunda-falla';
    montarFicha('finanzas');
    await screen.findByRole('button', { name: /Cobrar en sala/ });

    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    expect(await screen.findByText(/No se pudo actualizar la ficha/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Expediente no encontrado' })).toBeNull();
    // La ficha sigue visible: el botón de cobro continúa en la vista.
    expect(screen.getByRole('button', { name: /Cobrar en sala/ })).toBeTruthy();
  });

  // L5.4 OMITIDO: `AlumnoDetallePage.caracterizacion.interaccion.spec.tsx` B0
  // ("muestra error honesto con Reintentar si el expediente no carga") ya cubre la
  // primera carga fallida con "Expediente no encontrado" + "Reintentar".
});

// ---------------------------------------------------------------------------
// L5.5-L5.7 · rutina honesta
// ---------------------------------------------------------------------------

describe('AlumnoDetallePage · L5 rutina honesta', () => {
  it('L5.5 · si la rutina falla hay alert y no estado vacío', async () => {
    rutinaRespuesta = new Error('caído (500)');
    montarFicha('entrenamiento');

    expect(await screen.findByText('No se pudo cargar la rutina semanal')).toBeTruthy();
    expect(screen.queryByText(/aún no tiene una rutina semanal activa/i)).toBeNull();
  });

  it('L5.6 · Reintentar vuelve a pedir la rutina y muestra los días sin alert', async () => {
    rutinaRespuesta = new Error('caído (500)');
    montarFicha('entrenamiento');
    await screen.findByText('No se pudo cargar la rutina semanal');

    rutinaRespuesta = { bloques: [BLOQUE_EMPUJE] };
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(screen.queryByText('No se pudo cargar la rutina semanal')).toBeNull());
    expect(screen.getByText(/Día 1.*Empuje/)).toBeTruthy();
  });

  it('L5.7 · sin rutina (204/null o sin bloques) hay estado vacío y no hay alert', async () => {
    rutinaRespuesta = null;
    montarFicha('entrenamiento');

    expect(await screen.findByText(/aún no tiene una rutina semanal activa/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// L5.9-L5.10 · avisos de catálogo y última sesión
// ---------------------------------------------------------------------------

describe('AlumnoDetallePage · L5 avisos de catálogo y última sesión', () => {
  it('L5.9 · si el catálogo falla se avisa y la ficha carga igual', async () => {
    planesRespuesta = new Error('caído (500)');
    montarFicha('finanzas');

    expect(await screen.findByText('No se pudo cargar el catálogo de planes.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cobrar en sala/ })).toBeTruthy();
  });

  it('L5.10 · si la última sesión falla con 500 se avisa; con 404 no hay aviso ni tarjeta', async () => {
    ultimaRespuesta = errorHttp(500, 'caído (500)');
    montarFicha('entrenamiento');
    expect(await screen.findByText('No se pudo cargar el último entrenamiento.')).toBeTruthy();

    cleanup();
    ultimaRespuesta = errorHttp(404, 'sin sesiones');
    montarFicha('entrenamiento');
    await screen.findByRole('tab', { name: 'Entrenos' });
    expect(screen.queryByText('No se pudo cargar el último entrenamiento.')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Último entrenamiento/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// V1-V8 · validación de la ronda de correcciones
// ---------------------------------------------------------------------------

describe('AlumnoDetallePage · V1 aviso que se limpia', () => {
  it('V1 · el aviso de catálogo desaparece tras una recarga sana', async () => {
    planesRespuesta = new Error('caído (500)');
    montarFicha('finanzas');
    expect(await screen.findByText('No se pudo cargar el catálogo de planes.')).toBeTruthy();

    planesRespuesta = [PLAN_A];
    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });
    await waitFor(
      () => expect(screen.queryByText('No se pudo cargar el catálogo de planes.')).toBeNull(),
      { timeout: 4000 }
    );
  });
});

describe('AlumnoDetallePage · V2 canales separados', () => {
  it('V2 · un error de guardado en Perfil no aparece en Pagos', async () => {
    falloGuardado = new Error('No se pudo guardar (500).');
    montarFicha('resumen');
    await screen.findByDisplayValue('María');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudo guardar (500).');

    fireEvent.click(screen.getByRole('tab', { name: 'Pagos' }));
    await screen.findByRole('button', { name: /Cobrar en sala/ });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('No se pudo guardar (500).')).toBeNull();
  });
});

describe('AlumnoDetallePage · V3 aviso de carga en Perfil', () => {
  it('V3 · el aviso de catálogo se ve en la cabecera, una sola vez', async () => {
    planesRespuesta = new Error('caído (500)');
    montarFicha('resumen');
    await screen.findByDisplayValue('María');

    const avisos = await screen.findAllByText('No se pudo cargar el catálogo de planes.');
    expect(avisos).toHaveLength(1);
  });
});

describe('AlumnoDetallePage · V4 escritura durante la recarga', () => {
  it('V4 · lo escrito con la recarga en vuelo sobrevive a la respuesta tardía', async () => {
    modoPerfil = 'segunda-retenida';
    montarFicha('finanzas');
    await screen.findByRole('button', { name: /Cobrar en sala/ });

    const dialogo = await abrirCobro();
    await confirmarCobro(dialogo);
    // La recarga queda en vuelo: la 2ª llamada ya se emitió pero no resolvió.
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    // Con la recarga en vuelo se cambia de tab y se escribe en el formulario.
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    const campo = await screen.findByDisplayValue('María');
    fireEvent.change(campo, { target: { value: 'Escrito durante la recarga' } });

    // Llega la respuesta tardía (mismo perfil): no debe pisar lo escrito.
    act(() => {
      retenedorSegundaCarga?.(perfilActual);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.getByDisplayValue('Escrito durante la recarga')).toBeTruthy();
    expect(screen.queryByText('Cargando Expediente Deportivo 360°...')).toBeNull();
  });
});

describe('AlumnoDetallePage · V5 carreras entre recargas', () => {
  it('V5 · la respuesta vieja no pisa a la nueva', async () => {
    respuestasPerfilPorLlamada = {
      2: { tipo: 'retenida' },
      3: { tipo: 'ok', valor: { ...PERFIL, nombres: 'Nombre B' } },
    };
    montarFicha('finanzas');
    await screen.findByRole('button', { name: /Cobrar en sala/ });

    // Primera recarga: queda retenida.
    const dialogo1 = await abrirCobro();
    await confirmarCobro(dialogo1);
    await waitFor(() => expect(llamadasGetPerfil().length).toBe(2), { timeout: 8000 });

    // Segunda recarga: resuelve de inmediato con otro nombre.
    const dialogo2 = await abrirCobro();
    await confirmarCobro(dialogo2);
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    await waitFor(
      () => expect(screen.queryByDisplayValue('Nombre B')).toBeTruthy(),
      { timeout: 8000 }
    );

    // Llega la respuesta vieja: el campo conserva el valor nuevo.
    act(() => {
      retenedorSegundaCarga?.({ ...PERFIL, nombres: 'Nombre A' });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.getByDisplayValue('Nombre B')).toBeTruthy();
    expect(llamadasGetPerfil().length).toBeGreaterThanOrEqual(3);
  });
});

describe('AlumnoDetallePage · V6 guardar limpia el error de rutina', () => {
  it('V6 · tras guardar con éxito desaparece el alert de rutina', async () => {
    rutinaRespuesta = new Error('caído (500)');
    montarFicha('entrenamiento');
    expect(await screen.findByText('No se pudo cargar la rutina semanal')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Editar rutina semanal' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar & Editar Rutina Semanal' });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar planificación activa' })
    );

    await waitFor(
      () => expect(screen.queryByText('No se pudo cargar la rutina semanal')).toBeNull(),
      { timeout: 4000 }
    );
  });
});

describe('AlumnoDetallePage · V7 reintento de rutina', () => {
  it('V7 · dos clics seguidos piden una sola recarga; al resolver se ven los días sin alert', async () => {
    rutinaRespuesta = new Error('caído (500)');
    montarFicha('entrenamiento');
    await screen.findByText('No se pudo cargar la rutina semanal');

    const llamadasAntes = llamadasRutina;
    retenerRutina = true;
    const reintentar = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(reintentar);
    fireEvent.click(reintentar);
    expect(llamadasRutina).toBe(llamadasAntes + 1);

    // Con la petición en vuelo el alert sigue y no aparece el vacío.
    expect(screen.queryByText('No se pudo cargar la rutina semanal')).toBeTruthy();
    expect(screen.queryByText(/aún no tiene una rutina semanal activa/i)).toBeNull();

    act(() => {
      retenedorRutina?.({
        id: 'r111',
        alumnoId: 'a1111111-1111-4111-8111-111111111111',
        bloques: [
          {
            diaId: 'd1',
            titulo: 'Día 1 (Lunes): Empuje',
            enfoque: 'Hipertrofia',
            ejercicios: [
              {
                id: 'ej-1',
                nombre: 'Press de banca',
                series: 4,
                reps: '8-10',
                peso: '60 kg',
                rpe: '8',
                descansoSegundos: 60,
              },
            ],
          },
        ],
      });
    });
    await waitFor(
      () => expect(screen.queryByText('No se pudo cargar la rutina semanal')).toBeNull(),
      { timeout: 4000 }
    );
    expect(screen.getByText(/Día 1.*Empuje/)).toBeTruthy();
  });
});

describe('AlumnoDetallePage · V8 reintento con vacío', () => {
  it('V8 · si el reintento responde vacío se ve el estado vacío sin alert', async () => {
    rutinaRespuesta = new Error('caído (500)');
    montarFicha('entrenamiento');
    await screen.findByText('No se pudo cargar la rutina semanal');

    rutinaRespuesta = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(
      () => expect(screen.queryByText('No se pudo cargar la rutina semanal')).toBeNull(),
      { timeout: 4000 }
    );
    expect(screen.getByText(/aún no tiene una rutina semanal activa/i)).toBeTruthy();
  });
});
