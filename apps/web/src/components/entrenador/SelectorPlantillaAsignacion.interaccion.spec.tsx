// @vitest-environment jsdom
/**
 * Lote E6 · C2 (fase roja): interacción del selector de plantilla en 3 pasos (modo demo).
 *
 * El componente actual muestra todo a la vez: no existen los pasos ni "Siguiente", el buscador
 * es `type="text"` sin `role="searchbox"`, no hay `role="list"` ni días plegables, los ajustes
 * están siempre desplegados y usa `text-[11px]` en 27 textos. Estos tests fijan el contrato nuevo
 * del prompt 32 y deben fallar por esas aserciones, no por los mocks: el modal SÍ renderiza con
 * `useAuth` mockeado en demo (el test de tamaños lo demuestra al listar los 11 px del árbol).
 *
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
/** Primera plantilla demo activa: 2 días, 4 ejercicios por día. */
const PLANTILLA_ELEGIDA = 'Tren Superior Hipertrofia A';
/** Ejercicio del día 1 (abierto por defecto) que se ajusta en los pasos 2/3. */
const EJERCICIO_AJUSTADO = 'Fondos en Paralelas Asistidos';
/** `textoEjercicioPlantilla` de ese ejercicio (C1): 3 × 12, peso corporal, RPE 8.0, 90 s. */
const TEXTO_EJERCICIO = '3 × 12 · Peso corporal · Esfuerzo 8 · 1 min 30 s';
const RESUMEN_REEMPLAZAR =
  'Se asignará «Tren Superior Hipertrofia A» a Ana Pérez con 1 ajuste. Reemplaza su rutina actual.';

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

/** Espera el modal y una plantilla demo: prueba que renderiza en demo (no falla por mocks). */
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

/** Paso 1 → 2 con la plantilla demo elegida. */
async function irAlPaso2() {
  const mocks = await abrirSelector();
  elegirPlantilla();
  avanzar();
  await screen.findByText('Paso 2 de 3 · Revisar y ajustar', undefined, { timeout: 5000 });
  return mocks;
}

/** Paso 1 → 3 con un ajuste de peso válido ('70') hecho en el paso 2. */
async function irAlPaso3ConUnAjuste() {
  const mocks = await irAlPaso2();
  fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
  fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
  avanzar();
  await screen.findByText('Paso 3 de 3 · Confirmar', undefined, { timeout: 5000 });
  return mocks;
}

/** Botones de día del acordeón: disclosures con `aria-expanded` que controlan su panel de día (`aria-controls`). Los "Ajustar {ejercicio}" también llevan `aria-expanded` (son disclosures), pero no `aria-controls`. */
function botonesDeDia(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((boton) => boton.hasAttribute('aria-expanded') && boton.hasAttribute('aria-controls'));
}

/** Ningún elemento del modal usa `text-[11px]` ni `text-[10px]` (árbol completo del paso). */
function exigirSinTextosPequenos(): void {
  const modal = screen.getByRole('dialog');
  const violaciones = Array.from(modal.querySelectorAll<HTMLElement>('*'))
    .filter((el) => typeof el.className === 'string' && /text-\[1[01]px\]/.test(el.className))
    .map((el) => `<${el.tagName.toLowerCase()}> ${el.className}`);
  expect(violaciones).toEqual([]);
}

describe('SelectorPlantillaAsignacion · C2.1 Paso 1', () => {
  it('muestra el título del paso, buscador y lista con una fila por plantilla activa', async () => {
    await abrirSelector();

    expect(screen.getByText('Paso 1 de 3 · Elegir plantilla')).toBeTruthy();

    const buscador =
      screen.queryByRole('searchbox') ?? document.querySelector('input[type="search"]');
    expect(buscador).toBeTruthy();

    const lista = screen.getByRole('list');
    expect(within(lista).getAllByRole('listitem')).toHaveLength(plantillasDemoActivas().length);
    for (const plantilla of plantillasDemoActivas()) {
      expect(within(lista).getByText(plantilla.nombre)).toBeTruthy();
    }
  });

  it('"Siguiente" está deshabilitado hasta elegir plantilla; al elegirla se habilita y no hay ajustes ni "Paso 2 de 3"', async () => {
    await abrirSelector();

    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    elegirPlantilla();

    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(screen.queryByText('Peso (kg)')).toBeNull();
    expect(screen.queryByText('Series')).toBeNull();
    expect(screen.queryByText('Repeticiones')).toBeNull();
    expect(screen.queryByText(/Paso 2 de 3/)).toBeNull();
  });
});

