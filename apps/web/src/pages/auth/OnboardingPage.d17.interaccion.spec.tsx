// @vitest-environment happy-dom
/**
 * D17 · RF-011: Comportamiento interactivo de OnboardingPage según el estado del enlace.
 * Contratos: d17-contratos.md §4.3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import { ApiError, ErrorDeConexion } from '../../lib/api-client';

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
import { OnboardingPage } from './OnboardingPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  post: MockFn;
};

const COACH = {
  coachCode: 'COACH1',
  nombre: 'Ana Perez',
  nombreComercial: 'GuachaFit Norte',
};

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

beforeEach(() => {
  mockApi.mockReset();
  mockApi.post.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OnboardingPage (D17 §4.3)', () => {
  it('sin ?coach= muestra la página sin-codigo, sin formulario ni campo de código', async () => {
    mockApi.mockResolvedValue(COACH);
    renderPagina('/onboarding');

    // Debe mostrar la página EnlaceRegistroNoValido motivo="sin-codigo"
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Este enlace de registro no es válido');
    expect(
      screen.getByText(
        'Al enlace le falta el código de tu entrenador. Pídele que te comparta su enlace de registro completo.'
      )
    ).toBeTruthy();

    // No debe haber formulario ni input de código
    expect(document.querySelector('form')).toBeNull();
    expect(screen.queryByLabelText(/código/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Crear mi cuenta' })).toBeNull();
  });

  it('con ?coach=XXXX y API 404 muestra la página invalido sin formulario', async () => {
    mockApi.mockRejectedValue(
      new ApiError(404, {
        type: 'about:blank',
        status: 404,
        title: 'Not Found',
        detail: 'El código de entrenador no es válido o no está disponible.',
        timestampUtc: '2026-11-04T00:00:00.000Z',
      })
    );

    renderPagina('/onboarding?coach=XXXX');

    // Debe mostrar la página EnlaceRegistroNoValido motivo="invalido"
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Este enlace de registro no es válido');
    expect(
      screen.getByText(
        'El enlace venció, se reemplazó por uno nuevo o no está disponible. Pídele a tu entrenador un enlace nuevo.'
      )
    ).toBeTruthy();

    expect(document.querySelector('form')).toBeNull();
    expect(screen.queryByLabelText(/código/i)).toBeNull();
  });

  it('durante la consulta muestra «Verificando tu enlace...» con role="status" y sin formulario', async () => {
    // Promesa pendiente para mantener el estado validando
    mockApi.mockImplementation(() => new Promise(() => {}));

    renderPagina('/onboarding?coach=COACH1');

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Verificando tu enlace...');
    expect(document.querySelector('form')).toBeNull();
  });

  it('error de red muestra mensaje y botón Reintentar que vuelve a consultar y muestra el formulario al recuperarse', async () => {
    mockApi.mockRejectedValueOnce(new ErrorDeConexion());

    renderPagina('/onboarding?coach=COACH1');

    expect(
      await screen.findByText(
        'No pudimos verificar tu enlace. Revisa tu conexión e inténtalo de nuevo.'
      )
    ).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();

    const botonReintentar = screen.getByRole('button', { name: 'Reintentar' });
    expect(botonReintentar).toBeTruthy();

    // Ahora la API responde con éxito
    mockApi.mockResolvedValueOnce(COACH);

    fireEvent.click(botonReintentar);

    expect(await screen.findByText(/Te vincularás con: Ana Perez/)).toBeTruthy();
    expect(document.querySelector('form')).toBeTruthy();
  });

  it('código válido muestra formulario con «Te vincularás con: …» y SIN input editable de código', async () => {
    mockApi.mockResolvedValue(COACH);

    renderPagina('/onboarding?coach=COACH1');

    expect(
      await screen.findByText(/Te vincularás con: Ana Perez · GuachaFit Norte/)
    ).toBeTruthy();

    // El formulario está presente
    expect(document.querySelector('form')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear mi cuenta' })).toBeTruthy();

    // CodigoCoachBloque desaparece: no debe existir ningún input para editar o ingresar el código
    expect(screen.queryByLabelText(/código de entrenador/i)).toBeNull();
    expect(screen.queryByLabelText(/código del entrenador/i)).toBeNull();
    expect(document.querySelector('#coach-code')).toBeNull();
    expect(document.querySelector('input[name="coachCode"]')).toBeNull();
  });

  it('el POST de registro envía el coachCode de la URL normalizado', async () => {
    mockApi.mockImplementation((endpoint: string, opts?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/alumnos/coach/')) {
        return Promise.resolve(COACH);
      }
      if (endpoint === '/alumnos/registro-publico' || opts?.method === 'POST') {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error(`endpoint no mockeado: ${endpoint}`));
    });

    renderPagina('/onboarding?coach=coach1');

    expect(await screen.findByText(/Te vincularás con: Ana Perez/)).toBeTruthy();
    rellenarFormularioValido();

    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }));

    await waitFor(() => {
      const llamada = mockApi.mock.calls.find((c) => c[0] === '/alumnos/registro-publico');
      expect(llamada).toBeTruthy();
    });

    const llamada = mockApi.mock.calls.find((c) => c[0] === '/alumnos/registro-publico');
    const opciones = llamada?.[1] as { body?: string };
    const cuerpo = JSON.parse(opciones?.body ?? '{}');

    expect(cuerpo.coachCode).toBe('COACH1');
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
  });
});
