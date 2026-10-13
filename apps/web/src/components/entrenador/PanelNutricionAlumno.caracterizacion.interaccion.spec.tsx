// @vitest-environment jsdom
/**
 * PanelNutricionAlumno · caracterización de interacción (Ola 2, prompt 70).
 *
 * Fija el comportamiento ACTUAL en verde sobre el código sin tocar, antes de la
 * extracción a componentes atómicos. Monta directo (el panel no usa TanStack
 * Query: R9 prohíbe introducir `QueryClientProvider`). Consultas por rol,
 * label o texto, con `fireEvent` (`@testing-library/user-event` no instalado).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

import { apiClient } from '../../lib/api-client';
import { PanelNutricionAlumno } from './PanelNutricionAlumno';

type MockApi = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockApi;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDemo() {
  mockApi.mockImplementation(() => Promise.resolve(null));
  render(
    <PanelNutricionAlumno
      alumnoUsuarioId="alumno-1"
      alumnoPerfilId="perfil-1"
      alumnoNombre="Ana"
      isDemoMode
    />
  );
}

function renderReal(config: { metas: unknown; checkins: unknown }) {
  mockApi.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/metas')) {
      if (config.metas instanceof Error) return Promise.reject(config.metas);
      return Promise.resolve(config.metas);
    }
    if (typeof url === 'string' && url.includes('/checkins')) {
      if (config.checkins instanceof Error) return Promise.reject(config.checkins);
      return Promise.resolve(config.checkins);
    }
    return Promise.resolve(null);
  });
  render(
    <PanelNutricionAlumno alumnoUsuarioId="alumno-1" alumnoNombre="Ana" isDemoMode={false} />
  );
}

async function abrirEditorDemo() {
  renderDemo();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar metas' }));
  await screen.findByRole('dialog');
}

describe('PanelNutricionAlumno · caracterización (demo: secciones)', () => {
  it('muestra las tres secciones con el nombre del alumno', async () => {
    renderDemo();

    expect(
      await screen.findByRole('heading', { name: 'Metas nutricionales de Ana' })
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Zona horaria del alumno' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reportes de los últimos 30 días' })).toBeTruthy();
  });

  it('con metas demo el botón del editor está habilitado como "Editar metas"', async () => {
    renderDemo();

    const boton = (await screen.findByRole('button', {
      name: 'Editar metas',
    })) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('muestra los objetivos demo y los recursos educativos con sus enlaces', async () => {
    renderDemo();

    expect(await screen.findByText('2200 kcal')).toBeTruthy();
    expect(screen.getByText('160 g')).toBeTruthy();
    expect(screen.getByText('Lista de compras semanal')).toBeTruthy();
    expect(screen.getByText('Guía de porciones (PDF subido)')).toBeTruthy();
    expect(screen.getByText('Recursos educativos')).toBeTruthy();
  });

  it('resume la ventana con días reportados y sin reporte, y declara el alcance de la lista', async () => {
    renderDemo();

    expect(await screen.findByText(/10 días reportados/)).toBeTruthy();
    expect(screen.getByText(/sin reporte/)).toBeTruthy();
    expect(
      screen.getByText('Se muestran los últimos 30 días; los reportes anteriores no aparecen en esta lista.')
    ).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy();
  });

  it('la primera página trae días sin reporte, el día en curso y avisos de fotos ausentes', async () => {
    renderDemo();
    await screen.findByRole('navigation', { name: 'Paginación' });

    expect(screen.getAllByText(/Sin reporte ese día/).length).toBeGreaterThan(0);
    expect(screen.getByText(/El día sigue en curso/)).toBeTruthy();
    expect(screen.getAllByText(/no adjuntó fotos de platos/).length).toBeGreaterThan(0);
  });

  it('la zona horaria declara la ventana del reporte y en demo el guardado se simula con éxito', async () => {
    renderDemo();

    expect(await screen.findByText(/Su reporte se abre de/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar zona horaria' }));
    expect(await screen.findByText('Zona horaria guardada.')).toBeTruthy();
  });
});

describe('PanelNutricionAlumno · caracterización (demo: editor de metas)', () => {
  it('abre el diálogo con los campos precargados desde las metas demo', async () => {
    await abrirEditorDemo();

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('heading', { name: 'Metas nutricionales' })).toBeTruthy();
    expect((screen.getByLabelText('Calorías (kcal)') as HTMLInputElement).value).toBe('2200');
    expect((screen.getByLabelText('Proteína (g)') as HTMLInputElement).value).toBe('160');
    expect((screen.getByLabelText('Agua (L)') as HTMLInputElement).value).toBe('3.00');
    expect(screen.getByRole('button', { name: 'Guardar metas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Añadir recurso' })).toBeTruthy();
  });

  it('guardar en demo simula el cambio y lo declara sin llamar a la API', async () => {
    await abrirEditorDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar metas' }));

    expect(
      await screen.findByText(
        'Modo demostración: el cambio solo se simuló en esta pantalla; no se guardó.'
      )
    ).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('rechaza decimales en calorías con el mensaje por campo y sin llamar a la API', async () => {
    await abrirEditorDemo();
    fireEvent.change(screen.getByLabelText('Calorías (kcal)'), { target: { value: '2200.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar metas' }));

    expect(
      await screen.findByText('Calorías: escribe un número entero entre 1 y 15000, sin decimales.')
    ).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('cerrar con cambios pide confirmación; sin cambios cierra directo', async () => {
    await abrirEditorDemo();
    fireEvent.change(screen.getByLabelText('Calorías (kcal)'), { target: { value: '2300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(await screen.findByText('¿Salir sin guardar?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cerrar sin cambios no pide confirmación', async () => {
    await abrirEditorDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('¿Salir sin guardar?')).toBeNull();
  });
});

describe('PanelNutricionAlumno · caracterización (real: estados honestos)', () => {
  it('sin metas muestra el vacío explícito y ofrece "Definir metas" habilitado', async () => {
    renderReal({ metas: null, checkins: [] });

    expect(await screen.findByText(/Sin metas configuradas/)).toBeTruthy();
    const boton = (await screen.findByRole('button', {
      name: 'Definir metas',
    })) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
  });

  it('fallo de metas muestra alerta con reintento, que vuelve a pedir las metas', async () => {
    renderReal({ metas: new Error('Fallo de red'), checkins: [] });

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Fallo de red');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => {
      const llamadasMetas = mockApi.mock.calls.filter(
        (llamada) =>
          typeof llamada[0] === 'string' && (llamada[0] as string).includes('/metas')
      );
      expect(llamadasMetas.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('fallo de reportes muestra alerta con reintento sin ocultar las metas', async () => {
    renderReal({ metas: null, checkins: new Error('No hay conexión') });

    const alertas = await screen.findAllByRole('alert');
    expect(alertas.some((alerta) => alerta.textContent?.includes('No hay conexión'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
