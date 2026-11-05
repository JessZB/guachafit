// @vitest-environment happy-dom
/**
 * UX-19 · Specs de interacción: Pestaña «Tasa» en Ajustes del entrenador (Fase roja).
 * Contratos TS1 a TS16.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Rol, type MiPerfilDTO, type TasaCambioVigenteDTO } from '@guachafit/shared';

vi.setConfig({ testTimeout: 20000 });

const sesionMock = vi.hoisted(() => ({
  rol: 'entrenador' as string,
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'e1', email: 'coach@example.com', rol: sesionMock.rol },
    isDemoMode: sesionMock.isDemoMode,
  }),
}));

vi.mock('../../components/notificaciones/MatrizPreferenciasNotificacion', () => ({
  MatrizPreferenciasNotificacion: () => <p>Matriz de notificaciones (marcador)</p>,
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

import { apiClient } from '../../lib/api-client';
import { AjustesPage } from './AjustesPage';
import * as tasasModulo from '../../lib/ajustes-entrenador-tasas';

const {
  ETIQUETAS_FUENTE_TASA,
  MENSAJES_ERROR_TASA,
  MENSAJE_PARALELO_REQUERIDO,
  MENSAJE_TASA_GUARDADA,
  MENSAJE_ERROR_GUARDAR_TASA,
  AVISO_CAMBIOS_SIN_GUARDAR_TASA,
} = tasasModulo as any;

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
};

const PERFIL_ENTRENADOR: MiPerfilDTO = {
  id: 'e1',
  email: 'coach@example.com',
  rol: Rol.ENTRENADOR,
  correoPendiente: null,
  correoPendienteExpiraUtc: null,
  alumno: null,
  entrenador: {
    nombres: 'Luis',
    apellidos: 'Rojas',
    nombreComercial: 'Gimnasio Rojas',
    telefonoContacto: '+584149990000',
  },
};

const TASA: TasaCambioVigenteDTO = {
  entrenadorId: 'e1',
  tasaOficialBcv: '36.5000',
  tasaParalelo: '40.1000',
  tasaActivaEntrenador: '36.5000',
  tasaEfectiva: '36.5000',
  fuente: 'oficial_bcv',
  fechaActualizacionUtc: '2026-10-30T12:00:00.000Z',
};

const SIN_TASA: TasaCambioVigenteDTO = {
  entrenadorId: 'e1',
  tasaOficialBcv: null,
  tasaParalelo: null,
  tasaActivaEntrenador: null,
  tasaEfectiva: null,
  fuente: 'sin_configurar' as any,
  fechaActualizacionUtc: null,
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
  return <div data-testid="url-actual">{`${pathname}${search}`}</div>;
}

function renderAjustes(rutaInicial = '/coach/ajustes?tab=tasas') {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <AjustesPage />
      <UrlActual />
    </MemoryRouter>
  );
}

beforeEach(() => {
  sesionMock.rol = Rol.ENTRENADOR;
  sesionMock.isDemoMode = false;
  vi.stubGlobal('localStorage', crearStorage());
  Element.prototype.scrollIntoView = vi.fn();
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
    if (endpoint === '/finanzas/planes') return Promise.resolve([]);
    if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
    if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
      return Promise.resolve(TASA);
    }
    return Promise.resolve(PERFIL_ENTRENADOR);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AjustesPage · Pestaña Tasa (UX-19)', () => {
  it('TS1: TASA cargada', async () => {
    renderAjustes();

    const grupo = await screen.findByRole('group', { name: 'Tasa guardada' });
    expect(grupo).not.toBeNull();
    expect(grupo.textContent).toContain('36,50');
    expect(grupo.textContent).toContain(ETIQUETAS_FUENTE_TASA.oficial_bcv);

    const campoBcv = screen.getByLabelText('Tasa BCV');
    const detailsBcv = campoBcv.closest('details') as HTMLDetailsElement | null;
    expect(detailsBcv).not.toBeNull();
    expect(detailsBcv!.open).toBe(false);

    expect((campoBcv as HTMLInputElement).value).toBe('36,50');
    expect((screen.getByLabelText('Tasa paralelo (opcional)') as HTMLInputElement).value).toBe('40,10');
    expect((screen.getByLabelText('Tasa activa') as HTMLInputElement).value).toBe('36,50');
  });

  it('TS2: DTO con fuente: \'paralelo\'; otro con fuente: \'perfil_coach\'', async () => {
    const tasaParalelo: TasaCambioVigenteDTO = {
      ...TASA,
      fuente: 'paralelo',
      tasaActivaEntrenador: '40.1000',
      tasaEfectiva: '40.1000',
    };
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(tasaParalelo);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    const { unmount } = renderAjustes();
    const radiogroup = await screen.findByRole('radiogroup', { name: 'Fuente de la tasa' });
    expect(radiogroup).not.toBeNull();

    const radioParalelo = screen.getByRole('radio', {
      name: new RegExp(`^${ETIQUETAS_FUENTE_TASA.paralelo}`),
    }) as HTMLInputElement;
    expect(radioParalelo.checked).toBe(true);

    unmount();

    const tasaPerfilCoach: TasaCambioVigenteDTO = {
      ...TASA,
      fuente: 'perfil_coach',
    };
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(tasaPerfilCoach);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();
    await screen.findByRole('radiogroup', { name: 'Fuente de la tasa' });
    const radioManual = screen.getByRole('radio', {
      name: new RegExp(`^${ETIQUETAS_FUENTE_TASA.manual}`),
    }) as HTMLInputElement;
    expect(radioManual.checked).toBe(true);
  });

  it('TS3: SIN_TASA', async () => {
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(SIN_TASA);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    expect(screen.queryByRole('group', { name: 'Tasa guardada' })).toBeNull();

    const detailsBcv = campoBcv.closest('details') as HTMLDetailsElement | null;
    expect(detailsBcv).not.toBeNull();
    expect(detailsBcv!.open).toBe(true);

    expect(screen.queryByLabelText('Monto en USD')).toBeNull();

    expect((campoBcv as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tasa paralelo (opcional)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tasa activa') as HTMLInputElement).value).toBe('');
  });

  it('TS4: TASA; se escribe 38,5 en «Tasa BCV» (fuente oficial) y se pulsa «Guardar tasa»', async () => {
    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcv, { target: { value: '38,5' } });

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    await waitFor(() => {
      const llamadaPut = mockApi.mock.calls.find(
        (call) => call[0] === '/finanzas/tasas' && call[1]?.method === 'PUT'
      );
      expect(llamadaPut).toBeTruthy();
      const body = JSON.parse(llamadaPut![1].body);
      expect(body.tasaOficialBcv).toBe('38.5000');
      expect(body.tasaActivaEntrenador).toBe('38.5000');
      expect(body.tasaParalelo).toBe('40.1000');
      expect(body.fuente).toBe('oficial_bcv');
    });
  });

  it('TS5: TASA; «Tasa BCV» vacía y luego 1,23456; en cada caso se pulsa «Guardar tasa»', async () => {
    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });

    // Caso 1: Vacía
    fireEvent.change(campoBcv, { target: { value: '' } });
    fireEvent.click(botonGuardar);

    const llamadasPutVacia = mockApi.mock.calls.filter(
      (call) => call[0] === '/finanzas/tasas' && call[1]?.method === 'PUT'
    );
    expect(llamadasPutVacia.length).toBe(0);
    expect(campoBcv.getAttribute('aria-invalid')).toBe('true');

    const contieneErrorVacia = screen
      .getAllByRole('alert')
      .some((el) => (el.textContent ?? '').includes(MENSAJES_ERROR_TASA.tasaOficialBcv));
    expect(contieneErrorVacia).toBe(true);

    // Caso 2: 1,23456
    fireEvent.change(campoBcv, { target: { value: '1,23456' } });
    fireEvent.click(botonGuardar);

    const llamadasPutInvalida = mockApi.mock.calls.filter(
      (call) => call[0] === '/finanzas/tasas' && call[1]?.method === 'PUT'
    );
    expect(llamadasPutInvalida.length).toBe(0);
    expect(campoBcv.getAttribute('aria-invalid')).toBe('true');

    const contieneErrorInvalida = screen
      .getAllByRole('alert')
      .some((el) => (el.textContent ?? '').includes(MENSAJES_ERROR_TASA.tasaOficialBcv));
    expect(contieneErrorInvalida).toBe(true);
  });

  it('TS6: TASA; el PUT rechaza new Error(\'Servidor caído\')', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return Promise.reject(new Error('Servidor caído'));
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcv, { target: { value: '38,5' } });

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    const alertError = await screen.findByRole('alert');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(alertError.textContent).toContain('Servidor caído');
    expect((campoBcv as HTMLInputElement).value).toBe('38,5');

    // Segunda variante: error con mensaje vacío -> MENSAJE_ERROR_GUARDAR_TASA
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return Promise.reject(new Error(''));
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    fireEvent.click(botonGuardar);
    await waitFor(() => {
      const alertGenerico = screen.getByRole('alert');
      expect(alertGenerico.textContent).toContain(MENSAJE_ERROR_GUARDAR_TASA);
    });
  });

  it('TS7: TASA; el PUT responde un DTO con 38.5000 en tasaOficialBcv, tasaActivaEntrenador y tasaEfectiva; se guarda', async () => {
    const tasaActualizada: TasaCambioVigenteDTO = {
      ...TASA,
      tasaOficialBcv: '38.5000',
      tasaActivaEntrenador: '38.5000',
      tasaEfectiva: '38.5000',
    };

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return Promise.resolve(tasaActualizada);
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcv, { target: { value: '38,5' } });

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    const statusGuardado = (await screen.findAllByRole('status')).some((el) =>
      (el.textContent ?? '').includes(MENSAJE_TASA_GUARDADA)
    );
    expect(statusGuardado).toBe(true);

    const grupoGuardado = screen.getByRole('group', { name: 'Tasa guardada' });
    expect(grupoGuardado.textContent).toContain('38,50');

    const campoActiva = screen.getByLabelText('Tasa activa');
    fireEvent.change(campoActiva, { target: { value: '39' } });
    expect(screen.queryByText(MENSAJE_TASA_GUARDADA)).toBeNull();
  });

  it('TS8: TASA; el PUT devuelve una promesa que no se resuelve; se cambia BCV a 38,5 y se pulsa «Guardar tasa» dos veces seguidas', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return new Promise(() => {});
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcv, { target: { value: '38,5' } });

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);
    fireEvent.click(botonGuardar);

    const llamadasPut = mockApi.mock.calls.filter(
      (call) => call[0] === '/finanzas/tasas' && call[1]?.method === 'PUT'
    );
    expect(llamadasPut.length).toBe(1);

    expect(botonGuardar.getAttribute('aria-busy')).toBe('true');
    expect((botonGuardar as HTMLButtonElement).disabled).toBe(true);
  });

  it('TS9: TASA; se escribe 37 en «Tasa activa»', async () => {
    renderAjustes();

    const campoActiva = await screen.findByLabelText('Tasa activa');
    fireEvent.change(campoActiva, { target: { value: '37' } });

    expect(screen.getByText(AVISO_CAMBIOS_SIN_GUARDAR_TASA)).not.toBeNull();

    fireEvent.change(campoActiva, { target: { value: '36,50' } });
    expect(screen.queryByText(AVISO_CAMBIOS_SIN_GUARDAR_TASA)).toBeNull();
  });

  it('TS10: TASA; se escribe 37 en «Tasa activa», se cambia a la pestaña «Planes» (getByRole(\'tab\', {name: \'Planes\'})) y se vuelve a «Tasa»', async () => {
    renderAjustes();

    const campoActiva = await screen.findByLabelText('Tasa activa');
    fireEvent.change(campoActiva, { target: { value: '37' } });

    const tabPlanes = screen.getByRole('tab', { name: /^Planes/ });
    fireEvent.click(tabPlanes);

    const tabTasa = screen.getByRole('tab', { name: 'Tasa' });
    fireEvent.click(tabTasa);

    const campoActivaRecuperado = screen.getByLabelText('Tasa activa') as HTMLInputElement;
    expect(campoActivaRecuperado.value).toBe('37');

    const detailsTasa = campoActivaRecuperado.closest('details') as HTMLDetailsElement | null;
    expect(detailsTasa).not.toBeNull();
    expect(detailsTasa!.open).toBe(true);

    expect(screen.getByText(AVISO_CAMBIOS_SIN_GUARDAR_TASA)).not.toBeNull();
  });

  it('TS11: TASA; se elige el radio de Paralelo', async () => {
    renderAjustes();

    const radioParalelo = (await screen.findByRole('radio', {
      name: new RegExp(`^${ETIQUETAS_FUENTE_TASA.paralelo}`),
    })) as HTMLInputElement;
    const radioBcv = screen.getByRole('radio', {
      name: new RegExp(`^${ETIQUETAS_FUENTE_TASA.oficial_bcv}`),
    }) as HTMLInputElement;

    fireEvent.click(radioParalelo);

    const campoActiva = screen.getByLabelText('Tasa activa') as HTMLInputElement;
    expect(campoActiva.value).toBe('40,10');
    expect(radioParalelo.checked).toBe(true);
    expect(radioBcv.checked).toBe(false);
  });

  it('TS12: TASA', async () => {
    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    const campoParalelo = screen.getByLabelText('Tasa paralelo (opcional)');
    const campoActiva = screen.getByLabelText('Tasa activa');

    expect((campoBcv as HTMLInputElement).type).toBe('text');
    expect(campoBcv.getAttribute('inputmode')).toBe('decimal');

    expect((campoParalelo as HTMLInputElement).type).toBe('text');
    expect(campoParalelo.getAttribute('inputmode')).toBe('decimal');

    expect((campoActiva as HTMLInputElement).type).toBe('text');
    expect(campoActiva.getAttribute('inputmode')).toBe('decimal');
  });

  it('TS13: TASA', async () => {
    renderAjustes();

    const campoUsd = await screen.findByLabelText('Monto en USD');
    const campoVes = screen.getByLabelText('Monto en bolívares');

    const detailsCalculadora = campoUsd.closest('details') as HTMLDetailsElement | null;
    expect(detailsCalculadora).not.toBeNull();
    expect(detailsCalculadora!.open).toBe(false);

    expect((campoUsd as HTMLInputElement).value).toBe('');
    expect((campoVes as HTMLInputElement).value).toBe('');

    fireEvent.change(campoUsd, { target: { value: '40' } });
    expect((campoVes as HTMLInputElement).value).toBe('1460,00');

    fireEvent.change(campoVes, { target: { value: '730' } });
    expect((campoUsd as HTMLInputElement).value).toBe('20,00');
  });

  it('TS14: TASA; se cambia el borrador de «Tasa BCV» a 50 y luego se escribe 40 en USD', async () => {
    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcv, { target: { value: '50' } });

    const campoUsd = screen.getByLabelText('Monto en USD');
    fireEvent.change(campoUsd, { target: { value: '40' } });

    const campoVes = screen.getByLabelText('Monto en bolívares') as HTMLInputElement;
    expect(campoVes.value).toBe('1460,00');
  });

  it('TS15: La GET de la tasa queda pendiente (promesa sin resolver)', async () => {
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return new Promise(() => {});
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);

    expect(screen.queryByRole('radiogroup', { name: 'Fuente de la tasa' })).toBeNull();
    expect(screen.queryByLabelText('Tasa BCV')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Tasa guardada' })).toBeNull();
  });

  it('TS16: La GET de la tasa rechaza new Error(\'Sin conexión\')', async () => {
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.reject(new Error('Sin conexión'));
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const botonReintentar = await screen.findByRole('button', { name: 'Reintentar' });
    expect(botonReintentar).not.toBeNull();

    expect(screen.queryByLabelText('Tasa BCV')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Tasa guardada' })).toBeNull();

    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    fireEvent.click(botonReintentar);

    const grupoGuardado = await screen.findByRole('group', { name: 'Tasa guardada' });
    expect(grupoGuardado).not.toBeNull();
  });

  it('V5: GET con tasaParalelo null, se elige Paralelo y se guarda', async () => {
    const tasaSinParalelo: TasaCambioVigenteDTO = {
      ...TASA,
      tasaParalelo: null,
    };
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(tasaSinParalelo);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const radioParalelo = (await screen.findByRole('radio', {
      name: new RegExp(`^${ETIQUETAS_FUENTE_TASA.paralelo}`),
    })) as HTMLInputElement;
    fireEvent.click(radioParalelo);

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    const llamadasPut = mockApi.mock.calls.filter(
      (call) => call[0] === '/finanzas/tasas' && call[1]?.method === 'PUT'
    );
    expect(llamadasPut.length).toBe(0);

    const campoParalelo = screen.getByLabelText('Tasa paralelo (opcional)');
    expect(campoParalelo.getAttribute('aria-invalid')).toBe('true');

    const contieneAlerta = screen
      .getAllByRole('alert')
      .some((el) => (el.textContent ?? '').includes(MENSAJE_PARALELO_REQUERIDO));
    expect(contieneAlerta).toBe(true);

    const campoActiva = screen.getByLabelText('Tasa activa');
    expect(campoActiva.getAttribute('aria-invalid')).toBeNull();
  });

  it('V6: GET con tasaEfectiva 0.0000', async () => {
    const tasaCero: TasaCambioVigenteDTO = {
      ...TASA,
      tasaEfectiva: '0.0000',
    };
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(tasaCero);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcv = await screen.findByLabelText('Tasa BCV');
    expect(screen.queryByRole('group', { name: 'Tasa guardada' })).toBeNull();
    expect(screen.queryByLabelText('Monto en USD')).toBeNull();

    const detailsBcv = campoBcv.closest('details') as HTMLDetailsElement | null;
    expect(detailsBcv).not.toBeNull();
    expect(detailsBcv!.open).toBe(true);
  });

  it('V7: (a) GET null; (b) GET TASA y PUT null al guardar 38,5 en BCV', async () => {
    mockApi.mockImplementation((endpoint: string) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(null);
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    const { unmount } = renderAjustes();

    const campoBcvA = await screen.findByLabelText('Tasa BCV');
    expect((campoBcvA as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('group', { name: 'Tasa guardada' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();

    unmount();

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return Promise.resolve(null);
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const campoBcvB = await screen.findByLabelText('Tasa BCV');
    fireEvent.change(campoBcvB, { target: { value: '38,5' } });

    const botonGuardar = screen.getByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    await waitFor(() => {
      const contieneError = screen
        .getAllByRole('alert')
        .some((el) => (el.textContent ?? '').includes(MENSAJE_ERROR_GUARDAR_TASA));
      expect(contieneError).toBe(true);
    });

    expect((campoBcvB as HTMLInputElement).value).toBe('38,5');

    const contieneExito = screen
      .queryAllByRole('status')
      .some((el) => (el.textContent ?? '').includes(MENSAJE_TASA_GUARDADA));
    expect(contieneExito).toBe(false);

    const grupoGuardado = screen.getByRole('group', { name: 'Tasa guardada' });
    expect(grupoGuardado.textContent).toContain('36,50');
  });

  it('V8: GET TASA, PUT rechaza Servidor caído, se guarda y se escribe 39 en Tasa activa', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (endpoint === '/finanzas/planes') return Promise.resolve([]);
      if (endpoint === '/finanzas/tasas/vigente') return Promise.resolve(TASA);
      if (endpoint === '/finanzas/tasas' && opciones?.method === 'PUT') {
        return Promise.reject(new Error('Servidor caído'));
      }
      return Promise.resolve(PERFIL_ENTRENADOR);
    });

    renderAjustes();

    const botonGuardar = await screen.findByRole('button', { name: 'Guardar tasa' });
    fireEvent.click(botonGuardar);

    await waitFor(() => {
      const contieneError = screen
        .getAllByRole('alert')
        .some((el) => (el.textContent ?? '').includes('Servidor caído'));
      expect(contieneError).toBe(true);
    });

    const campoActiva = screen.getByLabelText('Tasa activa');
    fireEvent.change(campoActiva, { target: { value: '39' } });

    expect(screen.queryByText(/Servidor caído/)).toBeNull();
  });
});
