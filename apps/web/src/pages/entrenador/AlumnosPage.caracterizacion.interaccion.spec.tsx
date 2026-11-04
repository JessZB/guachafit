// @vitest-environment jsdom
/**
 * Prompt 49 (fase B0) · tests de caracterización del directorio de alumnos (`AlumnosPage`).
 *
 * Fijan el comportamiento ACTUAL de la vista sobre el código vigente (base `df33d9c`):
 * describen lo que hay, no lo que debería haber. Si un comportamiento parece un bug, se
 * caracteriza tal cual y se reporta como WARNING en
 * `.opencode-prompts/reportes/alumnos/49-alumnos-tests.reporte.md` (nunca se corrige aquí).
 *
 * Montaje (copiado de `CarteraPage.cobro.interaccion.spec.tsx`, que también usa
 * `usePaginacionServidor` → TanStack Query): `QueryClientProvider` de test por caso,
 * `MemoryRouter` con ruta de expediente para verificar navegación, `api-client` parcialmente
 * mockeado (callable + `patch`) y `useAuth` mockeado con bandera demo conmutable.
 *
 * Selectores solo por rol/label/texto accesible (R5: deben sobrevivir al refactor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type AltaManualAlumnoResultadoDTO,
  type DirectorioAlumnosDTO,
  type AlumnoDirectorioItemDTO,
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
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../lib/acceso-ui';
import { AlumnosPage } from './AlumnosPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};
const mockCopiar = copiarAlPortapapeles as unknown as MockFn;

// ---------------------------------------------------------------------------
// Fixtures
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
  // D6: sin plan real se muestra "Sin plan asignado", nunca un nombre inventado.
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

const RESUMEN_CERO: ResumenDirectorioAlumnosDTO = {
  total: 0,
  activos: 0,
  pausados: 0,
  morosos: 0,
  presenciales: 0,
  remotos: 0,
  archivados: 0,
};
const RESPUESTA_VACIA = respuestaDirectorio([], 0, RESUMEN_CERO);

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

const ALTA_OK: AltaManualAlumnoResultadoDTO = {
  id: 'al-100',
  nombres: 'Carlos',
  apellidos: 'Mendoza',
  email: 'carlos@email.com',
  edadCalculada: 28,
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  tokenInvitacion: 'tok-123',
  correoEnviado: true,
  mensaje: 'Alumno registrado.',
};

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let directorioActual: DirectorioAlumnosDTO = RESPUESTA_BASE;
let errorDirectorio: Error | null = null;
let retenerDirectorio = false;
const resolversDirectorio: Array<(v: DirectorioAlumnosDTO) => void> = [];
let errorPerfil: Error | null = null;
let responderVacioConQuery = false;
let resultadoAlta: AltaManualAlumnoResultadoDTO | Error | null = null;
let altaRetenida: Promise<AltaManualAlumnoResultadoDTO> | null = null;
let errorRestaurar: Error | null = null;
const clientesConsulta: QueryClient[] = [];

function llamadasDirectorio(): string[] {
  return mockApi.mock.calls
    .map(([endpoint]) => String(endpoint))
    .filter((endpoint) => endpoint.startsWith('/alumnos?'));
}

function ultimaLlamadaDirectorio(): string {
  const llamadas = llamadasDirectorio();
  if (llamadas.length === 0) throw new Error('No se llamó a GET /alumnos?...');
  return llamadas[llamadas.length - 1];
}

function llamadaAlta(): { endpoint: string; cuerpo: Record<string, unknown> } {
  const llamada = mockApi.mock.calls.find(([endpoint]) => endpoint === '/alumnos/manual');
  if (!llamada) throw new Error('No se llamó a POST /alumnos/manual.');
  return { endpoint: String(llamada[0]), cuerpo: JSON.parse((llamada[1] as { body: string }).body) };
}

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

function abrirModal(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Inscribir Manual' }));
}

/** Envía el formulario del modal sin pasar por la validación nativa del navegador
 * (jsdom bloquearía el click en submit por `required`/`max` y nunca llegaría al
 * handler de React; lo que se caracteriza aquí es la validación propia de la vista). */
