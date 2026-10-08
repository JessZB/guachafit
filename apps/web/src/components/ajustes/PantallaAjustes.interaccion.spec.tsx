// @vitest-environment jsdom
/**
 * RF-018 P1/P2/P3 · regresión: interacción real de la pantalla "Ajustes" del alumno.
 *
 * Cubre: 7 (P1) un guardado en vuelo no pierde su resultado al cambiar de pestaña; 8 montaje con
 * ambos paneles (`role=tabpanel`, `aria-labelledby`) y el inactivo `hidden`; 9 pestañas APG;
 * 10 aviso honesto sin conexión; 11 `{ tiempoLimiteMs }` en los guardados y aviso de vencimiento.
 * Además: el mensaje propio del vencimiento al cambiar la contraseña (risk H1), el borrado de
 * contraseñas al ocultar la pestaña con el correo nuevo conservado (risk H2), un solo aviso
 * offline (resilience H1) y el caso superadmin sin `tablist`/`tabpanel` (reliability H4).
 *
 * El api-client se parcial-mockea (métodos) conservando las exportaciones reales; el perfil de
 * prueba es de un alumno con `correoPendiente: null` y la sesión simulada cambia por prueba
 * (alumno por defecto, superadmin en su caso).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Rol, TipoDocumento, type MiPerfilDTO } from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({
  rol: 'alumno' as string,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ana@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../common/AvisoDatosOffline', () => ({
  AvisoDatosOffline: () => <div data-testid="aviso-offline" />,
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
    }),
  };
});

import * as moduloApiClient from '../../lib/api-client';
import { ErrorDeConexion, ErrorTiempoAgotado, MENSAJE_TIEMPO_AGOTADO, apiClient } from '../../lib/api-client';
import {
  MENSAJE_AJUSTES_SIN_CONEXION,
  MENSAJE_PASSWORD_TIEMPO_AGOTADO,
  TIEMPO_LIMITE_GUARDADO_AJUSTES_MS,
} from '../../lib/mi-perfil';
import { PantallaAjustes } from './PantallaAjustes';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

const PERFIL_ALUMNO: MiPerfilDTO = {
  id: 'u1',
  email: 'ana@example.com',
  rol: Rol.ALUMNO,
  correoPendiente: null,
  correoPendienteExpiraUtc: null,
  alumno: {
    nombres: 'Ana',
    apellidos: 'Pérez',
    telefonoWhatsapp: '+584121234567',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    fechaNacimiento: '1998-05-14',
    zonaHoraria: 'America/Caracas',
  },
  entrenador: null,
};

const PERFIL_CON_CORREO_PENDIENTE: MiPerfilDTO = {
  ...PERFIL_ALUMNO,
  correoPendiente: 'nuevo@example.com',
  correoPendienteExpiraUtc: '2026-10-09T00:00:00.000Z',
};

const PERFIL_SUPERADMIN: MiPerfilDTO = {
  id: 'admin-1',
  email: 'admin@example.com',
  rol: Rol.SUPERADMIN,
  correoPendiente: null,
  correoPendienteExpiraUtc: null,
  alumno: null,
  entrenador: null,
};

function crearStorage() {
  const datos = new Map<string, string>();
  return {
    getItem: (clave: string) => (datos.has(clave) ? (datos.get(clave) as string) : null),
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
  };
}

function UrlActual() {
  const { pathname, search } = useLocation();
  return <p data-testid="url">{`${pathname}${search}`}</p>;
}

function renderPantalla(ruta = '/app/ajustes') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <PantallaAjustes descripcion="Gestiona tu cuenta y tus preferencias." />
      <UrlActual />
    </MemoryRouter>
  );
}

/** Espera a que el perfil simulado llegue y se pinte el formulario de datos. */
async function esperarPerfil() {
  await screen.findByLabelText('Nombres');
}

