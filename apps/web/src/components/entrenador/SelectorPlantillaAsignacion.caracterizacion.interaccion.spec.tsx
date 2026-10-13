// @vitest-environment jsdom
/**
 * Prompt 71 (caracterización, modo demo): fija el comportamiento ACTUAL del
 * `SelectorPlantillaAsignacion` en las zonas sin cobertura del spec existente
 * (buscador, cierre, "Restablecer", filtros de entrada, "Cancelar" del diálogo).
 *
 * Monta como el spec existente (demo, `MemoryRouter`, sin `QueryClientProvider`, R9).
 * `@testing-library/user-event` no está instalado: se usa `fireEvent`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ isDemoMode: true }),
}));

import { plantillasDemoActivas } from '../../lib/demo-plantillas';
import { SelectorPlantillaAsignacion } from './SelectorPlantillaAsignacion';

const ALUMNO_ID = 'demo-alumno';
const ALUMNO_NOMBRE = 'Ana Pérez';
const PLANTILLA_ELEGIDA = 'Tren Superior Hipertrofia A';
const EJERCICIO_AJUSTADO = 'Fondos en Paralelas Asistidos';

afterEach(() => {
  cleanup();
});

function renderizarSelector() {
  const onCerrar = vi.fn();
  const onAsignada = vi.fn();
  render(
    <MemoryRouter>
      <SelectorPlantillaAsignacion
        alumnoId={ALUMNO_ID}
        alumnoNombre={ALUMNO_NOMBRE}
        onCerrar={onCerrar}
        onAsignada={onAsignada}
      />
    </MemoryRouter>
  );
  return { onCerrar, onAsignada };
}

async function abrirSelector() {
  const mocks = renderizarSelector();
  await screen.findByRole('dialog', undefined, { timeout: 5000 });
  await screen.findByText(PLANTILLA_ELEGIDA, undefined, { timeout: 5000 });
  return mocks;
}

function elegirPlantilla(nombre: string = PLANTILLA_ELEGIDA): void {
  const nodo = screen.getByText(nombre);
  fireEvent.click(nodo.closest('button') ?? nodo);
}

function avanzar(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

async function irAlPaso2() {
  const mocks = await abrirSelector();
  elegirPlantilla();
  avanzar();
  await screen.findByText('Paso 2 de 3 · Revisar y ajustar', undefined, { timeout: 5000 });
  return mocks;
}

async function irAlPaso3ConUnAjuste() {
  const mocks = await irAlPaso2();
  fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
  avanzar();
  await screen.findByText('Paso 3 de 3 · Confirmar', undefined, { timeout: 5000 });
  return mocks;
}

describe('SelectorPlantillaAsignacion · caracterización: buscador', () => {
  it('filtra por nombre y al limpiar vuelve la lista completa', async () => {
    await abrirSelector();
    const total = plantillasDemoActivas().length;

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Tren Superior' } });
    const filtrada = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(filtrada.length).toBeGreaterThanOrEqual(1);
    expect(filtrada.length).toBeLessThanOrEqual(total);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(total);
  });

  it('sin coincidencias muestra "Sin coincidencias" y la pista de reintento', async () => {
    await abrirSelector();

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'zzz-sin-coincidencias' },
    });

    expect(screen.getByText('Sin coincidencias')).toBeTruthy();
    expect(screen.getByText('Prueba con otro nombre.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('SelectorPlantillaAsignacion · caracterización: cierre', () => {
  it('el botón "Cerrar" invoca onCerrar', async () => {
    const { onCerrar } = await abrirSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar selector de plantilla' }));

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('el clic en el fondo invoca onCerrar', async () => {
    const { onCerrar } = await abrirSelector();

    const dialogo = screen.getByRole('dialog');
    const fondo = dialogo.parentElement;
    expect(fondo).not.toBeNull();
    fireEvent.click(fondo as HTMLElement);

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});

describe('SelectorPlantillaAsignacion · caracterización: ajustes', () => {
  it('"Restablecer" elimina el override: desaparece "Ajustado" y el input queda vacío', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    expect(screen.getByText('Ajustado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));

    expect(screen.queryByText('Ajustado')).toBeNull();
    expect((screen.getByLabelText('Peso (kg)') as HTMLInputElement).value).toBe('');
  });

  it('series "51" no se escribe: el filtro 1–50 deja el input vacío', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
    const series = screen.getByLabelText('Series') as HTMLInputElement;
    fireEvent.change(series, { target: { value: '51' } });

    expect(series.value).toBe('');
    expect(screen.queryByText('Ajustado')).toBeNull();
  });

  it('peso "1000" no se escribe: el tope de 999 kg deja el input vacío', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
    const peso = screen.getByLabelText('Peso (kg)') as HTMLInputElement;
    fireEvent.change(peso, { target: { value: '1000' } });

    expect(peso.value).toBe('');
    expect(screen.queryByText('Ajustado')).toBeNull();
  });
});

describe('SelectorPlantillaAsignacion · caracterización: confirmación', () => {
  it('"Cancelar" del diálogo de reemplazo lo cierra sin asignar', async () => {
    await irAlPaso3ConUnAjuste();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));
    const botonConfirmar = await screen.findByRole(
      'button',
      { name: 'Sí, reemplazar' },
      { timeout: 5000 }
    );
    expect(botonConfirmar).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('button', { name: 'Sí, reemplazar' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Paso 3 de 3 · Confirmar')).toBeTruthy();
  });
});