function enviarFormularioAlta(): void {
  const dialogo = screen.getByRole('dialog');
  const formulario = dialogo.querySelector('form');
  if (!formulario) throw new Error('El diálogo no contiene el formulario de alta.');
  fireEvent.submit(formulario);
}

/** Rellena el formulario de alta con datos válidos (deja ficha médica configurable). */
function rellenarAltaValida(ficha = 'Asma leve'): void {
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Carlos' } });
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Mendoza' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'carlos@email.com' },
  });
  fireEvent.change(screen.getByLabelText('Número de documento'), {
    target: { value: '24123456' },
  });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: '1998-05-14' },
  });
  fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '4121234567' } });
  fireEvent.change(screen.getByLabelText('Ficha médica confidencial (se guarda cifrada)'), {
    target: { value: ficha },
  });
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  directorioActual = RESPUESTA_BASE;
  errorDirectorio = null;
  retenerDirectorio = false;
  resolversDirectorio.length = 0;
  errorPerfil = null;
  responderVacioConQuery = false;
  resultadoAlta = null;
  altaRetenida = null;
  errorRestaurar = null;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
  mockCopiar.mockReset();
  mockCopiar.mockResolvedValue(true);

  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (endpoint === '/entrenador/perfil') {
      if (errorPerfil) return Promise.reject(errorPerfil);
      return Promise.resolve(PERFIL_COACH);
    }
    if (typeof endpoint === 'string' && endpoint.startsWith('/alumnos?')) {
      if (errorDirectorio) return Promise.reject(errorDirectorio);
      if (retenerDirectorio) {
        return new Promise<DirectorioAlumnosDTO>((resolver) => {
          resolversDirectorio.push(resolver);
        });
      }
      if (responderVacioConQuery && endpoint.includes('q=')) {
        return Promise.resolve(RESPUESTA_VACIA);
      }
      return Promise.resolve(directorioActual);
    }
    if (endpoint === '/alumnos/manual' && opciones?.method === 'POST') {
      if (altaRetenida) return altaRetenida;
      if (resultadoAlta instanceof Error) return Promise.reject(resultadoAlta);
      if (resultadoAlta) return Promise.resolve(resultadoAlta);
      return Promise.resolve(ALTA_OK);
    }
    return Promise.resolve(null);
  });
  mockApi.patch.mockImplementation((endpoint: string) => {
    if (String(endpoint).endsWith('/restaurar')) {
      if (errorRestaurar) return Promise.reject(errorRestaurar);
      return Promise.resolve({});
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
// 1. Cabecera y KPIs
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: cabecera y KPIs', () => {
  it('C1 · renderiza el h1 "Mis alumnos" y los chips de estado con los conteos del resumen', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Mis alumnos' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Total Cartera/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Vigentes 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activos 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausados 0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En mora 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archivados 1' })).toBeTruthy();
  });

  it('C2 · el chip "En mora" filtra por semáforo moroso en el servidor', async () => {
    montar();
    await esperarDirectorio();
    const antes = llamadasDirectorio().length;
    fireEvent.click(screen.getByRole('button', { name: 'En mora 1' }));
    await waitFor(
      () => {
        expect(llamadasDirectorio().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaDirectorio()).toContain('semaforoPago=moroso');
      },
      { timeout: 4000 },
    );
  });

  it('C3 · el chip "Vigentes" pide solo vigentes, sin archivados en la petición', async () => {
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'En mora 1' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('semaforoPago=moroso'), {
      timeout: 4000,
    });
    const antes = llamadasDirectorio().length;
    fireEvent.click(screen.getByRole('button', { name: 'Vigentes 2' }));
    await waitFor(
      () => {
        expect(llamadasDirectorio().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaDirectorio()).not.toContain('incluirArchivados');
        expect(ultimaLlamadaDirectorio()).not.toContain('soloArchivados');
      },
      { timeout: 4000 },
    );
  });

  it('C4 · la carga inicial pide "Vigentes" sin archivados (ni incluir ni solo)', async () => {
    montar();
    await esperarDirectorio();
    expect(llamadasDirectorio()[0]).not.toContain('incluirArchivados');
    expect(llamadasDirectorio()[0]).not.toContain('soloArchivados');
    expect(llamadasDirectorio()[0]).toContain('limit=25');
    expect(llamadasDirectorio()[0]).toContain('offset=0');
    expect(
      screen.getByRole('button', { name: 'Vigentes 2' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 2. Toggle de vista, filtros y búsqueda
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: vista, filtros y búsqueda', () => {
  it('C5 · arranca en tarjetas y el toggle cambia a tabla con sus 8 columnas', async () => {
    montar();
    await esperarDirectorio();
    const aTarjetas = screen.getByRole('button', { name: 'Vista en tarjetas' });
    const aTabla = screen.getByRole('button', { name: 'Vista en tabla' });
    expect(aTarjetas.getAttribute('aria-pressed')).toBe('true');
    expect(aTabla.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(aTabla);
    expect(aTabla.getAttribute('aria-pressed')).toBe('true');
    const encabezados = await screen.findAllByRole('columnheader');
    expect(encabezados.map((th) => th.textContent)).toEqual([
      'Alumno',
      'Estado',
      'Modalidad',
      'Plan',
      'Último entreno',
      'Racha',
      'Pago',
      'Acciones',
    ]);
    // La tabla también expone "Ver expediente …", pero ya no hay tarjetas: el enlace
    // de WhatsApp de tarjeta (con nombre "Enviar mensaje …") desaparece.
    expect(
      screen.queryByRole('link', { name: 'Enviar mensaje de WhatsApp a Carlos' }),
    ).toBeNull();
  });

  it('C6 · los chips de estado viajan al servidor (activo / archivados / vigentes)', async () => {
    montar();
    await esperarDirectorio();

    fireEvent.click(screen.getByRole('button', { name: 'Activos 2' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('estado=activo'), {
      timeout: 4000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archivados 1' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('soloArchivados=true'), {
      timeout: 4000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Vigentes 2' }));
    await waitFor(
      () => {
        expect(ultimaLlamadaDirectorio()).not.toContain('incluirArchivados');
        expect(ultimaLlamadaDirectorio()).not.toContain('soloArchivados');
      },
      { timeout: 4000 },
    );
  });

  it('C7 · el selector de modalidad viaja al servidor y "Todas" no envía modalidad', async () => {
    montar();
    await esperarDirectorio();

    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('modalidad=presencial'), {
      timeout: 4000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remoto' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('modalidad=remoto'), {
      timeout: 4000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await waitFor(
      () => expect(ultimaLlamadaDirectorio()).not.toContain('modalidad='),
      { timeout: 4000 },
    );
  });

  it('C8 · la búsqueda viaja con debounce como parámetro q', async () => {
    montar();
    await esperarDirectorio();
    const antes = llamadasDirectorio().length;
    fireEvent.change(screen.getByLabelText('Buscar alumnos'), {
      target: { value: 'valeria' },
    });
    // Antes del debounce (300 ms) no hay petición nueva.
    expect(llamadasDirectorio().length).toBe(antes);
    await waitFor(
      () => {
        expect(llamadasDirectorio().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaDirectorio()).toContain('q=valeria');
      },
      { timeout: 4000 },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Carga, vacío, error y paginación
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: carga, vacío, error y paginación', () => {
  it('C9 · mientras carga muestra el skeleton y no muestra ni lista ni vacío ni error', async () => {
    retenerDirectorio = true;
    montar();
    expect(await screen.findByRole('heading', { name: 'Mis alumnos' })).toBeTruthy();
    expect(await screen.findByRole('status', { name: 'Cargando alumnos' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Ver expediente de Carlos Mendoza' }),
    ).toBeNull();
    expect(screen.queryByText('Sin resultados')).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
    await act(async () => {
      resolversDirectorio.forEach((resolver) => resolver(RESPUESTA_BASE));
    });
    await esperarDirectorio();
  });

  it('C10 · cartera vacía sin filtros: mensaje de cartera vacía y sin paginación', async () => {
    directorioActual = RESPUESTA_VACIA;
    montar();
    expect(
      await screen.findByText(/Todavía no hay alumnos en tu cartera/),
    ).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  it('C11 · vacío con búsqueda: "Sin resultados" y "Limpiar filtros" restaura la lista', async () => {
    responderVacioConQuery = true;
    montar();
    await esperarDirectorio();
    fireEvent.change(screen.getByLabelText('Buscar alumnos'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
    expect(
      screen.getByText('Ningún alumno coincide con la búsqueda o los filtros aplicados.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await esperarDirectorio();
    expect((screen.getByLabelText('Buscar alumnos') as HTMLInputElement).value).toBe('');
  });

  it('C12 · error de carga con reintento que recupera la lista', async () => {
    errorDirectorio = new Error('Fallo de red simulado');
    montar();
    expect(await screen.findByText('Fallo de red simulado')).toBeTruthy();

    errorDirectorio = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await esperarDirectorio();
  });

  it('C13 · con total > 0 muestra la paginación y avanzar pide el siguiente offset', async () => {
    directorioActual = respuestaDirectorio([ALUMNO_ACTIVO, ALUMNO_MORA], 30, {
      ...RESUMEN_BASE,
      total: 30,
    });
    montar();
    await esperarDirectorio();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
    const antes = llamadasDirectorio().length;
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(
      () => {
        expect(llamadasDirectorio().length).toBeGreaterThan(antes);
        expect(ultimaLlamadaDirectorio()).toContain('offset=25');
      },
      { timeout: 4000 },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Tarjetas y tabla
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: tarjetas y tabla', () => {
  it('C14 · la tarjeta muestra plan, semáforo y navega al expediente con click', async () => {
    montar();
    await esperarDirectorio();
    expect(screen.getByText('Presencial Completo')).toBeTruthy();
    // D6: sin plan real, texto honesto.
    expect(screen.getByText('Sin plan asignado')).toBeTruthy();
    // Semáforo moroso se rotula "Cuota pendiente" (nunca crudo).
    expect(screen.getAllByText('Cuota pendiente').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ver expediente de Carlos Mendoza' }));
    expect(await screen.findByText('Expediente al-001')).toBeTruthy();
  });

  it('C15 · click en "Ver expediente" navega; keyDown sobre el contenedor no reacciona', async () => {
    // F6 (stretched link): el contenedor es un <article> sin rol ni tabIndex ni
    // onKeyDown; el nombre es un <button> "Ver expediente de X" que navega con
    // click (o Enter nativo). `fireEvent.keyDown` no dispara click en jsdom.
    montar();
    await esperarDirectorio();
    const boton = screen.getByRole('button', { name: 'Ver expediente de Carlos Mendoza' });
    const tarjeta = boton.closest('article');
    if (!tarjeta) throw new Error('La tarjeta del alumno no es un <article>.');
    expect(tarjeta.getAttribute('role')).toBeNull();
    expect(tarjeta.getAttribute('tabindex')).toBeNull();
    fireEvent.keyDown(tarjeta, { key: 'Enter' });
    expect(screen.queryByText('Expediente al-001')).toBeNull();

    fireEvent.click(boton);
    expect(await screen.findByText('Expediente al-001')).toBeTruthy();
  });

  it('C16 · la tarjeta expone el WhatsApp con enlace wa.me', async () => {
    montar();
    await esperarDirectorio();
    const enlace = screen.getByRole('link', { name: 'Enviar mensaje de WhatsApp a Carlos' });
    expect(enlace.getAttribute('href')).toContain('https://wa.me/584121234567');
  });

  it('C17 · restaurar un archivado llama al PATCH y recarga sin navegar', async () => {
    montar();
    await esperarDirectorio();
    const antes = llamadasDirectorio().length;
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/alumnos/al-003/restaurar', {}), {
      timeout: 4000,
    });
    await waitFor(() => expect(llamadasDirectorio().length).toBeGreaterThan(antes), {
      timeout: 4000,
    });
    expect(screen.queryByText(/Expediente/)).toBeNull();
  });

  it('C18 · si el PATCH de restaurar falla, el error queda visible (role=alert)', async () => {
    errorRestaurar = new Error('No se pudo restaurar al alumno. Inténtalo de nuevo.');
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' }));
    expect(
      await screen.findByText('No se pudo restaurar al alumno. Inténtalo de nuevo.'),
    ).toBeTruthy();
  });

  it('C19 · Enter/Espacio en "Restaurar" o WhatsApp no navega; ningún botón anida controles', async () => {
    // F6 (stretched link): WhatsApp y "Restaurar" son hermanos del botón "Ver
    // expediente de X" por encima del enlace extendido (`z-10`); ya no hay
    // `onKeyDown` en el contenedor que filtrar por `target`.
    montar();
    await esperarDirectorio();
    const boton = screen.getByRole('button', { name: 'Ver expediente de Roberto Diaz' });
    const tarjeta = boton.closest('article');
    if (!tarjeta) throw new Error('La tarjeta del alumno no es un <article>.');
    const restaurar = within(tarjeta).getByRole('button', {
      name: 'Restaurar alumno Roberto Diaz',
    });
    expect(boton.contains(restaurar)).toBe(false);
    const whatsapp = within(tarjeta).getByRole('link', {
      name: 'Enviar mensaje de WhatsApp a Roberto',
    });
    expect(boton.contains(whatsapp)).toBe(false);
    // Ningún botón de la tarjeta anida controles interactivos.
    for (const control of within(tarjeta).getAllByRole('button')) {
      expect(within(control).queryByRole('button')).toBeNull();
      expect(within(control).queryByRole('link')).toBeNull();
    }

    restaurar.focus();
    fireEvent.keyDown(restaurar, { key: 'Enter', bubbles: true });
    fireEvent.keyDown(restaurar, { key: ' ', bubbles: true });
    whatsapp.focus();
    fireEvent.keyDown(whatsapp, { key: 'Enter', bubbles: true });
    fireEvent.keyDown(whatsapp, { key: ' ', bubbles: true });
    expect(screen.queryByText('Expediente al-003')).toBeNull();
  });

  it('C20 · la tabla navega por fila y por "Ver expediente", con WhatsApp y badge Archivado', async () => {
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Vista en tabla' }));
    await screen.findByText('carlos.mendoza@email.com');

    expect(screen.getByText('Archivado')).toBeTruthy();
    const whatsapp = screen.getByRole('link', { name: 'Contactar por WhatsApp a Carlos' });
    expect(whatsapp.getAttribute('href')).toContain('https://wa.me/584121234567');

    fireEvent.click(screen.getByRole('button', { name: 'Ver expediente de Valeria Silva' }));
    expect(await screen.findByText('Expediente al-002')).toBeTruthy();
  });

  it('C21 · restaurar desde la tabla llama al mismo PATCH', async () => {
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Vista en tabla' }));
    await screen.findByText('carlos.mendoza@email.com');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' }));
    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/alumnos/al-003/restaurar', {}), {
      timeout: 4000,
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Modal de inscripción manual
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: modal de inscripción manual', () => {
  it('C22 · "Inscribir Manual" abre el diálogo accesible con el formulario', async () => {
    montar();
    await esperarDirectorio();
    abrirModal();
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.getAttribute('aria-labelledby')).toBe('modal-inscripcion-title');
    expect(screen.getByText('Inscripción Manual en Sala')).toBeTruthy();
    expect(screen.getByLabelText('Nombres')).toBeTruthy();
    expect(screen.getByLabelText('WhatsApp')).toBeTruthy();
  });

  it('C23 · sin WhatsApp no hay POST y el error de validación es visible', async () => {
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Carlos' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Mendoza' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'carlos@email.com' },
    });
    fireEvent.change(screen.getByLabelText('Número de documento'), {
      target: { value: '24123456' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '1998-05-14' },
    });
    enviarFormularioAlta();
    expect(await screen.findByText('Escribe tu número de WhatsApp.')).toBeTruthy();
    expect(mockApi.mock.calls.some(([endpoint]) => endpoint === '/alumnos/manual')).toBe(false);
  });

  it('C24 · fecha futura no hay POST y avisa con el mensaje de validación', async () => {
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '2999-01-01' },
    });
    enviarFormularioAlta();
    expect(
      await screen.findByText('La fecha de nacimiento no puede ser futura.'),
    ).toBeTruthy();
    expect(mockApi.mock.calls.some(([endpoint]) => endpoint === '/alumnos/manual')).toBe(false);
  });

  it('C25 · alta OK: POST con el payload actual, pantalla de éxito y recarga', async () => {
    resultadoAlta = ALTA_OK;
    montar();
    await esperarDirectorio();
    const getsAntes = llamadasDirectorio().length;
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));

    expect(await screen.findByText('Carlos Mendoza fue registrado en tu cartera.')).toBeTruthy();
    const { cuerpo } = llamadaAlta();
    expect(cuerpo).toEqual({
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@email.com',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      modalidad: Modalidad.PRESENCIAL,
      fichaSaludPrivada: 'Asma leve',
    });
    const enlace = screen.getByLabelText(/Enlace para crear su contraseña/) as HTMLInputElement;
    expect(enlace.value).toBe(`${window.location.origin}/activar?token=tok-123`);
    // El alta vive en el servidor: vuelve a página 1 y recarga la fuente de verdad.
    await waitFor(() => expect(llamadasDirectorio().length).toBeGreaterThan(getsAntes), {
      timeout: 4000,
    });
  });

  it('C26 · durante el envío el botón muestra progreso y se deshabilita', async () => {
    let resolverAlta!: (v: AltaManualAlumnoResultadoDTO) => void;
    altaRetenida = new Promise<AltaManualAlumnoResultadoDTO>((resolver) => {
      resolverAlta = resolver;
    });
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));
    const boton = await screen.findByRole('button', { name: 'Inscribiendo alumno...' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      resolverAlta(ALTA_OK);
    });
    expect(await screen.findByText('Carlos Mendoza fue registrado en tu cartera.')).toBeTruthy();
  });

  it('C27 · si el POST falla, el error queda en el diálogo y no hay éxito fantasma', async () => {
    resultadoAlta = new Error('El correo ya está registrado.');
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));
    expect(await screen.findByText('El correo ya está registrado.')).toBeTruthy();
    expect(screen.queryByText(/fue registrado en tu cartera/)).toBeNull();
  });

  it('C28 · "Copiar enlace" de activación confirma y el fallo avisa para copiar a mano', async () => {
    resultadoAlta = ALTA_OK;
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));
    await screen.findByText('Carlos Mendoza fue registrado en tu cartera.');

    // El banner de captación también tiene un "Copiar enlace": se acota al diálogo.
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar enlace' }));
    expect(await within(dialogo).findByRole('button', { name: '¡Copiado!' })).toBeTruthy();
    expect(mockCopiar).toHaveBeenCalledWith(
      `${window.location.origin}/activar?token=tok-123`,
    );
  });

  it('C29 · si la copia del enlace falla, el aviso de copiar a mano es visible', async () => {
    mockCopiar.mockResolvedValue(false);
    resultadoAlta = ALTA_OK;
    montar();
    await esperarDirectorio();
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));
    await screen.findByText('Carlos Mendoza fue registrado en tu cartera.');
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar enlace' }));
    expect(await within(dialogo).findByText(MENSAJE_COPIA_FALLIDA)).toBeTruthy();
  });

  it('C30 · cierre limpio: Cerrar, Escape y backdrop cierran; "Listo" vuelve al formulario', async () => {
    resultadoAlta = ALTA_OK;
    montar();
    await esperarDirectorio();

    abrirModal();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    abrirModal();
    const dialogo = await screen.findByRole('dialog');
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    abrirModal();
    const dialogo2 = await screen.findByRole('dialog');
    const fondo = dialogo2.parentElement;
    if (!fondo) throw new Error('El diálogo no tiene contenedor de fondo.');
    fireEvent.click(fondo);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Éxito → "Listo" cierra y reabrir muestra el formulario limpio (sin enlace previo).
    abrirModal();
    await screen.findByRole('dialog');
    rellenarAltaValida();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir Alumno' }));
    await screen.findByText('Carlos Mendoza fue registrado en tu cartera.');
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    abrirModal();
    await screen.findByRole('dialog');
    expect(screen.getByLabelText('Nombres')).toBeTruthy();
    expect(screen.queryByText(/fue registrado en tu cartera/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Banner de captación y modo demo
// ---------------------------------------------------------------------------

describe('AlumnosPage · caracterización: captación y modo demo', () => {
  it('C31 · "Invitar" abre el diálogo de captación con el enlace y permite copiarlo', async () => {
    montar();
    await esperarDirectorio();
    expect(screen.queryByText('Tu enlace de registro para alumnos')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('COACH123');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar enlace' }));
    expect(mockCopiar).toHaveBeenCalledWith(
      `${window.location.origin}/onboarding?coach=COACH123`,
    );
  });

  it('C32 · si la copia del enlace de invitación falla, el aviso es visible', async () => {
    mockCopiar.mockResolvedValue(false);
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar enlace' }));
    expect(await within(dialogo).findByText(MENSAJE_COPIA_FALLIDA)).toBeTruthy();
  });

  it('C33 · si el perfil no carga, el diálogo de invitación lo dice y deshabilita la copia', async () => {
    errorPerfil = new Error('caído');
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      await within(dialogo).findByText(
        'No se pudo cargar tu enlace de captación. Recarga la página.',
      ),
    ).toBeTruthy();
    expect(
      (within(dialogo).getByRole('button', { name: 'Copiar enlace' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('C34 · en demo no consulta la API y usa el roster local; la captación vive en "Invitar"', async () => {
    sesionMock.isDemoMode = true;
    montar();
    await screen.findByRole('button', { name: 'Ver expediente de Carlos Alberto Mendoza Silva' });
    expect(
      mockApi.mock.calls.some(([endpoint]) => String(endpoint) === '/entrenador/perfil'),
    ).toBe(false);
    expect(
      mockApi.mock.calls.some(([endpoint]) => String(endpoint).startsWith('/alumnos?')),
    ).toBe(false);

    // Misma semántica de filtros sobre el roster local, con los chips nuevos "En mora N".
    const morososDemo = screen.getByRole('button', { name: /En mora \d+/ });
    fireEvent.click(morososDemo);
    await waitFor(
      () =>
        expect(
          screen.queryByRole('button', {
            name: 'Ver expediente de Carlos Alberto Mendoza Silva',
          }),
        ).toBeNull(),
      { timeout: 4000 },
    );
    expect(
      screen.getByRole('button', { name: 'Ver expediente de Roberto Díaz Navarro' }),
    ).toBeTruthy();

    // La captación ya no está en la vista: vive en el diálogo "Invitar".
    expect(screen.queryByText(/En la demo no se muestra tu código real/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      await within(dialogo).findByText(/En la demo no se muestra tu código real/),
    ).toBeTruthy();
  });
});