beforeEach(() => {
  sesionMock.rol = Rol.ALUMNO;
  sesionMock.isDemoMode = false;
  vi.stubGlobal('localStorage', crearStorage());
  // jsdom no implementa scrollIntoView; PantallaAjustes lo usa al activar una pestaña.
  Element.prototype.scrollIntoView = vi.fn();
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.mockResolvedValue(PERFIL_ALUMNO);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PantallaAjustes (RF-018 P1-P3)', () => {
  it('7 (P1): el resultado de un guardado en vuelo sobrevive al cambio de pestaña', async () => {
    const espiaSetAuthToken = vi.spyOn(moduloApiClient, 'setAuthToken');

    let resolverPost: (valor: {
      mensaje: string;
      accessToken: string;
      refreshToken: string;
    }) => void = () => undefined;
    mockApi.post.mockImplementation(
      () =>
        new Promise<{ mensaje: string; accessToken: string; refreshToken: string }>((resolver) => {
          resolverPost = resolver;
        })
    );

    renderPantalla();
    await esperarPerfil();

    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    // El POST queda en vuelo: nos vamos a Perfil y resolvemos allí.
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    await act(async () => {
      resolverPost({ mensaje: 'Tu contraseña se cambió.', accessToken: 'a', refreshToken: 'r' });
    });

    // Al volver a la pestaña debe verse el resultado del guardado.
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));

    expect(await screen.findByText('Tu contraseña se cambió.')).toBeTruthy();
    expect(espiaSetAuthToken).toHaveBeenCalledWith('a');
  });

  it('8: con Perfil activa, el panel de contraseña existe oculto y cada panel tiene role y aria-labelledby', async () => {
    renderPantalla();
    await esperarPerfil();

    const tabPerfil = screen.getByRole('tab', { name: 'Perfil' });
    const tabSeguridad = screen.getByRole('tab', { name: 'Correo y contraseña' });
    const panelPerfil = document.querySelector(
      `[role="tabpanel"][aria-labelledby="${tabPerfil.id}"]`
    );
    const panelSeguridad = document.querySelector(
      `[role="tabpanel"][aria-labelledby="${tabSeguridad.id}"]`
    );
    const inputPassword = document.getElementById('password-actual');

    expect(inputPassword).not.toBeNull();
    expect(panelSeguridad).not.toBeNull();
    expect(panelSeguridad?.hasAttribute('hidden')).toBe(true);
    expect(panelSeguridad?.contains(inputPassword)).toBe(true);
    expect(panelPerfil).not.toBeNull();
    expect(panelPerfil?.hasAttribute('hidden')).toBe(false);
  });

  it('9: APG: ArrowRight desde Perfil activa Correo y contraseña (?tab=seguridad) y End activa Zona horaria', async () => {
    renderPantalla();
    await esperarPerfil();

    const tabPerfil = screen.getByRole('tab', { name: 'Perfil' });
    tabPerfil.focus();
    fireEvent.keyDown(tabPerfil, { key: 'ArrowRight' });

    expect(
      screen.getByRole('tab', { name: 'Correo y contraseña' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByTestId('url').textContent).toBe('/app/ajustes?tab=seguridad');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Correo y contraseña' }), { key: 'End' });

    expect(screen.getByRole('tab', { name: 'Zona horaria' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(screen.getByTestId('url').textContent).toBe('/app/ajustes?tab=zona-horaria');
  });

  it('9: ?tab=planes (pestaña de otro rol) cae en Perfil', async () => {
    renderPantalla('/app/ajustes?tab=planes');

    expect(screen.getByRole('tab', { name: 'Perfil' }).getAttribute('aria-selected')).toBe('true');
    await esperarPerfil();
  });

  it('10: sin conexión al guardar perfil muestra el aviso y conserva el teléfono escrito', async () => {
    mockApi.patch.mockRejectedValue(new ErrorDeConexion());

    renderPantalla();
    await esperarPerfil();

    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+584241112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(MENSAJE_AJUSTES_SIN_CONEXION)).toBeTruthy();
    expect((screen.getByLabelText('Teléfono') as HTMLInputElement).value).toBe('+584241112233');
  });

  it('11: guardar perfil llama a patch con tiempoLimiteMs', async () => {
    mockApi.patch.mockResolvedValue(PERFIL_ALUMNO);

    renderPantalla();
    await esperarPerfil();
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+584241112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledTimes(1));
    expect(mockApi.patch).toHaveBeenCalledWith(
      '/usuarios/me/perfil',
      { telefono: '+584241112233' },
      { tiempoLimiteMs: TIEMPO_LIMITE_GUARDADO_AJUSTES_MS }
    );
  });

  it('11: si el guardado de perfil se agota, se ve MENSAJE_TIEMPO_AGOTADO y el botón vuelve a estar habilitado', async () => {
    mockApi.patch.mockRejectedValue(new ErrorTiempoAgotado());

    renderPantalla();
    await esperarPerfil();
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+584241112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(MENSAJE_TIEMPO_AGOTADO)).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled
      ).toBe(false)
    );
  });

  it('11: cambiar contraseña llama a post con tiempoLimiteMs', async () => {
    mockApi.post.mockResolvedValue({
      mensaje: 'Tu contraseña se cambió.',
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderPantalla();
    await esperarPerfil();
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/usuarios/me/password',
      { passwordActual: 'actual-123', passwordNueva: 'nueva-1234' },
      { tiempoLimiteMs: TIEMPO_LIMITE_GUARDADO_AJUSTES_MS }
    );
  });

  it('11: pedir el cambio de correo llama a post con tiempoLimiteMs', async () => {
    mockApi.post.mockResolvedValue({
      mensaje: 'Te enviamos un correo de confirmación.',
      correoPendiente: 'nuevo@example.com',
      expiraUtc: '2026-10-09T00:00:00.000Z',
      correoEnviado: true,
    });

    renderPantalla();
    await esperarPerfil();
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.change(screen.getByLabelText('Correo nuevo'), { target: { value: 'nuevo@example.com' } });
    fireEvent.change(screen.getByLabelText('Tu contraseña actual'), {
      target: { value: 'actual-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar correo de confirmación' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
    expect(mockApi.post).toHaveBeenCalledWith(
      '/usuarios/me/correo',
      { correoNuevo: 'nuevo@example.com', passwordActual: 'actual-123' },
      { tiempoLimiteMs: TIEMPO_LIMITE_GUARDADO_AJUSTES_MS }
    );
  });

  it('11: cancelar el cambio de correo llama a delete con tiempoLimiteMs', async () => {
    mockApi.mockResolvedValue(PERFIL_CON_CORREO_PENDIENTE);
    mockApi.delete.mockResolvedValue({ mensaje: 'El cambio de correo quedó cancelado.' });

    renderPantalla();
    await esperarPerfil();
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cambio' }));

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledTimes(1));
    expect(mockApi.delete).toHaveBeenCalledWith('/usuarios/me/correo-pendiente', {
      tiempoLimiteMs: TIEMPO_LIMITE_GUARDADO_AJUSTES_MS,
    });
  });

  it('risk H1: el vencimiento al cambiar la contraseña muestra MENSAJE_PASSWORD_TIEMPO_AGOTADO y no guarda tokens', async () => {
    const espiaSetAuthToken = vi.spyOn(moduloApiClient, 'setAuthToken');
    mockApi.post.mockRejectedValue(new ErrorTiempoAgotado());

    renderPantalla();
    await esperarPerfil();
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText(MENSAJE_PASSWORD_TIEMPO_AGOTADO)).toBeTruthy();
    expect(espiaSetAuthToken).not.toHaveBeenCalled();
  });

  it('risk H2: al ocultar la pestaña se vacían las contraseñas, el correo nuevo se conserva y el P1 sigue en pie', async () => {
    let resolverPost: (valor: {
      mensaje: string;
      accessToken: string;
      refreshToken: string;
    }) => void = () => undefined;
    mockApi.post.mockImplementation(
      () =>
        new Promise<{ mensaje: string; accessToken: string; refreshToken: string }>((resolver) => {
          resolverPost = resolver;
        })
    );

    renderPantalla();
    await esperarPerfil();
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.change(screen.getByLabelText('Correo nuevo'), {
      target: { value: 'nuevo@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Tu contraseña actual'), {
      target: { value: 'actual-123' },
    });

    // Cambia a Perfil y vuelve: las contraseñas se limpian, el correo nuevo sigue escrito.
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));

    expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Contraseña nueva') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Repite la contraseña nueva') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tu contraseña actual') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Correo nuevo') as HTMLInputElement).value).toBe(
      'nuevo@example.com'
    );

    // P1 sigue cumpliéndose: un guardado en vuelo se ve al volver.
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'actual-123' } });
    fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'nueva-1234' } });
    fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), {
      target: { value: 'nueva-1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Perfil' }));
    await act(async () => {
      resolverPost({ mensaje: 'Tu contraseña se cambió.', accessToken: 'a', refreshToken: 'r' });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    expect(await screen.findByText('Tu contraseña se cambió.')).toBeTruthy();
  });

  it('resilience H1: con el perfil cargado solo hay un AvisoDatosOffline montado (el del panel visible)', async () => {
    renderPantalla();
    await esperarPerfil();

    expect(screen.getAllByTestId('aviso-offline')).toHaveLength(1);

    // Al cambiar de pestaña la pantalla sigue mostrando uno solo, el de la pestaña visible.
    fireEvent.click(screen.getByRole('tab', { name: 'Correo y contraseña' }));
    expect(screen.getAllByTestId('aviso-offline')).toHaveLength(1);
  });

  it('reliability H4: con superadministrador no hay tablist ni tabpanel y se ve Correo y contraseña', async () => {
    sesionMock.rol = Rol.SUPERADMIN;
    mockApi.mockResolvedValue(PERFIL_SUPERADMIN);

    renderPantalla();

    expect(await screen.findByLabelText('Contraseña actual')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(document.querySelector('[role="tabpanel"]')).toBeNull();
  });
});
