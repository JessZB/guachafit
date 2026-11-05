// @vitest-environment happy-dom
/**
 * Prompt 81 (Ola 3, módulo `admin`) · tests de caracterización de `AdminPage`.
 *
 * Fijan el comportamiento ACTUAL de la vista sobre el código vigente (base `0660780`):
 * describen lo que hay, no lo que debería haber. Si un comportamiento parece un bug, se
 * caracteriza tal cual y se reporta como WARNING en
 * `.opencode-prompts/reportes/admin/81-admin-validacion.reporte.md` (nunca se corrige aquí).
 *
 * Montaje: `QueryClientProvider` de test por caso —la página usa TanStack Query vía
 * `usePaginacionServidor` (R9: se conserva el mecanismo)— + `MemoryRouter` +
 * `apiClient` parcialmente mockeado (`get`/`post`/`patch`) + `useAuth` mockeado con bandera
 * demo conmutable + `useLogoutSeguro` mockeado (su diálogo lo caracteriza su propio módulo;
 * aquí solo se fija el cableado: el botón llama a `solicitarCierre`).
 *
 * Selectores solo por rol/label/texto accesible (R5: deben sobrevivir al refactor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoLicencia,
  type CambioEstadoEntrenadorResultadoDTO,
  type CambioLicenciaEntrenadorResultadoDTO,
  type EntrenadorAdminDTO,
  type EntrenadorCreadoDTO,
  type ListadoEntrenadoresAdminDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({ isDemoMode: false }));
const logoutMock = vi.hoisted(() => ({ solicitarCierre: vi.fn() }));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'superadmin-1',
      email: 'admin@guachafit.com',
      rol: 'superadmin',
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

vi.mock('../../lib/use-logout-seguro', () => ({
  useLogoutSeguro: () => ({
    dialogoAbierto: false,
    pendientes: 0,
    sincronizando: false,
    mensaje: null,
    solicitarCierre: logoutMock.solicitarCierre,
    cancelar: vi.fn(),
    confirmar: vi.fn(),
    sincronizarAhora: vi.fn(),
  }),
}));

import { apiClient } from '../../lib/api-client';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../lib/acceso-ui';
import { construirLinkActivacion } from '../../lib/onboarding-links';
import { AdminPage } from './AdminPage';

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

function entrenador(parcial: Partial<EntrenadorAdminDTO> = {}): EntrenadorAdminDTO {
  return {
    usuarioId: 'coach-1',
    perfilId: 'perfil-1',
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: 'Marcos Fitness',
    email: 'marcos@gym.com',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: true,
    fechaAltaUtc: '2026-08-15T14:00:00.000Z',
    ...parcial,
  };
}

const ENTRENADOR_INHABILITADO = (): EntrenadorAdminDTO =>
  entrenador({
    usuarioId: 'coach-2',
    perfilId: 'perfil-2',
    nombres: 'Valeria',
    apellidos: 'Rojas',
    nombreComercial: null,
    email: 'valeria@box.com',
    coachCode: 'VALERIA-7',
    estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    activo: false,
  });

function respuestaListado(items: EntrenadorAdminDTO[], total: number): ListadoEntrenadoresAdminDTO {
  return { items, total, limit: 25, offset: 0 };
}

const CREADO_OK: EntrenadorCreadoDTO = {
  id: 'ent-100',
  usuarioId: 'coach-100',
  nombres: 'Carlos',
  apellidos: 'Mendoza',
  email: 'carlos@gym.com',
  coachCode: 'CARLOS-1',
  tokenInvitacion: 'tok-abc-123',
  correoEnviado: true,
  mensaje: 'Entrenador creado. Comparte el enlace de activación.',
};

// ---------------------------------------------------------------------------
// Estado mutable del mock + montaje
// ---------------------------------------------------------------------------

let listadoActual: ListadoEntrenadoresAdminDTO = respuestaListado(
  [entrenador(), ENTRENADOR_INHABILITADO()],
  2,
);
let errorListado: Error | null = null;
let retenerListado = false;
const resolversListado: Array<(v: ListadoEntrenadoresAdminDTO) => void> = [];
let resultadoAlta: EntrenadorCreadoDTO | Error | null = null;
let resultadoEstado: CambioEstadoEntrenadorResultadoDTO | Error | null = null;
let resultadoLicencia: CambioLicenciaEntrenadorResultadoDTO | Error | null = null;
let copiarOk = true;
const clientesConsulta: QueryClient[] = [];

function getsListado(): string[] {
  return mockApi.get.mock.calls.map(([endpoint]) => String(endpoint));
}

function montar(): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Espera a que el listado pinte la fila del entrenador activo (carga lista). */
async function esperarListado(): Promise<void> {
  await screen.findByText('marcos@gym.com', {}, { timeout: 4000 });
}

