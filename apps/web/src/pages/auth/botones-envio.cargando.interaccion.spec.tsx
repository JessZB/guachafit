// @vitest-environment happy-dom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: Object.assign(vi.fn(), {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: mockApiClient,
  };
});

let mockLoginFn: () => Promise<void>;
let setAuthLoading: (loading: boolean) => void = () => {};

vi.mock('../../context/auth-context', () => ({
  useAuth: () => {
    const [isLoading, setIsLoading] = useState(false);
    setAuthLoading = setIsLoading;
    return {
      login: vi.fn(async (...args: any[]) => {
        setIsLoading(true);
        try {
          await mockLoginFn();
        } finally {
          setIsLoading(false);
        }
      }),
      demoLogin: vi.fn(),
      isLoading,
      isAuthenticated: false,
      avisoSesion: null,
      descartarAvisoSesion: vi.fn(),
    };
  },
}));

import { LoginPage } from './LoginPage';
import { RecuperarPage } from './RecuperarPage';
import { RestablecerPage } from './RestablecerPage';
import { OnboardingPage } from './OnboardingPage';
import { ActivacionPage } from './ActivacionPage';

describe('Botones de envío con spinner · Contrato B', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('1. LoginPage: muestra aria-busy="true", disabled y spinner mientras envía ("Entrando...") y vuelve a su estado normal al fallar', async () => {
    let resolver: () => void = () => {};
    let rechazar: (err: any) => void = () => {};
    const promesaLogin = new Promise<void>((res, rej) => {
      resolver = res;
      rechazar = rej;
    });
    mockLoginFn = () => promesaLogin;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'usuario@ejemplo.com' },
    });
    fireEvent.change(screen.getByLabelText(/^contraseña/i), {
      target: { value: 'password123' },
    });

    const boton = screen.getByRole('button', { name: /entrar/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(boton);

    // Estado durante el envío (cargando)
    await waitFor(() => {
      expect(boton.textContent).toContain('Entrando...');
    });
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull();

    // Termina con error: la pantalla sigue visible y sale del estado de carga
    await act(async () => {
      rechazar(new Error('Credenciales incorrectas'));
    });

    await waitFor(() => {
      expect(boton.textContent).toContain('Entrar');
    });
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();
  });

  it('2. RecuperarPage: muestra aria-busy="true", disabled y spinner mientras envía ("Enviando...") y sale de carga al fallar', async () => {
    let rechazarPeticion: (err: any) => void = () => {};
    const promesaEnvio = new Promise<any>((_, rej) => {
      rechazarPeticion = rej;
    });

    mockApiClient.mockImplementation(() => promesaEnvio);

    render(
      <MemoryRouter initialEntries={['/recuperar']}>
        <RecuperarPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'usuario@ejemplo.com' },
    });

    const boton = screen.getByRole('button', { name: /enviarme el enlace/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(boton);

    // Estado durante el envío
    await waitFor(() => {
      expect(boton.textContent).toContain('Enviando...');
    });
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull();

    // Termina con error: la pantalla sigue visible y sale del estado de carga
    await act(async () => {
      rechazarPeticion(new Error('Límite de envíos excedido'));
    });

    await waitFor(() => {
      expect(boton.textContent).toContain('Enviarme el enlace');
    });
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();
  });

  it('3. RestablecerPage: muestra aria-busy="true", disabled y spinner mientras guarda ("Guardando...") y sale de carga al fallar', async () => {
    let rechazarPeticion: (err: any) => void = () => {};
    const promesaRestablecer = new Promise<any>((_, rej) => {
      rechazarPeticion = rej;
    });

    mockApiClient.mockImplementation(() => promesaRestablecer);

    render(
      <MemoryRouter initialEntries={['/restablecer?token=token-valido-123']}>
        <RestablecerPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^nueva contraseña/i), {
      target: { value: 'NuevaContrasena123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirma tu nueva contraseña/i), {
      target: { value: 'NuevaContrasena123!' },
    });

    const boton = screen.getByRole('button', {
      name: /guardar nueva contraseña/i,
    }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(boton);

    // Estado durante el guardado
    await waitFor(() => {
      expect(boton.textContent).toContain('Guardando...');
    });
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull();

    // Termina con error general: la pantalla sigue visible y sale de carga
    await act(async () => {
      rechazarPeticion(new Error('Fallo temporal de servidor'));
    });

    await waitFor(() => {
      expect(boton.textContent).toContain('Guardar nueva contraseña');
    });
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();
  });

  it('4. OnboardingPage: muestra aria-busy="true", disabled y spinner mientras registra ("Creando tu cuenta...") y sale de carga al fallar', async () => {
    let rechazarRegistro: (err: any) => void = () => {};
    const promesaRegistro = new Promise<any>((_, rej) => {
      rechazarRegistro = rej;
    });

    mockApiClient.mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.includes('/alumnos/coach/')) {
        return Promise.resolve({
          coachCode: 'COACH1',
          nombre: 'Ana Coach',
          nombreComercial: 'Centro Fitness',
          activo: true,
          captacionPausada: false,
        });
      }
      return promesaRegistro;
    });

    render(
      <MemoryRouter initialEntries={['/onboarding?coach=COACH1']}>
        <OnboardingPage />
      </MemoryRouter>
    );

    // Esperar a que el coach sea resuelto y el formulario esté montado
    const botonCrear = (await screen.findByRole('button', {
      name: /crear mi cuenta/i,
    })) as HTMLButtonElement;

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Carlos' } });
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Mendoza' } });
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'carlos@ejemplo.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta99!' } });
    fireEvent.change(screen.getByLabelText('Número de documento'), {
      target: { value: '24123456' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '1998-05-14' },
    });
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '4121234567' } });

    expect(botonCrear.disabled).toBe(false);
    expect(botonCrear.getAttribute('aria-busy')).toBeNull();
    expect(botonCrear.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(botonCrear);

    // Estado durante el registro
    await waitFor(() => {
      expect(botonCrear.textContent).toContain('Creando tu cuenta...');
    });
    expect(botonCrear.disabled).toBe(true);
    expect(botonCrear.getAttribute('aria-busy')).toBe('true');
    expect(botonCrear.querySelector('svg.animate-spin')).not.toBeNull();

    // Termina con error: la pantalla sigue visible y sale de carga
    await act(async () => {
      rechazarRegistro(new Error('Fallo de red en registro'));
    });

    await waitFor(() => {
      expect(botonCrear.textContent).toContain('Crear mi cuenta');
    });
    expect(botonCrear.disabled).toBe(false);
    expect(botonCrear.getAttribute('aria-busy')).toBeNull();
    expect(botonCrear.querySelector('svg.animate-spin')).toBeNull();
  });

  it('5. ActivacionPage: muestra aria-busy="true", disabled y spinner mientras crea ("Creando contraseña...") y sale de carga al fallar', async () => {
    let rechazarActivacion: (err: any) => void = () => {};
    const promesaActivacion = new Promise<any>((_, rej) => {
      rechazarActivacion = rej;
    });

    mockApiClient.mockImplementation(() => promesaActivacion);

    render(
      <MemoryRouter initialEntries={['/activar?token=token-valido-123']}>
        <ActivacionPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^nueva contraseña/i), {
      target: { value: 'ContrasenaSegura2026!' },
    });
    fireEvent.change(screen.getByLabelText(/^confirma tu contraseña/i), {
      target: { value: 'ContrasenaSegura2026!' },
    });

    const boton = screen.getByRole('button', {
      name: /crear contraseña/i,
    }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();

    fireEvent.click(boton);

    // Estado durante la activación
    await waitFor(() => {
      expect(boton.textContent).toContain('Creando contraseña...');
    });
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.querySelector('svg.animate-spin')).not.toBeNull();

    // Termina con error: la pantalla sigue visible y sale de carga
    await act(async () => {
      rechazarActivacion(new Error('Token expirado'));
    });

    await waitFor(() => {
      expect(boton.textContent).toContain('Crear contraseña');
    });
    expect(boton.disabled).toBe(false);
    expect(boton.getAttribute('aria-busy')).toBeNull();
    expect(boton.querySelector('svg.animate-spin')).toBeNull();
  });
});
