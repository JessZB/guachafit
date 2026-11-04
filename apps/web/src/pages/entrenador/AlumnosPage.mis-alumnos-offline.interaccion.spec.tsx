// @vitest-environment jsdom
/**
 * 01 pendientes (fase roja) · Contratos C1-C7: aviso sin conexión en "Mis alumnos".
 *
 * Monta `AlumnosPage` como en `AlumnosPage.mis-alumnos.interaccion.spec.tsx` y simula la
 * conexión con `Object.defineProperty(window.navigator, 'onLine', …)`. El aviso
 * `AvisoDatosOffline` aún NO se usa en la vista: C1, C4 y C6 fallan por eso (falta el
 * código, no por importación ni configuración). C2, C3, C5 y C7 ya pasan y quedan como
 * regresión.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import {
  Modalidad,
  TipoDocumento,
  EstadoAlumno,
  type AlumnoDirectorioItemDTO,
  type DirectorioAlumnosDTO,
  type PerfilEntrenadorDTO,
  type ResumenDirectorioAlumnosDTO,
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

vi.mock('../../lib/acceso-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/acceso-ui')>();
  return { ...actual, copiarAlPortapapeles: vi.fn(() => Promise.resolve(true)) };
});

import { apiClient } from '../../lib/api-client';
import { AlumnosPage } from './AlumnosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

// ---------------------------------------------------------------------------
// Fixtures (mismo roster base que el contrato D)
// ---------------------------------------------------------------------------

const ALUMNO_ACTIVO: AlumnoDirectorioItemDTO = {
  id: 'al-001',
  usuarioId: 'u-001',
  entrenadorId: 'coach-01',
  nombres: 'Carlos',
  apellidos: 'Mendoza',
  email: 'carlos.mendoza@email.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '24123456',
  fechaNacimiento: '1998-05-14',
  edadCalculada: 28,
  telefonoWhatsapp: '+584121234567',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  planActivoNombre: 'Presencial Completo',
  semaforoPago: 'al_dia',
  ultimaSesionFecha: null,
  rachaDias: 0,
  rachaUltimaFecha: null,
  createdAtUtc: '2026-01-10T00:00:00.000Z',
};

const ALUMNO_MORA: AlumnoDirectorioItemDTO = {
  id: 'al-002',
  usuarioId: 'u-002',
  entrenadorId: 'coach-01',
  nombres: 'Valeria',
  apellidos: 'Silva',
  email: 'valeria.silva@email.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '26987654',
  fechaNacimiento: '2001-11-20',
  edadCalculada: 24,
  telefonoWhatsapp: '+584149876543',
  modalidad: Modalidad.REMOTO,
  estadoActivacion: EstadoAlumno.ACTIVO,
  planActivoNombre: null,
  semaforoPago: 'moroso',
  ultimaSesionFecha: null,
  rachaDias: 0,
  rachaUltimaFecha: null,
  createdAtUtc: '2026-02-10T00:00:00.000Z',
};

const ALUMNO_ARCHIVADO: AlumnoDirectorioItemDTO = {
  id: 'al-003',
  usuarioId: 'u-003',
  entrenadorId: 'coach-01',
  nombres: 'Roberto',
  apellidos: 'Diaz',
  email: 'roberto.diaz@email.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '20112233',
  fechaNacimiento: '1992-03-15',
  edadCalculada: 34,
  telefonoWhatsapp: '+584241122334',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
  planActivoNombre: 'Presencial 3 Dias',
  semaforoPago: 'sin_cuota',
  ultimaSesionFecha: null,
  rachaDias: 0,
  rachaUltimaFecha: null,
  deletedAtUtc: '2026-06-01T00:00:00.000Z',
  createdAtUtc: '2026-03-10T00:00:00.000Z',
};

const RESUMEN_BASE: ResumenDirectorioAlumnosDTO = {
  total: 3,
  activos: 2,
  pausados: 0,
  morosos: 1,
  presenciales: 1,
  remotos: 1,
  archivados: 1,
};

function respuestaDirectorio(
  items: AlumnoDirectorioItemDTO[],
  total: number,
  resumen: ResumenDirectorioAlumnosDTO = RESUMEN_BASE,
): DirectorioAlumnosDTO {
  return { items, total, limit: 25, offset: 0, resumen };
}

const RESPUESTA_BASE = respuestaDirectorio(
  [ALUMNO_ACTIVO, ALUMNO_MORA, ALUMNO_ARCHIVADO],
  3,
);

const PERFIL_COACH: PerfilEntrenadorDTO = {
  id: 'coach-01',
  usuarioId: 'e1111111-1111-4111-8111-111111111111',
  nombres: 'Luis',
  apellidos: 'Rojas',
  nombreComercial: 'Gimnasio Rojas',
  coachCode: 'COACH123',
  estadoLicencia: 'vigente' as unknown as PerfilEntrenadorDTO['estadoLicencia'],
  capacidadMaxima: 50,
  telefonoContacto: '+584149990000',
  captacionActiva: true,
  enlaceRotadoEnUtc: null,
  registrosPorEnlace: 0,
};

// ---------------------------------------------------------------------------
// Conexión simulada + montaje (mismo patrón que el contrato D)
// ---------------------------------------------------------------------------

const descriptorOnLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
const descriptorCachesOriginal = Object.getOwnPropertyDescriptor(window, 'caches');

function simularConexion(enLinea: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => enLinea,
  });
}

let directorioActual: DirectorioAlumnosDTO = RESPUESTA_BASE;
let errorDirectorio: Error | null = null;
let errorPerfil: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function montar(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/coach/alumnos']}>
        <Routes>
          <Route path="/coach/alumnos" element={<AlumnosPage />} />
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

/** Espera a que el directorio pinte la tarjeta del alumno activo (carga lista). */
async function esperarDirectorio(): Promise<void> {
  await screen.findByRole('button', { name: 'Ver expediente de Carlos Mendoza' }, { timeout: 4000 });
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  directorioActual = RESPUESTA_BASE;
  errorDirectorio = null;
  errorPerfil = null;
  // Aísla TanStack: las queries no deben quedar pausadas por un test offline anterior.
  onlineManager.setOnline(true);

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();

  mockApi.mockImplementation((endpoint: string) => {
    if (endpoint === '/entrenador/perfil') {
      if (errorPerfil) return Promise.reject(errorPerfil);
      return Promise.resolve(PERFIL_COACH);
    }
    if (typeof endpoint === 'string' && endpoint.startsWith('/alumnos?')) {
      if (errorDirectorio) return Promise.reject(errorDirectorio);
      return Promise.resolve(directorioActual);
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
  if (descriptorOnLineOriginal) {
    Object.defineProperty(window.navigator, 'onLine', descriptorOnLineOriginal);
  } else {
    delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  }
  if (descriptorCachesOriginal) {
    Object.defineProperty(window, 'caches', descriptorCachesOriginal);
  } else {
    delete (window as unknown as { caches?: unknown }).caches;
  }
});

// ---------------------------------------------------------------------------
// Contratos C8-C10 (lote 04: H2 y H3)
// ---------------------------------------------------------------------------

/** Extrae el aviso de error de recarga (`AvisoErrorDirectorio`) si está visible. */
function avisoErrorRecarga(): HTMLElement | null {
  const alertas = screen.queryAllByRole('alert');
  return (
    alertas.find((a) => {
      const texto = a.textContent ?? '';
      return texto.includes('Reintentar') && texto.includes('caído');
    }) ?? null
  );
}

/** Llamadas al endpoint del directorio (para observar `refetchOnReconnect`). */
function llamadasDirectorio(): string[] {
  return mockApi.mock.calls
    .map(([endpoint]) => String(endpoint))
    .filter((endpoint) => endpoint.startsWith('/alumnos?'));
}

/** Cambia el chip de estado para forzar otra consulta. */
function cambiarEstadoChip(nombre: string): void {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
}

/** Restaura un archivado: PATCH + `recargar()` de la MISMA clave (con datos en pantalla). */
async function forzarRecargaMismaClave(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
}

describe('AlumnosPage · mis alumnos offline (C8-C10)', () => {
  it('C8 · sin conexión con datos visibles, el error de recarga no pinta AvisoErrorDirectorio', async () => {
    simularConexion(false);
    montar();
    await esperarDirectorio();

    // Recarga de la MISMA clave: restaurar dispara PATCH + recargar con datos en pantalla.
    errorDirectorio = new Error('caído');
    await forzarRecargaMismaClave();

    expect(
      screen.queryByText('Ver expediente de Carlos Mendoza') ??
        screen.queryByRole('button', { name: 'Ver expediente de Carlos Mendoza' }),
    ).toBeTruthy();
    // F2: en offline con datos y error, no hay alert de recarga (solo el aviso offline).
    expect(avisoErrorRecarga()).toBeNull();
  });

  it('C9 · al reconectar desaparece el aviso y la lista sigue visible', async () => {
    simularConexion(false);
    montar();
    await esperarDirectorio();
    const avisosOffline = await screen.findAllByRole('status');
    expect(
      avisosOffline.some((a) => a.textContent?.includes('Sin conexión · datos guardados')),
    ).toBe(true);

    const llamadasAntes = llamadasDirectorio().length;
    act(() => {
      simularConexion(true);
      onlineManager.setOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(
      await screen.findByRole('button', { name: 'Ver expediente de Carlos Mendoza' }),
    ).toBeTruthy();
    expect(screen.queryByText(/Sin conexión · datos guardados/)).toBeNull();
    // Observación: TanStack puede re-pedir la lista al reconectar (refetchOnReconnect).
    // Si no lo hace, la aserción de conteo sigue siendo válida (no decrece).
    const llamadasDespues = llamadasDirectorio().length;
    console.log(`[C9] llamadas /alumnos antes=${llamadasAntes} despues=${llamadasDespues}`);
    expect(llamadasDespues).toBeGreaterThanOrEqual(llamadasAntes);
  });

  it('C10 · con conexión, una recarga que falla sí muestra AvisoErrorDirectorio', async () => {
    simularConexion(true);
    montar();
    await esperarDirectorio();

    errorDirectorio = new Error('caído');
    await forzarRecargaMismaClave();

    expect(avisoErrorRecarga()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver expediente de Carlos Mendoza' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Contratos C1-C7
// ---------------------------------------------------------------------------

describe('AlumnosPage · mis alumnos offline (contrato C)', () => {
  it('C1 · sin conexión con datos: aviso "Sin conexión · datos guardados" y lista visible', async () => {
    simularConexion(false);
    montar();
    await esperarDirectorio();
    // Ajuste autorizado lote 02: `role="status"` no expone nombre accesible desde el
    // contenido, así que se resuelve por rol y se filtra por texto (misma aserción).
    const avisos = await screen.findAllByRole('status');
    const aviso = avisos.find((a) => a.textContent?.includes('Sin conexión · datos guardados'));
    expect(aviso).toBeTruthy();
  });

  it('C2 · con conexión: no hay ningún texto "Sin conexión"', async () => {
    simularConexion(true);
    montar();
    await esperarDirectorio();
    expect(screen.queryByText(/Sin conexión/)).toBeNull();
  });

  it('C3 · modo demo sin conexión: no hay texto "Sin conexión"', async () => {
    sesionMock.isDemoMode = true;
    simularConexion(false);
    montar();
    await screen.findByRole('button', { name: 'Ver expediente de Carlos Alberto Mendoza Silva' });
    expect(screen.queryByText(/Sin conexión/)).toBeNull();
  });

  it('C4 · sin conexión, sin datos: "Sin conexión y sin datos guardados" y sin error genérico', async () => {
    simularConexion(false);
    errorDirectorio = new Error('caído');
    montar();
    expect(await screen.findByText('Sin conexión y sin datos guardados')).toBeTruthy();
    expect(screen.queryByText('No pudimos cargar la información')).toBeNull();
  });

  it('C5 · con conexión y sin datos: se sigue viendo EstadoErrorDirectorio (regresión)', async () => {
    simularConexion(true);
    errorDirectorio = new Error('caído');
    montar();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No pudimos cargar la información');
  });

  it('C6 · el aviso pediría la frescura de la URL real de la consulta', async () => {
    const matchMock = vi.fn(async (..._args: unknown[]) => null);
    Object.defineProperty(window, 'caches', { configurable: true, value: { match: matchMock } });
    simularConexion(false);
    montar();
    await esperarDirectorio();
    expect(matchMock).toHaveBeenCalled();
    const url = String(matchMock.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('/alumnos?');
    expect(url).toContain('orden=alta_reciente');
    expect(url).toContain('limit=');
  });

  it('C7 · el selector sigue accesible por su etiqueta', async () => {
    montar();
    await esperarDirectorio();
    expect(screen.getByLabelText('Ordenar por').tagName).toBe('SELECT');
  });
});