/** Envía el formulario de alta sin pasar por la validación nativa del navegador
 * (jsdom bloquearía el submit por `required`/`minLength`; lo que se caracteriza aquí es el
 * comportamiento propio de la vista con datos válidos). */
function enviarFormularioAlta(): void {
  const boton = screen.getByRole('button', { name: 'Crear entrenador' });
  const formulario = boton.closest('form');
  if (!formulario) throw new Error('El botón de alta no está dentro de un formulario.');
  fireEvent.submit(formulario);
}

function rellenarAltaValida(): void {
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Carlos' } });
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Mendoza' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'carlos@gym.com' },
  });
  fireEvent.change(screen.getByLabelText('Teléfono de contacto'), {
    target: { value: '+58 412 000 0000' },
  });
}

beforeEach(() => {
  sesionMock.isDemoMode = false;
  listadoActual = respuestaListado([entrenador(), ENTRENADOR_INHABILITADO()], 2);
  errorListado = null;
  retenerListado = false;
  resolversListado.length = 0;
  resultadoAlta = null;
  resultadoEstado = null;
  resultadoLicencia = null;
  copiarOk = true;
  logoutMock.solicitarCierre.mockReset();

  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.put.mockReset();
  mockCopiar.mockReset();
  mockCopiar.mockImplementation(() => Promise.resolve(copiarOk));

  mockApi.get.mockImplementation((endpoint: string) => {
    if (String(endpoint).startsWith('/auth/entrenadores?')) {
      if (errorListado) return Promise.reject(errorListado);
      if (retenerListado) {
        return new Promise<ListadoEntrenadoresAdminDTO>((resolver) => {
          resolversListado.push(resolver);
        });
      }
      return Promise.resolve(listadoActual);
    }
    return Promise.resolve(null);
  });
  mockApi.post.mockImplementation((endpoint: string) => {
    if (endpoint === '/auth/entrenador') {
      if (resultadoAlta instanceof Error) return Promise.reject(resultadoAlta);
      if (resultadoAlta) return Promise.resolve(resultadoAlta);
      return Promise.resolve(CREADO_OK);
    }
    return Promise.resolve(null);
  });
  mockApi.patch.mockImplementation((endpoint: string) => {
    if (String(endpoint).endsWith('/estado')) {
      if (resultadoEstado instanceof Error) return Promise.reject(resultadoEstado);
      if (resultadoEstado) return Promise.resolve(resultadoEstado);
      return Promise.resolve({
        usuarioId: 'coach-1',
        activo: false,
        cambioAplicado: true,
        mensaje: 'Cuenta deshabilitada.',
      } satisfies CambioEstadoEntrenadorResultadoDTO);
    }
    if (String(endpoint).endsWith('/licencia')) {
      if (resultadoLicencia instanceof Error) return Promise.reject(resultadoLicencia);
      if (resultadoLicencia) return Promise.resolve(resultadoLicencia);
      return Promise.resolve({
        usuarioId: 'coach-1',
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
        cambioAplicado: true,
        mensaje: 'Licencia suspendida.',
      } satisfies CambioLicenciaEntrenadorResultadoDTO);
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
// 1. Cabecera y cierre de sesión
// ---------------------------------------------------------------------------

describe('AdminPage · caracterización: cabecera y cierre', () => {
  it('C1 · renderiza la cabecera del panel con su descripción', async () => {
    montar();
    expect(await screen.findByRole('heading', { name: 'Panel de administración' })).toBeTruthy();
    expect(screen.getByText('Plataforma GUACHAFIT')).toBeTruthy();
    expect(
      screen.getByText(
        'Administra las cuentas y licencias de los entrenadores, y comparte sus enlaces de activación.',
      ),
    ).toBeTruthy();
    await esperarListado();
  });

  it('C2 · el botón de cierre delega en el cierre seguro (diálogo propio del hook)', async () => {
    montar();
    await esperarListado();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logoutMock.solicitarCierre).toHaveBeenCalledTimes(1);
  });

  it('C3 · la sección "En construcción" declara la capacidad pendiente sin inventar datos', async () => {
    montar();
    await esperarListado();
    expect(screen.getByRole('heading', { name: 'En construcción' })).toBeTruthy();
    expect(
      screen.getByText(
        'Planes y facturación de la plataforma (la licencia hoy solo se activa o suspende)',
      ),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Listado, carga, error y paginación
// ---------------------------------------------------------------------------

describe('AdminPage · caracterización: listado y paginación', () => {
  it('C4 · la carga inicial pide la primera página con el tamaño del contrato', async () => {
    montar();
    await esperarListado();
    expect(getsListado()[0]).toBe('/auth/entrenadores?limit=25&offset=0');
  });

  it('C5 · el listado muestra las filas con sus correos y la sección titulada', async () => {
    montar();
    await esperarListado();
    expect(screen.getByRole('heading', { name: 'Entrenadores de la plataforma' })).toBeTruthy();
    expect(
      screen.getByRole('list', { name: 'Entrenadores de la plataforma' }),
    ).toBeTruthy();
    expect(screen.getByText('marcos@gym.com')).toBeTruthy();
    expect(screen.getByText('valeria@box.com')).toBeTruthy();
  });

  it('C6 · mientras carga no muestra ni filas ni error', async () => {
    retenerListado = true;
    montar();
    expect(await screen.findByRole('heading', { name: 'Panel de administración' })).toBeTruthy();
    expect(screen.queryByText('marcos@gym.com')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      resolversListado.forEach((resolver) => resolver(listadoActual));
    });
    await esperarListado();
  });

  it('C7 · el error de carga muestra el mensaje real con Reintentar, que recarga', async () => {
    errorListado = new Error('Fallo de red simulado');
    montar();
    expect(await screen.findByText('Fallo de red simulado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();

    errorListado = null;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await esperarListado();
    expect(getsListado().length).toBeGreaterThan(1);
  });

  it('C8 · con total > 0 muestra la paginación; avanzar pide el siguiente offset', async () => {
    listadoActual = respuestaListado([entrenador(), ENTRENADOR_INHABILITADO()], 30);
    montar();
    await esperarListado();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
    const antes = getsListado().length;
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await waitFor(
      () => {
        expect(getsListado().length).toBeGreaterThan(antes);
        expect(getsListado()[getsListado().length - 1]).toBe(
          '/auth/entrenadores?limit=25&offset=25',
        );
      },
      { timeout: 4000 },
    );
  });

  it('C9 · con total 0 no hay paginación y la tabla declara el vacío con invitación al alta', async () => {
    listadoActual = respuestaListado([], 0);
    montar();
    expect(await screen.findByText('Todavía no hay entrenadores')).toBeTruthy();
    expect(screen.getByText('Crea el primero con el formulario de alta y aparecerá en esta lista.')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Alta de entrenadores
// ---------------------------------------------------------------------------

describe('AdminPage · caracterización: alta de entrenadores', () => {
  it('C10 · el formulario expone los 5 campos con sus etiquetas accesibles (sin código manual)', async () => {
    montar();
    await esperarListado();
    expect(screen.getByRole('heading', { name: 'Crear entrenador' })).toBeTruthy();
    expect(screen.getByLabelText('Nombres')).toBeTruthy();
    expect(screen.getByLabelText('Apellidos')).toBeTruthy();
    expect(screen.getByLabelText('Correo electrónico')).toBeTruthy();
    expect(screen.getByLabelText('Teléfono de contacto')).toBeTruthy();
    expect(screen.queryByLabelText('Código de entrenador')).toBeNull();
    expect(screen.getByLabelText(/Nombre comercial/)).toBeTruthy();
  });

  it('C11 · alta OK: POST con payload normalizado, panel de éxito con enlace y recarga', async () => {
    resultadoAlta = CREADO_OK;
    montar();
    await esperarListado();
    const getsAntes = getsListado().length;
    rellenarAltaValida();
    enviarFormularioAlta();

    expect(await screen.findByText(CREADO_OK.mensaje)).toBeTruthy();
    expect(screen.getByText('CARLOS-1')).toBeTruthy();
    const enlaceEsperado = construirLinkActivacion('tok-abc-123', window.location.origin);
    expect(screen.getByText(enlaceEsperado)).toBeTruthy();
    expect(mockApi.post).toHaveBeenCalledWith('/auth/entrenador', {
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@gym.com',
      telefonoContacto: '+58 412 000 0000',
    });
    // El alta nueva aparece en la lista sin recargar la página: se refetchea.
    await waitFor(() => expect(getsListado().length).toBeGreaterThan(getsAntes), {
      timeout: 4000,
    });
  });

  it('C12 · el nombre comercial viaja solo cuando no está vacío', async () => {
    resultadoAlta = { ...CREADO_OK, tokenInvitacion: null };
    montar();
    await esperarListado();
    rellenarAltaValida();
    fireEvent.change(screen.getByLabelText(/Nombre comercial/), {
      target: { value: 'Carlos Fitness' },
    });
    enviarFormularioAlta();
    await screen.findByText(CREADO_OK.mensaje);
    expect(mockApi.post).toHaveBeenCalledWith('/auth/entrenador', {
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@gym.com',
      telefonoContacto: '+58 412 000 0000',
      nombreComercial: 'Carlos Fitness',
    });
  });

  it('C13 · durante el envío el botón muestra progreso y se deshabilita', async () => {
    let resolverAlta!: (v: EntrenadorCreadoDTO) => void;
    const altaRetenida = new Promise<EntrenadorCreadoDTO>((resolver) => {
      resolverAlta = resolver;
    });
    mockApi.post.mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/entrenador') return altaRetenida;
      return Promise.resolve(null);
    });
    montar();
    await esperarListado();
    rellenarAltaValida();
    enviarFormularioAlta();
    const boton = await screen.findByRole('button', { name: 'Creando cuenta...' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      resolverAlta(CREADO_OK);
    });
    expect(await screen.findByText(CREADO_OK.mensaje)).toBeTruthy();
  });

  it('C14 · si el POST falla, el error queda en la sección y no hay éxito fantasma', async () => {
    resultadoAlta = new Error('El correo ya está registrado.');
    montar();
    await esperarListado();
    rellenarAltaValida();
    enviarFormularioAlta();
    expect(await screen.findByText('El correo ya está registrado.')).toBeTruthy();
    expect(screen.queryByText(CREADO_OK.mensaje)).toBeNull();
    expect(mockApi.get.mock.calls.length).toBeGreaterThan(0);
  });

  it('C15 · "Copiar" confirma y envía el enlace de activación al portapapeles', async () => {
    resultadoAlta = CREADO_OK;
    montar();
    await esperarListado();
    rellenarAltaValida();
    enviarFormularioAlta();
    await screen.findByText(CREADO_OK.mensaje);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeTruthy();
    expect(mockCopiar).toHaveBeenCalledWith(
      construirLinkActivacion('tok-abc-123', window.location.origin),
    );
  });

  it('C16 · si la copia falla, el aviso de copiar a mano es visible', async () => {
    copiarOk = false;
    resultadoAlta = CREADO_OK;
    montar();
    await esperarListado();
    rellenarAltaValida();
    enviarFormularioAlta();
    await screen.findByText(CREADO_OK.mensaje);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText(MENSAJE_COPIA_FALLIDA)).toBeTruthy();
  });

  it('C17 · sin token de invitación la cuenta queda activa sin bloque de enlace', async () => {
    resultadoAlta = { ...CREADO_OK, tokenInvitacion: null };
    montar();
    await esperarListado();
    rellenarAltaValida();
    enviarFormularioAlta();
    await screen.findByText(CREADO_OK.mensaje);
    expect(
      screen.getByText('La cuenta quedó activa con la contraseña definida.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copiar' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Confirmaciones de cuenta y licencia
// ---------------------------------------------------------------------------

describe('AdminPage · caracterización: acciones con confirmación', () => {
  it('C18 · "Deshabilitar" abre el diálogo con título, alcance y botón de la acción', async () => {
    montar();
    await esperarListado();
    const fila = screen.getByText('marcos@gym.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Marcos.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Deshabilitar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByRole('heading', { name: '¿Deshabilitar a Marcos Fitness?' }),
    ).toBeTruthy();
    expect(
      within(dialogo).getByRole('button', { name: 'Deshabilitar cuenta' }),
    ).toBeTruthy();
  });

  it('C19 · confirmar la deshabilitación hace el PATCH, avisa y recarga', async () => {
    resultadoEstado = {
      usuarioId: 'coach-1',
      activo: false,
      cambioAplicado: true,
      mensaje: 'Cuenta deshabilitada.',
    };
    montar();
    await esperarListado();
    const getsAntes = getsListado().length;
    const fila = screen.getByText('marcos@gym.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Marcos.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Deshabilitar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Deshabilitar cuenta' }));
    expect(await screen.findByText('Cuenta deshabilitada.')).toBeTruthy();
    expect(mockApi.patch).toHaveBeenCalledWith('/auth/entrenadores/coach-1/estado', {
      activo: false,
    });
    await waitFor(() => expect(getsListado().length).toBeGreaterThan(getsAntes), {
      timeout: 4000,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
  });

  it('C20 · "Suspender licencia" confirma el PATCH de licencia con su aviso', async () => {
    resultadoLicencia = {
      usuarioId: 'coach-1',
      estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      cambioAplicado: true,
      mensaje: 'Licencia suspendida.',
    };
    montar();
    await esperarListado();
    const fila = screen.getByText('marcos@gym.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Marcos.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Suspender licencia' }));
    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByRole('heading', { name: '¿Suspender la licencia de Marcos Fitness?' }),
    ).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Suspender licencia' }));
    expect(await screen.findByText('Licencia suspendida.')).toBeTruthy();
    expect(mockApi.patch).toHaveBeenCalledWith('/auth/entrenadores/coach-1/licencia', {
      estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    });
  });

  it('C21 · la cuenta deshabilitada ofrece "Reactivar" y la suspendida "Activar licencia"', async () => {
    montar();
    await esperarListado();
    const fila = screen.getByText('valeria@box.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Valeria.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Reactivar' }));
    expect(
      await screen.findByRole('heading', { name: '¿Reactivar a Valeria Rojas?' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
    fireEvent.click(within(fila).getByRole('button', { name: 'Activar licencia' }));
    expect(
      await screen.findByRole('heading', { name: '¿Activar la licencia de Valeria Rojas?' }),
    ).toBeTruthy();
  });

  it('C22 · si el PATCH falla, el error queda visible (role=alert) y no hay aviso de éxito', async () => {
    resultadoEstado = new Error('No se pudo aplicar el cambio. Intenta de nuevo.');
    montar();
    await esperarListado();
    const fila = screen.getByText('marcos@gym.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Marcos.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Deshabilitar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Deshabilitar cuenta' }));
    expect(
      await screen.findByText('No se pudo aplicar el cambio. Intenta de nuevo.'),
    ).toBeTruthy();
    expect(screen.queryByText('Cuenta deshabilitada.')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Modo demo
// ---------------------------------------------------------------------------

describe('AdminPage · caracterización: modo demo', () => {
  it('C23 · en demo no consulta la red y aplica el cambio en la sesión con su aviso', async () => {
    sesionMock.isDemoMode = true;
    montar();
    expect(await screen.findByText('marcos@gym.com')).toBeTruthy();
    expect(
      mockApi.get.mock.calls.some(([endpoint]) =>
        String(endpoint).startsWith('/auth/entrenadores?'),
      ),
    ).toBe(false);
    const fila = screen.getByText('marcos@gym.com').closest('li');
    if (!fila) throw new Error('No se encontró la fila de Marcos.');
    fireEvent.click(within(fila).getByRole('button', { name: 'Deshabilitar' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Deshabilitar cuenta' }));
    expect(
      await screen.findByText(
        'Cambio aplicado en esta sesión de demostración (no se guardó en el servidor).',
      ),
    ).toBeTruthy();
    expect(mockApi.patch).not.toHaveBeenCalled();
  });
});
