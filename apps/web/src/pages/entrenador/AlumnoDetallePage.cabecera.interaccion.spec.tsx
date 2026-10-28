// @vitest-environment jsdom
/**
 * 06 · Ficha del alumno (L7 · cabecera) · verificación de la página (L7.9).
 *
 * Cubre lo que la fase roja dejó OMITIDO: la franja de datos clave vive entre la cabecera
 * y la barra de pestañas, "Peso…" activa Medidas, en demo los cuatro valores aparecen sin
 * "undefined" y "Más acciones" → "Pausar" abre el `DialogoConfirmacion` de siempre.
 *
 * Montaje copiado de `AlumnoDetallePage.reorganizacion.interaccion.spec.tsx` (auth mock +
 * apiClient mock + MemoryRouter `?tab=`), con su mismo timeout propio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  EstadoAlumno,
  EstadoMedicion,
  EstadoSesion,
  Modalidad,
  OrigenAntropometria,
  TipoDocumento,
  type ControlAntropometricoDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { fechaCalendarioLocal, formatFechaLocal } from '../../lib/date-format';

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

/** Historial que devuelve el mock de `/sesiones/alumno/:id/historial` (V2). */
let historialMock: SesionEntrenamientoDetalleDTO[] = [];
/** Controles en orden ASCENDENTE como los devuelve la API (V4). */
let controlesAscMock: ControlAntropometricoDetalleDTO[] = [];
/** Cuando es true, el refresco de la página 1 de controles falla (V9). */
let fallaRefrescoControles = false;

