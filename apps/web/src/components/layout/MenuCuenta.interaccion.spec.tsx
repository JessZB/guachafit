// @vitest-environment happy-dom
/**
 * 01 · UX-04 · Specs de interacción para MenuCuenta (Contrato B).
 *
 * Requisitos:
 * - Menú "Cuenta" en todos los tamaños de pantalla (Radix DropdownMenu).
 * - Disparador de 44px (h-11 w-11) con aria-haspopup="menu".
 * - Muestra correo completo y rol traducido (no crudo).
 * - Enlace a Ajustes cuando rutaAjustes no es null.
 * - Selector de tema Claro, Oscuro y Sistema (menuitemradio).
 * - Opción Cerrar sesión (menuitem).
 * - Elementos de menú con min-h-11 para área táctil accesible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MenuCuenta, type MenuCuentaProps } from './MenuCuenta';

afterEach(() => {
  cleanup();
});

function clases(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function renderMenuCuenta(propsParciales: Partial<MenuCuentaProps> = {}) {
  const propsPorDefecto: MenuCuentaProps = {
    email: 'ana.perez@correo.com',
    rol: 'entrenador',
    tema: 'light',
    onCambiarTema: vi.fn(),
    rutaAjustes: '/coach/ajustes',
    onCerrarSesion: vi.fn(),
    ...propsParciales,
  };

  render(
    <MemoryRouter>
      <MenuCuenta {...propsPorDefecto} />
    </MemoryRouter>
  );

  return propsPorDefecto;
}

async function abrirMenu(): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: 'Cuenta' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  return await screen.findByRole('menu');
}

describe('MenuCuenta · Contrato B', () => {
  it('1. Disparador: botón "Cuenta" de 44px (h-11, w-11), aria-haspopup="menu" y cerrado sin role="menu"', () => {
    renderMenuCuenta();

    const trigger = screen.getByRole('button', { name: 'Cuenta' });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    const tokens = clases(trigger);
    expect(tokens).toContain('h-11');
    expect(tokens).toContain('w-11');

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('2. Abrir: enfocar disparador y pulsar ArrowDown abre el menú (role="menu")', async () => {
    renderMenuCuenta();

    const menu = await abrirMenu();
    expect(menu).toBeTruthy();
  });

  it('3. Identidad: muestra el correo completo sin cortar y la etiqueta del rol sin texto crudo en minúsculas', async () => {
    renderMenuCuenta({ email: 'ana.perez@correo.com', rol: 'entrenador' });

    const menu = await abrirMenu();
    expect(menu.textContent).toContain('ana.perez@correo.com');
    expect(menu.textContent).toContain('Entrenador');
    expect(menu.textContent).not.toContain('entrenador');
  });

  it('4. Ajustes: con rutaAjustes muestra enlace en menuitem; con rutaAjustes={null} no hay item Ajustes', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <MenuCuenta
          email="test@correo.com"
          rol="entrenador"
          tema="light"
          onCambiarTema={() => {}}
          rutaAjustes="/coach/ajustes"
          onCerrarSesion={() => {}}
        />
      </MemoryRouter>
    );

    await abrirMenu();
    const itemAjustes = screen.getByRole('menuitem', { name: 'Ajustes' });
    expect(itemAjustes).toBeTruthy();
    const link = itemAjustes.closest('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/coach/ajustes');

    unmount();

    render(
      <MemoryRouter>
        <MenuCuenta
          email="test@correo.com"
          rol="superadmin"
          tema="light"
          onCambiarTema={() => {}}
          rutaAjustes={null}
          onCerrarSesion={() => {}}
        />
      </MemoryRouter>
    );

    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: 'Ajustes' })).toBeNull();
  });

  it('5. Tema: 3 menuitemradio (Claro, Oscuro, Sistema) en orden; tema activo con aria-checked="true"; click llama a onCambiarTema', async () => {
    const onCambiarTema = vi.fn();
    renderMenuCuenta({ tema: 'light', onCambiarTema });

    await abrirMenu();

    const itemsRadio = screen.getAllByRole('menuitemradio');
    expect(itemsRadio).toHaveLength(3);

    const [claro, oscuro, sistema] = itemsRadio;
    expect(claro.textContent).toContain('Claro');
    expect(oscuro.textContent).toContain('Oscuro');
    expect(sistema.textContent).toContain('Sistema');

    expect(claro.getAttribute('aria-checked')).toBe('true');
    expect(oscuro.getAttribute('aria-checked')).toBe('false');
    expect(sistema.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(oscuro);
    expect(onCambiarTema).toHaveBeenCalledTimes(1);
    expect(onCambiarTema).toHaveBeenCalledWith('dark');
  });

  it('6. Cerrar sesión: menuitem "Cerrar sesión" que al activarse llama a onCerrarSesion una vez', async () => {
    const onCerrarSesion = vi.fn();
    renderMenuCuenta({ onCerrarSesion });

    await abrirMenu();

    const itemCerrar = screen.getByRole('menuitem', { name: 'Cerrar sesión' });
    expect(itemCerrar).toBeTruthy();

    fireEvent.click(itemCerrar);
    expect(onCerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('7. Área táctil: cada menuitem y menuitemradio incluye la clase min-h-11', async () => {
    renderMenuCuenta({ rutaAjustes: '/coach/ajustes' });

    await abrirMenu();

    const menuItems = screen.getAllByRole('menuitem');
    for (const item of menuItems) {
      expect(clases(item)).toContain('min-h-11');
    }

    const radioItems = screen.getAllByRole('menuitemradio');
    for (const item of radioItems) {
      expect(clases(item)).toContain('min-h-11');
    }
  });
});
