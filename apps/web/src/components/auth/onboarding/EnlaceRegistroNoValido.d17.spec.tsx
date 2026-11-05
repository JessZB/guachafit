// @vitest-environment happy-dom
/**
 * D17 · RF-011: Página / componente de enlace de registro no válido.
 * Contratos: d17-contratos.md §4.1
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EnlaceRegistroNoValido } from './EnlaceRegistroNoValido';

afterEach(() => {
  cleanup();
});

describe('EnlaceRegistroNoValido (D17 §4.1)', () => {
  it('título h1 exacto «Este enlace de registro no es válido»', () => {
    render(
      <MemoryRouter>
        <EnlaceRegistroNoValido motivo="sin-codigo" />
      </MemoryRouter>
    );

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Este enlace de registro no es válido');
  });

  it('motivo «sin-codigo» muestra el texto exacto del contrato y ningún role="alert"', () => {
    render(
      <MemoryRouter>
        <EnlaceRegistroNoValido motivo="sin-codigo" />
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        'Al enlace le falta el código de tu entrenador. Pídele que te comparta su enlace de registro completo.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('motivo «invalido» muestra el texto exacto del contrato y ningún role="alert"', () => {
    render(
      <MemoryRouter>
        <EnlaceRegistroNoValido motivo="invalido" />
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        'El enlace venció, se reemplazó por uno nuevo o no está disponible. Pídele a tu entrenador un enlace nuevo.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('enlace a /login con el texto exacto «Ya tengo cuenta · Iniciar sesión»', () => {
    render(
      <MemoryRouter>
        <EnlaceRegistroNoValido motivo="invalido" />
      </MemoryRouter>
    );

    const enlace = screen.getByRole('link', {
      name: 'Ya tengo cuenta · Iniciar sesión',
    });
    expect(enlace).toBeTruthy();
    expect(enlace.getAttribute('href')).toBe('/login');
  });

  it('no renderiza ningún input ni elemento form', () => {
    const { container } = render(
      <MemoryRouter>
        <EnlaceRegistroNoValido motivo="sin-codigo" />
      </MemoryRouter>
    );

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