function respuestaGet(endpoint: string): Promise<unknown> {
  if (endpoint === `/alumnos/${CLIENTE_ID}`) return Promise.resolve(PERFIL);
  if (endpoint === '/finanzas/planes') return Promise.resolve([PLAN_A]);
  if (endpoint.startsWith('/finanzas/planes/override')) return Promise.resolve([]);
  if (endpoint.startsWith('/finanzas/suscripciones/')) return Promise.resolve(null);
  if (endpoint.startsWith(`/finanzas/clientes/${CLIENTE_ID}/historial`)) {
    return Promise.resolve(RESUMEN_FINANCIERO);
  }
  if (endpoint.startsWith(`/sesiones/alumno/${CLIENTE_ID}/historial`)) {
    return Promise.resolve({
      items: historialMock,
      total: historialMock.length,
      limit: 10,
      offset: 0,
    });
  }
  if (endpoint.startsWith('/sesiones/alumno/')) return Promise.resolve({ items: [], total: 0 });
  if (endpoint === `/sesiones/alumno/${CLIENTE_ID}/ultima`) return Promise.resolve(null);
  if (endpoint === '/ejercicios/catalogo') return Promise.resolve([]);
  if (endpoint.startsWith('/rutinas/alumno/')) return Promise.resolve(null);
  if (endpoint.startsWith('/antropometria/evolucion/')) {
    // Serie completa del gráfico (sin `controlesLimit`): todo; tabla: ventana descendente.
    if (!endpoint.includes('controlesLimit')) {
      return Promise.resolve({
        evaluaciones: controlesAscMock,
        controlesTotal: controlesAscMock.length,
      });
    }
    if (fallaRefrescoControles) {
      return Promise.reject(new Error('Fallo simulado del refresco de controles'));
    }
    const limite = Number(/controlesLimit=(\d+)/.exec(endpoint)?.[1] ?? '10');
    const offset = Number(/controlesOffset=(\d+)/.exec(endpoint)?.[1] ?? '0');
    return Promise.resolve({
      evaluaciones: controlesAscMock.slice(offset, offset + limite),
      controlesTotal: controlesAscMock.length,
    });
  }
  // POST del registro en sala (V9): el servidor confirma el control nuevo de 82.50 kg.
  if (endpoint === '/antropometria/checkin') {
    return Promise.resolve({
      id: 'ctrl-nuevo-8250',
      alumnoId: ALUMNO_USUARIO_ID,
      fechaEvaluacion: '2026-10-28',
      pesoKg: '82.50',
      porcentajeGrasa: '16.2',
      perimetros: null,
      modalidad: Modalidad.PRESENCIAL,
      origen: OrigenAntropometria.PRESENCIAL_VERIFICADO,
      registradoPor: COACH_ID,
      estado: EstadoMedicion.APROBADO,
      fotos: [],
      createdAtUtc: '2026-10-28T00:00:00.000Z',
      updatedAtUtc: '2026-10-28T00:00:00.000Z',
    });
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
  historialMock = [];
  controlesAscMock = [];
  fallaRefrescoControles = false;
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

/** Sonda de la URL para comprobar `?tab=` sin depender del router fuera del árbol. */
function SondaUbicacion() {
  const ubicacion = useLocation();
  return (
    <div data-testid="sonda-ubicacion">{`${ubicacion.pathname}${ubicacion.search}`}</div>
  );
}

function montarFicha(tab = 'resumen'): void {
  render(
    <MemoryRouter initialEntries={[`/coach/alumnos/${CLIENTE_ID}?tab=${tab}`]}>
      <SondaUbicacion />
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

describe('AlumnoDetallePage · L7.9 franja de datos clave', () => {
  it('la franja va entre la cabecera y la barra de pestañas', async () => {
    montarFicha();
    const titulo = await screen.findByRole('heading', { level: 1, name: 'María López' }, { timeout: 8000 });
    const franja = await screen.findByRole('button', { name: /^Saldo pendiente:/ }, { timeout: 8000 });
    const tabs = await screen.findByRole('tablist', { name: 'Pestañas de la ficha del alumno' }, { timeout: 8000 });

    expect(apareceAntes(titulo, franja)).toBe(true);
    expect(apareceAntes(franja, tabs)).toBe(true);
    expect(screen.getAllByRole('button', { name: /\. Ver (Pagos|Entrenos|Medidas)$/ })).toHaveLength(4);
  });

  it('"Peso…" activa el tab Medidas y deja ?tab=antropometria en la URL', async () => {
    montarFicha();
    const peso = await screen.findByRole('button', { name: /^Peso:/ }, { timeout: 8000 });
    fireEvent.click(peso);

    const tabMedidas = screen.getByRole('tab', { name: 'Medidas' });
    await waitFor(() => expect(tabMedidas.getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByTestId('sonda-ubicacion').textContent).toContain('tab=antropometria');
  });

  it('en demo los cuatro valores aparecen sin "undefined"', async () => {
    sesionMock.isDemoMode = true;
    montarFicha();

    await screen.findByRole('button', { name: /^Saldo pendiente:/ }, { timeout: 8000 });
    const celdas = screen.getAllByRole('button', { name: /\. Ver (Pagos|Entrenos|Medidas)$/ });
    expect(celdas).toHaveLength(4);
    for (const celda of celdas) {
      expect(celda.textContent ?? '').not.toContain('undefined');
      expect(celda.textContent?.trim()).toBeTruthy();
    }
    expect(document.body.textContent ?? '').not.toContain('undefined');
  });
});

describe('AlumnoDetallePage · L7.9 el menú conserva la confirmación de la página', () => {
  it('"Más acciones" → "Pausar" abre el DialogoConfirmacion con el nombre del alumno', async () => {
    montarFicha();
    const trigger = await screen.findByRole('button', { name: 'Más acciones' }, { timeout: 8000 });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });

    const pausar = await screen.findByRole('menuitem', { name: 'Pausar' }, { timeout: 8000 });
    fireEvent.click(pausar);

    const dialogo = await screen.findByRole('dialog', {}, { timeout: 8000 });
    expect(dialogo.textContent).toContain('Pausar a María López');
    // No se ejecuta ninguna mutación hasta confirmar en el diálogo.
    expect(mockApi.patch).not.toHaveBeenCalled();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Ronda de correcciones (prompt 07): V1 (B1), V2 (W1) y V4 (W3) a nivel de página.
// ---------------------------------------------------------------------------------------------

/** Sesión COMPLETADA de ayer al mediodía local (texto estable "Entrenó ayer"). */
function sesionAyer(): SesionEntrenamientoDetalleDTO {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  ayer.setHours(12, 0, 0, 0);
  return {
    id: 's2222222-2222-4222-8222-222222222222',
    alumnoId: CLIENTE_ID,
    fechaProgramada: fechaCalendarioLocal(ayer),
    fechaInicioUtc: ayer.toISOString(),
    fechaFinUtc: new Date(ayer.getTime() + 60 * 60 * 1000).toISOString(),
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    ejercicios: [],
    createdAtUtc: ayer.toISOString(),
    updatedAtUtc: ayer.toISOString(),
  };
}

/** 12 controles APROBADOS en orden ASCENDENTE: del más antiguo (70.00) al más nuevo (81.00). */
function controlesAscendentes(): ControlAntropometricoDetalleDTO[] {
  return Array.from({ length: 12 }, (_, indice) => ({
    id: `control-${indice}`,
    alumnoId: ALUMNO_USUARIO_ID,
    fechaEvaluacion: `2026-09-${String(indice + 1).padStart(2, '0')}`,
    pesoKg: `${70 + indice}.00`,
    porcentajeGrasa: null,
    perimetros: null,
    modalidad: Modalidad.PRESENCIAL,
    origen: OrigenAntropometria.PRESENCIAL_VERIFICADO,
    registradoPor: COACH_ID,
    estado: EstadoMedicion.APROBADO,
    fotos: [],
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-01T00:00:00.000Z',
  }));
}

describe('AlumnoDetallePage · V1 (B1) próxima cuota con el ISO real del demo', () => {
  it('con la cuota demo (ISO) la franja muestra una fecha, no "—"', async () => {
    sesionMock.isDemoMode = true;
    montarFicha();

    const esperada = formatFechaLocal('2026-09-30T23:59:59.000Z');
    expect(esperada).not.toBeNull();
    const cuota = await screen.findByRole(
      'button',
      { name: `Próxima cuota: ${esperada}. Ver Pagos` },
      { timeout: 8000 },
    );
    expect(cuota.textContent).not.toContain('—');
  });
});

describe('AlumnoDetallePage · V2 (W1) último entreno con respaldo al historial', () => {
  it('con /ultima null y una COMPLETADA en el historial la franja no dice "Sin entrenos registrados"', async () => {
    historialMock = [sesionAyer()];
    montarFicha('entrenamiento');

    const franja = await screen.findByRole(
      'button',
      { name: 'Último entreno: Entrenó ayer. Ver Entrenos' },
      { timeout: 8000 },
    );
    expect(franja).toBeTruthy();
    expect(screen.queryByText('Sin entrenos registrados')).toBeNull();
    // La pestaña Entrenos muestra la misma sesión resuelta desde el historial.
    expect(await screen.findByText('Último entrenamiento', {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText('Entrenamiento en Progreso')).toBeNull();
  });
});

describe('AlumnoDetallePage · V4 (W3) el peso no cambia al paginar controles', () => {
  it('en Medidas, avanzar a la página 2 mantiene el peso del control más reciente', async () => {
    controlesAscMock = controlesAscendentes();
    montarFicha('antropometria');

    // Página 1: el control más reciente (81.00) da el peso de la franja.
    await screen.findByRole(
      'button',
      { name: 'Peso: 81.00 kg. Ver Medidas' },
      { timeout: 8000 },
    );

    const siguiente = await screen.findByRole(
      'button',
      { name: 'Página siguiente' },
      { timeout: 8000 },
    );
    fireEvent.click(siguiente);

    // La tabla pinta la página 2 (los dos controles más antiguos)...
    expect(await screen.findByText('70.00 kg', {}, { timeout: 8000 })).toBeTruthy();
    // ...y la franja sigue con el más reciente.
    expect(
      screen.getByRole('button', { name: 'Peso: 81.00 kg. Ver Medidas' }),
    ).toBeTruthy();
  });
});

describe('AlumnoDetallePage · V9 (N1) el peso nuevo sobrevive al refresco fallido', () => {
  it('POST bien + refresco de página 1 fallido: franja "82.50 kg" y tabla con el control nuevo', async () => {
    // 1. Ficha real con un control previo de 81.00 kg.
    controlesAscMock = [controlesAscendentes()[11]].map((control) => ({
      ...control,
      id: 'control-previo-8100',
      pesoKg: '81.00',
    }));
    montarFicha('antropometria');

    // La franja parte del control previo.
    await screen.findByRole(
      'button',
      { name: 'Peso: 81.00 kg. Ver Medidas' },
      { timeout: 8000 },
    );

    // 2. A partir de aquí el refresco de la página 1 falla (el POST sigue bien).
    fallaRefrescoControles = true;

    // Se registra el control nuevo (82.50 kg) con el modal de Medidas.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Registrar control' }, { timeout: 8000 }),
    );
    const dialogo = await screen.findByRole('dialog', {}, { timeout: 8000 });
    fireEvent.change(within(dialogo).getByLabelText('Peso (kg)'), {
      target: { value: '82.50' },
    });
    fireEvent.click(
      within(dialogo).getByRole('button', { name: 'Guardar Control Antropométrico' }),
    );

    // 3. La franja muestra el control nuevo, no el anterior.
    await screen.findByRole(
      'button',
      { name: 'Peso: 82.50 kg. Ver Medidas' },
      { timeout: 8000 },
    );
    // ...y la tabla del tab también pinta el control nuevo (celda de escritorio).
    const panel = screen.getByRole('tabpanel');
    const tabla = within(panel).getByRole('table');
    expect(within(tabla).getByText('82.50 kg')).toBeTruthy();
  });
});
