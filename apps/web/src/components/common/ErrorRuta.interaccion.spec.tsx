// @vitest-environment jsdom
/**
 * Prompt 54, ER1 — componente `ErrorRuta` (fase verde: import estático).
 *
 * Contratos bajo prueba (C1–C5):
 * - C1 Nueva versión (error de carga de módulo + en línea): `role="alert"`,
 *   `h1` con `Hay una versión nueva de GUACHAFIT`, detalle
 *   `Esta pantalla no se pudo abrir porque la app se actualizó. Recarga para continuar.`,
 *   un único botón `Recargar` que llama a `window.location.reload()` una vez.
 * - C2 Sin conexión (error de carga de módulo + sin línea): título
 *   `No se pudo abrir esta pantalla sin conexión`, detalle
 *   `Conéctate a internet y vuelve a intentarlo.`, botón `Reintentar` que recarga.
 * - C3 Inesperado (cualquier otro error): título
 *   `Algo salió mal al abrir esta pantalla`, detalle
 *   `Vuelve a intentarlo. Si sigue pasando, ve al inicio.`, botones `Reintentar`
 *   + `Ir al inicio`; `Ir al inicio` navega a `/`.
 * - C4 El texto técnico del error nunca aparece en el documento.
 * - C5 El `h1` recibe el foco al montar.
 *
 * Montaje: `ErrorRuta` como `errorElement` de un `createMemoryRouter` cuya ruta
 * `/ruta-rota` lanza el error al renderizar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ErrorRuta } from './ErrorRuta';

function fijarEnLinea(enLinea: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    value: enLinea,
    configurable: true,
    writable: true,
  });
}

let reloadMock: ReturnType<typeof vi.fn<() => void>>;
let ubicacionRedefinida = false;
let descriptorUbicacionOriginal: PropertyDescriptor | undefined;

function instalarReloadMock(): void {
  reloadMock = vi.fn();
  ubicacionRedefinida = false;
  descriptorUbicacionOriginal = Object.getOwnPropertyDescriptor(window, 'location');
  try {
    vi.spyOn(window.location, 'reload').mockImplementation(() => {
      reloadMock();
    });
  } catch {
    // jsdom no permite espiar `reload` directamente: se sustituye `window.location`.
    Object.defineProperty(window, 'location', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { ...window.location, reload: reloadMock },
    });
    ubicacionRedefinida = true;
    return;
  }
  // Si el espía no quedó como `reload` efectivo, se fuerza el mock directo.
  try {
    const actual = (window.location as unknown as { reload: unknown }).reload;
    if (actual !== reloadMock) {
      Object.defineProperty(window.location, 'reload', {
        configurable: true,
        writable: true,
        value: reloadMock,
      });
    }
  } catch {
    // jsdom sin navegación: el espía ya cubre el stub.
  }
}

function restaurarUbicacion(): void {
  if (ubicacionRedefinida && descriptorUbicacionOriginal) {
    Object.defineProperty(window, 'location', descriptorUbicacionOriginal);
  }
  ubicacionRedefinida = false;
  descriptorUbicacionOriginal = undefined;
}

async function montarConError(error: unknown, enLinea: boolean): Promise<void> {
  fijarEnLinea(enLinea);
  function PantallaQueFalla(): never {
    throw error;
  }
  const router = createMemoryRouter(
    [
      {
        path: '/ruta-rota',
        element: <PantallaQueFalla />,
        errorElement: <ErrorRuta />,
      },
      {
        path: '/',
        element: <p>Inicio de prueba</p>,
      },
    ],
    { initialEntries: ['/ruta-rota'] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  instalarReloadMock();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restaurarUbicacion();
  fijarEnLinea(true);
});

describe('ErrorRuta (ER1)', () => {
  it('C1: versión nueva muestra alert + título + detalle y Recargar recarga una vez', async () => {
    await montarConError(
      new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx'),
      true,
    );

    const alerta = await screen.findByRole('alert');
    expect(alerta).toBeTruthy();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Hay una versión nueva de GUACHAFIT',
      }),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        'Esta pantalla no se pudo abrir porque la app se actualizó. Recarga para continuar.',
      ),
    ).toBeTruthy();

    const botones = await screen.findAllByRole('button');
    expect(botones).toHaveLength(1);
    const recargar = await screen.findByRole('button', { name: 'Recargar' });
    fireEvent.click(recargar);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('C2: sin conexión muestra su título + detalle y Reintentar recarga', async () => {
    await montarConError(
      new TypeError('Failed to fetch dynamically imported module: http://x/a.tsx'),
      false,
    );

    await screen.findByRole('alert');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'No se pudo abrir esta pantalla sin conexión',
      }),
    ).toBeTruthy();
    expect(
      await screen.findByText('Conéctate a internet y vuelve a intentarlo.'),
    ).toBeTruthy();

    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
    fireEvent.click(reintentar);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('C3: inesperado muestra su título + detalle y «Ir al inicio» va a `/`', async () => {
    await montarConError(new Error('Fallo inesperado de prueba'), true);

    await screen.findByRole('alert');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Algo salió mal al abrir esta pantalla',
      }),
    ).toBeTruthy();
    expect(
      await screen.findByText('Vuelve a intentarlo. Si sigue pasando, ve al inicio.'),
    ).toBeTruthy();

    await screen.findByRole('button', { name: 'Reintentar' });
    const irAlInicio = await screen.findByRole('button', { name: 'Ir al inicio' });
    fireEvent.click(irAlInicio);
    expect(await screen.findByText('Inicio de prueba')).toBeTruthy();
  });

  it('C4: el texto técnico del error nunca aparece en el documento', async () => {
    await montarConError(
      new Error('Cannot read properties of undefined (reading x)'),
      true,
    );

    await screen.findByRole('alert');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Algo salió mal al abrir esta pantalla',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText('Cannot read properties of undefined (reading x)'),
    ).toBeNull();
  });

  it('C5: el `h1` recibe el foco al montar', async () => {
    await montarConError(new Error('Fallo inesperado de prueba'), true);

    const titulo = await screen.findByRole('heading', {
      level: 1,
      name: 'Algo salió mal al abrir esta pantalla',
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(titulo);
    });
  });
});
