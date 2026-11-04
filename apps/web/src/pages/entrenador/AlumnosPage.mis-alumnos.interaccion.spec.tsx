// @vitest-environment jsdom
/**
 * Lote "Mis alumnos" (contrato D, prompt `.external-agents/01-mis-alumnos-tests.md`).
 *
 * Specs de interacción de la vista "Mis alumnos" (`AlumnosPage`): título, chips con
 * conteo (sin KPIs), carga inicial en Vigentes, chips, botón Invitar, control de orden,
 * tarjeta con señales (último entreno + racha + alerta), teclado, tabla, skeleton de
 * carga y vacío con filtros.
 *
 * Estado RED (2026-10-19): cada D falla por el comportamiento nuevo que falta (texto,
 * control o parámetro ausente), nunca por importación o configuración. Montaje, mocks y
 * fixtures reutilizados de `AlumnosPage.caracterizacion.interaccion.spec.tsx` (auth-context,
 * api-client parcial, acceso-ui, roster base + `respuestaDirectorio`/`montar`/
 * `esperarDirectorio`).
 *
 * Selectores solo por rol/label/texto accesible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
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
import { copiarAlPortapapeles } from '../../lib/acceso-ui';
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
// Fixtures (mismo roster base que la caracterización)
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

/** ISO UTC del mediodía local de hace `n` días (mediodía = sin dependencia de zona horaria). */
function isoAlMediodiaHaceDias(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** Fecha local `YYYY-MM-DD` de hoy (formato de `rachaUltimaFecha`). */
function fechaLocalHoy(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let directorioActual: DirectorioAlumnosDTO = RESPUESTA_BASE;
let errorDirectorio: Error | null = null;
let retenerDirectorio = false;
const resolversDirectorio: Array<(v: DirectorioAlumnosDTO) => void> = [];
let errorPerfil: Error | null = null;
let responderVacioConQuery = false;
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
  retenerDirectorio = false;
  resolversDirectorio.length = 0;
  errorPerfil = null;
  responderVacioConQuery = false;

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
  mockCopiar.mockReset();
  mockCopiar.mockResolvedValue(true);

  mockApi.mockImplementation((endpoint: string) => {
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
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

// ---------------------------------------------------------------------------
// Contrato D · vista "Mis alumnos"
// ---------------------------------------------------------------------------

describe('AlumnosPage · mis alumnos (contrato D)', () => {
  it('D1 · el h1 es "Mis alumnos"', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Mis alumnos' })).toBeTruthy();
  });

  it('D2 · sin tarjetas KPI: hay chips con conteo Vigentes/Activos/Pausados/En mora/Archivados', async () => {
    montar();
    await esperarDirectorio();
    // Vigentes = total - archivados = 3 - 1.
    const vigentes = screen.getByRole('button', { name: 'Vigentes 2' });
    expect(vigentes.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Activos 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pausados 0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'En mora 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archivados 1' })).toBeTruthy();
    // Las 6 tarjetas KPI desaparecen (eran el filtro anterior).
    expect(screen.queryByRole('button', { name: /Total Cartera/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Presenciales/ })).toBeNull();
  });

  it('D3 · carga inicial: "Vigentes" pulsado y la primera petición no filtra archivados', async () => {
    montar();
    await esperarDirectorio();
    expect(
      screen.getByRole('button', { name: 'Vigentes 2' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(llamadasDirectorio()[0]).not.toContain('incluirArchivados');
    expect(llamadasDirectorio()[0]).not.toContain('soloArchivados');
  });

  it('D4 · pulsar "Archivados" envía soloArchivados=true y vuelve a página 1; repulsar vuelve a "Vigentes"', async () => {
    directorioActual = respuestaDirectorio([ALUMNO_ACTIVO, ALUMNO_MORA], 30, {
      ...RESUMEN_BASE,
      total: 30,
    });
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('offset=25'), {
      timeout: 4000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archivados 1' }));
    await waitFor(
      () => {
        expect(ultimaLlamadaDirectorio()).toContain('soloArchivados=true');
        expect(ultimaLlamadaDirectorio()).toContain('offset=0');
      },
      { timeout: 4000 },
    );

    // Repulsar el chip activo vuelve a "Vigentes" (sin filtros de archivado).
    // D4: la respuesta trae total 30 con 1 archivado → Vigentes = 30 − 1 = 29.
    fireEvent.click(screen.getByRole('button', { name: 'Archivados 1' }));
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Vigentes 29' }).getAttribute('aria-pressed'),
        ).toBe('true');
        expect(ultimaLlamadaDirectorio()).not.toContain('soloArchivados');
      },
      { timeout: 2500 },
    );
  });

  it('D5 · "Invitar" abre un diálogo con el enlace de captación y botón para copiarlo', async () => {
    montar();
    await esperarDirectorio();
    // El enlace de captación no se ve hasta pulsar "Invitar".
    expect(screen.queryByText('Tu enlace de registro para alumnos')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.textContent).toContain('/onboarding?coach=COACH123');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar enlace' }));
    expect(mockCopiar).toHaveBeenCalledWith(
      `${window.location.origin}/onboarding?coach=COACH123`,
    );
  });

  it('D17 · al abrir el modal "Invitar" se vuelve a consultar /entrenador/perfil para refrescar captación', async () => {
    montar();
    await esperarDirectorio();

    const llamadasPerfilIniciales = mockApi.mock.calls.filter(
      (c) => c[0] === '/entrenador/perfil',
    ).length;
    expect(llamadasPerfilIniciales).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
    await screen.findByRole('dialog');

    await waitFor(() => {
      const llamadasPerfil = mockApi.mock.calls.filter(
        (c) => c[0] === '/entrenador/perfil',
      ).length;
      expect(llamadasPerfil).toBe(2);
    });
  });

  it('D6 · control "Ordenar por": default alta reciente; cambiar envía orden=<valor> y vuelve a página 1', async () => {
    directorioActual = respuestaDirectorio([ALUMNO_ACTIVO, ALUMNO_MORA], 30, {
      ...RESUMEN_BASE,
      total: 30,
    });
    montar();
    await esperarDirectorio();
    const orden = screen.getByLabelText('Ordenar por') as HTMLSelectElement;
    expect(orden.value).toBe('alta_reciente');
    expect(within(orden).getByRole('option', { name: 'Alta más reciente' })).toBeTruthy();
    expect(within(orden).getByRole('option', { name: 'Nombre (A-Z)' })).toBeTruthy();
    expect(within(orden).getByRole('option', { name: 'Sin entrenar primero' })).toBeTruthy();
    expect(within(orden).getByRole('option', { name: 'Mayor racha' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(ultimaLlamadaDirectorio()).toContain('offset=25'), {
      timeout: 4000,
    });

    fireEvent.change(orden, { target: { value: 'mayor_racha' } });
    await waitFor(
      () => {
        expect(ultimaLlamadaDirectorio()).toContain('orden=mayor_racha');
        expect(ultimaLlamadaDirectorio()).toContain('offset=0');
      },
      { timeout: 4000 },
    );
  });

  it('D7 · la tarjeta muestra estado, modalidad de dominio, último entreno, racha y alerta con icono', async () => {
    const alumnoHoy: AlumnoDirectorioItemDTO = {
      ...ALUMNO_ACTIVO,
      ultimaSesionFecha: isoAlMediodiaHaceDias(0),
      rachaDias: 5,
      rachaUltimaFecha: fechaLocalHoy(),
    };
    const alumnoAlerta: AlumnoDirectorioItemDTO = {
      ...ALUMNO_MORA,
      ultimaSesionFecha: isoAlMediodiaHaceDias(10),
      rachaDias: 0,
      rachaUltimaFecha: null,
    };
    const alumnoSinEntrenos: AlumnoDirectorioItemDTO = {
      ...ALUMNO_ACTIVO,
      id: 'al-009',
      usuarioId: 'u-009',
      nombres: 'Luis',
      apellidos: 'Pérez',
      email: 'luis.perez@email.com',
      estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
      ultimaSesionFecha: null,
      rachaUltimaFecha: null,
    };
    directorioActual = respuestaDirectorio([alumnoHoy, alumnoAlerta, alumnoSinEntrenos], 3);
    montar();
    await esperarDirectorio();

    // Estado de activación con texto.
    // F6 (stretched link): el botón "Ver expediente de X" solo contiene el nombre;
    // el resto de señales vive en el <article> que lo envuelve.
    function tarjetaDe(nombre: string): HTMLElement {
      const boton = screen.getByRole('button', { name: `Ver expediente de ${nombre}` });
      const tarjeta = boton.closest('article');
      if (!tarjeta) throw new Error(`La tarjeta de ${nombre} no es un <article>.`);
      return tarjeta as HTMLElement;
    }
    const tarjetaHoy = tarjetaDe('Carlos Mendoza');
    const tarjetaAlerta = tarjetaDe('Valeria Silva');
    const tarjetaSin = tarjetaDe('Luis Pérez');

    // Estado de activación con texto.
    expect(within(tarjetaHoy).getByText('Activo')).toBeTruthy();
    expect(within(tarjetaSin).getByText('Pausado')).toBeTruthy();
    // Modalidad con etiqueta de dominio, nunca el valor crudo.
    expect(within(tarjetaHoy).getByText('Presencial')).toBeTruthy();
    expect(within(tarjetaAlerta).getByText('Remoto')).toBeTruthy();
    expect(within(tarjetaHoy).queryByText('presencial')).toBeNull();
    // Último entreno.
    expect(within(tarjetaHoy).getByText('Entrenó hoy')).toBeTruthy();
    expect(within(tarjetaSin).getByText('Sin entrenos registrados')).toBeTruthy();
    // Racha (0 / undefined no pinta nada).
    expect(within(tarjetaHoy).getByText('Racha de 5 días')).toBeTruthy();
    expect(within(tarjetaAlerta).queryByText(/Racha de/)).toBeNull();
    // Alerta a 10 días: icono no-solo-color (aria-hidden) + texto.
    const aviso = within(tarjetaAlerta).getByText('Sin entrenar hace 10 días');
    expect(aviso.parentElement?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('D8 · teclado: Enter/Espacio en WhatsApp o Restaurar no navega; click en "Ver expediente" sí', async () => {
    // F6 (stretched link): el contenedor es un <article> sin rol ni onKeyDown;
    // WhatsApp y "Restaurar" son hermanos del botón "Ver expediente de X" (`z-10`).
    montar();
    await esperarDirectorio();
    const boton = screen.getByRole('button', {
      name: 'Ver expediente de Carlos Mendoza',
    });
    const tarjeta = boton.closest('article');
    if (!tarjeta) throw new Error('La tarjeta del alumno no es un <article>.');
    expect(tarjeta.getAttribute('role')).toBeNull();
    const whatsapp = within(tarjeta).getByRole('link', {
      name: 'Enviar mensaje de WhatsApp a Carlos',
    });
    expect(boton.contains(whatsapp)).toBe(false);
    fireEvent.keyDown(whatsapp, { key: 'Enter', bubbles: true });
    fireEvent.keyDown(whatsapp, { key: ' ', bubbles: true });
    expect(screen.queryByText('Expediente al-001')).toBeNull();

    const restaurar = screen.getByRole('button', {
      name: 'Restaurar alumno Roberto Diaz',
    });
    fireEvent.keyDown(restaurar, { key: 'Enter', bubbles: true });
    fireEvent.keyDown(restaurar, { key: ' ', bubbles: true });
    expect(screen.queryByText('Expediente al-003')).toBeNull();

    // keyDown sobre el contenedor ya no reacciona (sin onKeyDown ni tabIndex).
    fireEvent.keyDown(tarjeta, { key: 'Enter' });
    expect(screen.queryByText('Expediente al-001')).toBeNull();

    // Click (o Enter nativo) en el botón "Ver expediente de X" navega.
    fireEvent.click(boton);
    expect(await screen.findByText('Expediente al-001')).toBeTruthy();
  });

  it('D9 · tabla con las 8 cabeceras y nombre enfocable que lleva al expediente con Enter', async () => {
    montar();
    await esperarDirectorio();
    fireEvent.click(screen.getByRole('button', { name: 'Vista en tabla' }));
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

    const nombre = screen.getByText('Carlos Mendoza').closest('a,button');
    expect(nombre).toBeTruthy();
    if (!nombre) throw new Error('El nombre del alumno no es un elemento enfocable.');
    (nombre as HTMLElement).focus();
    fireEvent.keyDown(nombre as HTMLElement, { key: 'Enter', bubbles: true });
    expect(await screen.findByText('Expediente al-001')).toBeTruthy();
  });

  it('D10 · mientras carga hay skeleton "Cargando alumnos" y los chips no muestran "0"', async () => {
    retenerDirectorio = true;
    montar();
    expect(await screen.findByRole('status', { name: 'Cargando alumnos' })).toBeTruthy();
    // Sin resumen todavía: ningún chip muestra "0" como conteo.
    expect(screen.queryByRole('button', { name: /0/ })).toBeNull();
    await act(async () => {
      resolversDirectorio.forEach((resolver) => resolver(RESPUESTA_BASE));
    });
    await esperarDirectorio();
  });

  it('D11 · vacío con filtros: mensaje + "Limpiar filtros" que restaura Vigentes/Todas sin tocar el orden', async () => {
    responderVacioConQuery = true;
    montar();
    await esperarDirectorio();
    fireEvent.change(screen.getByLabelText('Buscar alumnos'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
    expect(
      screen.getByText('Ningún alumno coincide con la búsqueda o los filtros aplicados.'),
    ).toBeTruthy();

    const llamadasAntes = llamadasDirectorio().length;
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await esperarDirectorio();
    expect((screen.getByLabelText('Buscar alumnos') as HTMLInputElement).value).toBe('');
    expect(
      screen.getByRole('button', { name: 'Vigentes 2' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Todas' })).toBeTruthy();
    expect((screen.getByLabelText('Ordenar por') as HTMLSelectElement).value).toBe(
      'alta_reciente',
    );
    await waitFor(() => expect(llamadasDirectorio().length).toBeGreaterThan(llamadasAntes), {
      timeout: 4000,
    });
    expect(ultimaLlamadaDirectorio()).not.toContain('q=');
  });
});