describe('SelectorPlantillaAsignacion · C2.2 Paso 2', () => {
  it('los días son botones con aria-expanded: el primero abierto y el resto cerrados; al pulsar el segundo se alternan', async () => {
    await irAlPaso2();

    expect(screen.getByText('Paso 2 de 3 · Revisar y ajustar')).toBeTruthy();

    const dias = botonesDeDia();
    expect(dias).toHaveLength(2);
    expect(dias[0].getAttribute('aria-expanded')).toBe('true');
    expect(dias[1].getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(dias[1]);
    expect(dias[1].getAttribute('aria-expanded')).toBe('true');
    expect(dias[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('el día abierto muestra cada ejercicio con su nombre y su texto; los inputs aparecen solo tras "Ajustar {nombre}"', async () => {
    await irAlPaso2();

    expect(screen.getByText('Press Plano con Mancuernas')).toBeTruthy();
    expect(screen.getByText(EJERCICIO_AJUSTADO)).toBeTruthy();
    expect(screen.getByText(TEXTO_EJERCICIO)).toBeTruthy();

    expect(screen.queryByLabelText('Peso (kg)')).toBeNull();
    expect(screen.queryByLabelText('Series')).toBeNull();
    expect(screen.queryByLabelText('Repeticiones')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));

    expect(screen.getByLabelText('Peso (kg)')).toBeTruthy();
    expect(screen.getByLabelText('Series')).toBeTruthy();
    expect(screen.getByLabelText('Repeticiones')).toBeTruthy();
  });

  it('un peso de ajuste válido ("70") marca el ejercicio como "Ajustado"', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });

    expect(screen.getByText('Ajustado')).toBeTruthy();
  });

  it('"Atrás" vuelve al paso 1 conservando la plantilla elegida', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));

    expect(screen.getByText('Paso 1 de 3 · Elegir plantilla')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

describe('SelectorPlantillaAsignacion · C2.3 Paso 3', () => {
  it('muestra los radios "Reemplazar" (marcado) y "Añadir", y el resumen con el alumno y 1 ajuste', async () => {
    await irAlPaso3ConUnAjuste();

    expect(screen.getByText('Paso 3 de 3 · Confirmar')).toBeTruthy();

    const reemplazar = screen.getByRole('radio', {
      name: /Reemplazar la rutina actual/,
    }) as HTMLInputElement;
    const anadir = screen.getByRole('radio', {
      name: /Añadir a la rutina actual/,
    }) as HTMLInputElement;
    expect(reemplazar.checked).toBe(true);
    expect(anadir.checked).toBe(false);

    expect(screen.getByRole('dialog').textContent).toContain(RESUMEN_REEMPLAZAR);
  });

  it('al marcar "Añadir" el resumen cambia a "Se añade a su rutina actual."', async () => {
    await irAlPaso3ConUnAjuste();

    fireEvent.click(screen.getByRole('radio', { name: /Añadir a la rutina actual/ }));

    const texto = screen.getByRole('dialog').textContent ?? '';
    expect(texto).toContain('Se añade a su rutina actual.');
    expect(texto).not.toContain('Reemplaza su rutina actual.');
  });
});

describe('SelectorPlantillaAsignacion · C2.4 Asignar', () => {
  it('con "Reemplazar", "Asignar rutina" abre la confirmación; al confirmar muestra el éxito y en modo demo no llama a onAsignada', async () => {
    const { onAsignada } = await irAlPaso3ConUnAjuste();

    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));

    const botonConfirmar = await screen.findByRole(
      'button',
      { name: 'Sí, reemplazar' },
      { timeout: 5000 }
    );
    const dialogoConfirmacion = botonConfirmar.closest('[role="alertdialog"], [role="dialog"]');
    expect(dialogoConfirmacion).not.toBeNull();
    expect(dialogoConfirmacion?.textContent).toContain('Reemplazar la rutina actual');

    fireEvent.click(botonConfirmar);

    const exito = await screen.findByRole('status', undefined, { timeout: 5000 });
    expect(exito.textContent).toContain(ALUMNO_NOMBRE);
    expect(onAsignada).not.toHaveBeenCalled();
  });

  it('con "Añadir" se asigna sin el diálogo de reemplazo', async () => {
    const { onAsignada } = await irAlPaso3ConUnAjuste();

    fireEvent.click(screen.getByRole('radio', { name: /Añadir a la rutina actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));

    expect(screen.queryByRole('dialog', { name: 'Reemplazar la rutina actual' })).toBeNull();
    expect(screen.queryByRole('alertdialog', { name: 'Reemplazar la rutina actual' })).toBeNull();

    const exito = await screen.findByRole('status', undefined, { timeout: 5000 });
    expect(exito.textContent).toContain(ALUMNO_NOMBRE);
    expect(onAsignada).not.toHaveBeenCalled();
  });
});

describe('SelectorPlantillaAsignacion · C2.5 Ajuste inválido', () => {
  it('con reps "10-8", "Asignar rutina" vuelve al paso 2 con un role="alert" que nombra el ejercicio y su día abierto', async () => {
    await irAlPaso2();

    fireEvent.click(screen.getByRole('button', { name: `Ajustar ${EJERCICIO_AJUSTADO}` }));
    const reps = screen.getByLabelText('Repeticiones') as HTMLInputElement;
    fireEvent.change(reps, { target: { value: '10-8' } });
    expect(reps.value).toBe('10-8'); // estado parcial: el filtro lo deja escribir

    avanzar();
    await screen.findByText('Paso 3 de 3 · Confirmar', undefined, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar rutina' }));

    await screen.findByText('Paso 2 de 3 · Revisar y ajustar', undefined, { timeout: 5000 });
    const alertas = screen.getAllByRole('alert');
    expect(alertas.some((alerta) => alerta.textContent?.includes(EJERCICIO_AJUSTADO))).toBe(true);

    const dias = botonesDeDia();
    expect(dias[0].getAttribute('aria-expanded')).toBe('true');
  });
});

describe('SelectorPlantillaAsignacion · C2.6 Tamaños', () => {
  it('paso 1: ningún elemento del modal usa text-[11px] ni text-[10px]', async () => {
    await abrirSelector();
    exigirSinTextosPequenos();
  });

  it('paso 2: ningún elemento del modal usa text-[11px] ni text-[10px]', async () => {
    await irAlPaso2();
    exigirSinTextosPequenos();
  });

  it('paso 3: ningún elemento del modal usa text-[11px] ni text-[10px]', async () => {
    await irAlPaso3ConUnAjuste();
    exigirSinTextosPequenos();
  });
});
