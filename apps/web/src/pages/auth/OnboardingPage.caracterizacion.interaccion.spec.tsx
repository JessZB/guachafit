// @vitest-environment jsdom
/**
 * Prompt 86 (Ola 3, modulo `onboarding`) · specs de caracterizacion de `OnboardingPage`.
 *
 * Fijan el comportamiento ACTUAL de la vista sobre el codigo vigente (base `0660780`):
 * describen lo que hay, no lo que deberia haber. Si algo parece un bug, se caracteriza
 * tal cual y se reporta como WARNING en
 * `.opencode-prompts/reportes/onboarding/86-onboarding-validacion.reporte.md`.
 *
 * Montaje (R9: el archivo usa `useState`/`useEffect` + `apiClient` directo, sin TanStack
 * Query): `MemoryRouter` con `Routes` (`/onboarding` + `/login` para verificar la
 * redireccion), `api-client` parcialmente mockeado (callable). Sin `QueryClientProvider`.
 *
 * Selectores solo por rol/label/texto accesible (R5: deben sobrevivir al refactor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Modalidad, TipoDocumento } from '@guachafit/shared';

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
import { MENSAJE_COACH_NO_DISPONIBLE } from '../../lib/onboarding-links';
import { OnboardingPage } from './OnboardingPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
};

const COACH = {
  coachCode: 'COACH1',
  nombre: 'Ana Perez',
  nombreComercial: 'GuachaFit Norte',
};

function mockCoachResuelve() {
  mockApi.mockImplementation((endpoint: string) => {
    if (typeof endpoint === 'string' && endpoint.startsWith('/alumnos/coach/')) {
      return Promise.resolve(COACH);
    }
    if (endpoint === '/alumnos/registro-publico') {
      return Promise.resolve({ ok: true });
    }
    return Promise.reject(new Error(`endpoint no mockeado: ${endpoint}`));
  });
}

function renderPagina(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={<p>pagina de login</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function rellenarFormularioValido() {
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Carlos Alberto' } });
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Mendoza' } });
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'carlos@email.com' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta99' } });
  fireEvent.change(screen.getByLabelText('Número de documento'), {
    target: { value: '24123456' },
  });
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
    target: { value: '1998-05-14' },
  });
  fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '4121234567' } });
}

async function esperarCoachValido() {
  expect(await screen.findByText(/Te vincularás con: Ana Perez/)).toBeTruthy();
}

beforeEach(() => {
  mockApi.mockReset();
  mockApi.get.mockReset();
  mockApi.post.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OnboardingPage caracterizacion (WU-E RF-011)', () => {
  it('1: sin ?coach= muestra la ayuda, el boton queda deshabilitado y no llama a la API', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding');

    expect(
      screen.getByText('Pega o escribe el código que te compartió tu entrenador.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toHaveProperty(
      'disabled',
      true
    );
    await new Promise((r) => setTimeout(r, 600));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('2: con ?coach= valido resuelve contra GET /alumnos/coach/:code con skipAuth y habilita el envio', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=coach1');

    await esperarCoachValido();
    expect(mockApi).toHaveBeenCalledWith('/alumnos/coach/COACH1', { skipAuth: true });
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toHaveProperty(
      'disabled',
      false
    );
  });

  it('3: codigo con formato invalido muestra el mensaje de no disponible sin llamar a la API', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=ab!');

    expect(await screen.findByText(MENSAJE_COACH_NO_DISPONIBLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toHaveProperty(
      'disabled',
      true
    );
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('4: si el GET del coach falla muestra el mensaje de no disponible y bloquea el envio', async () => {
    mockApi.mockRejectedValue(new Error('no existe'));
    renderPagina('/onboarding?coach=XXXX');

    expect(await screen.findByText(MENSAJE_COACH_NO_DISPONIBLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('5: registro exitoso hace POST a /alumnos/registro-publico con skipAuth y el coachCode validado', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=coach1');
    await esperarCoachValido();
    rellenarFormularioValido();

    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/alumnos/registro-publico',
      expect.objectContaining({ method: 'POST', skipAuth: true })
    ));
    const opciones = mockApi.mock.calls.find((c) => c[0] === '/alumnos/registro-publico')?.[1] as {
      body: string;
    };
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo).toMatchObject({
      coachCode: 'COACH1',
      nombres: 'Carlos Alberto',
      apellidos: 'Mendoza',
      email: 'carlos@email.com',
      password: 'secreta99',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      modalidad: Modalidad.PRESENCIAL,
    });
    expect(await screen.findByText('¡Registro exitoso!')).toBeTruthy();
  });

  it('6: tras el exito redirige a /login a los ~2.5s', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=coach1');
    await esperarCoachValido();
    rellenarFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
    expect(await screen.findByText('¡Registro exitoso!')).toBeTruthy();

    expect(await screen.findByText('pagina de login', undefined, { timeout: 5000 })).toBeTruthy();
  });

  it('7: si el POST falla con 409 muestra el error y el enlace a iniciar sesion', async () => {
    mockApi.mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/alumnos/coach/')) {
        return Promise.resolve(COACH);
      }
      const error = new Error('el correo ya esta registrado') as Error & { status: number };
      error.status = 409;
      return Promise.reject(error);
    });
    renderPagina('/onboarding?coach=coach1');
    await esperarCoachValido();
    rellenarFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent ?? '').toContain('el correo ya esta registrado');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeTruthy();
  });

  it('8: fecha de nacimiento futura no hace POST (el max nativo bloquea el envio)', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=coach1');
    await esperarCoachValido();
    rellenarFormularioValido();
    const manana = new Date(Date.now() + 86400000);
    const iso = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: iso } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    await new Promise((r) => setTimeout(r, 500));
    expect(mockApi.mock.calls.some((c) => c[0] === '/alumnos/registro-publico')).toBe(false);
    // WARNING-86-1: el `max` nativo frena el submit antes de `handleSubmit`, asi que el
    // mensaje propio ('La fecha de nacimiento no puede ser futura.') no llega a mostrarse.
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toBeTruthy();
  });

  it('9: whatsapp en blanco bloquea el envio sin POST (mensaje propio)', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach=coach1');
    await esperarCoachValido();
    rellenarFormularioValido();
    // WARNING-86-2: con el campo totalmente vacio el `required` nativo frena el submit;
    // con espacios se alcanza la validacion propia (`trim().length === 0`).
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    expect(await screen.findByText('Escribe tu número de WhatsApp.')).toBeTruthy();
    expect(mockApi.mock.calls.some((c) => c[0] === '/alumnos/registro-publico')).toBe(false);
  });

  it('10: el alias legado ?coach_code= tambien resuelve al coach', async () => {
    mockCoachResuelve();
    renderPagina('/onboarding?coach_code=coach1');

    await esperarCoachValido();
    expect(mockApi).toHaveBeenCalledWith('/alumnos/coach/COACH1', { skipAuth: true });
  });
});
