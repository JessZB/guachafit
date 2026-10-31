// @vitest-environment jsdom
/**
 * UX-18 · Contratos de interacción: ModalPlanComercial (MP1–MP9).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { ModalPlanComercial } from './ModalPlanComercial';

const PLAN_FIXTURE: PlanMembresiaDetalleDTO = {
  id: 'plan-1',
  entrenadorId: 'e1',
  nombre: 'Plan Básico',
  descripcion: 'Acceso general al gimnasio',
  beneficios: ['Rutina interactiva en app'],
  precioBaseUsd: '30.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ModalPlanComercial · interacción (UX-18)', () => {
  it('MP1 · Crear arranca vacío', () => {
    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={vi.fn()}
      />
    );

    const campoPrecio = screen.getByLabelText(/precio/i);
    expect((campoPrecio as HTMLInputElement).value).toBe('');
    expect(
      campoPrecio.getAttribute('inputmode') ?? (campoPrecio as HTMLInputElement).inputMode
    ).toBe('decimal');

    const campoNombre = screen.getByLabelText(/nombre/i);
    expect((campoNombre as HTMLInputElement).value).toBe('');

    const botonQuitar = screen.queryByRole('button', { name: /^quitar beneficio/i });
    expect(botonQuitar).toBeNull();
  });

  it('MP2 · Sin beneficios no envía', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onGuardar = vi.fn();

    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={onGuardar}
        onCerrar={vi.fn()}
      />
    );

    // Quitar beneficios si hubiera alguno precargado
    const botonesQuitar = screen.queryAllByRole('button', { name: /^quitar beneficio/i });
    for (const btn of botonesQuitar) {
      fireEvent.click(btn);
    }

    const campoNombre =
      screen.queryByLabelText(/nombre/i) ?? screen.getByPlaceholderText(/personalizado|nombre/i);
    const campoPrecio =
      screen.queryByLabelText(/precio/i) ??
      document.querySelector('input[type="number"], input[inputmode="decimal"]')!;

    fireEvent.change(campoNombre, { target: { value: 'Plan Fuerza' } });
    fireEvent.change(campoPrecio, { target: { value: '90' } });

    const botonEnviar = screen.getByRole('button', { name: /crear plan|actualizar plan|guardar/i });
    fireEvent.click(botonEnviar);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(onGuardar).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('MP3 · Precio inválido no envía', () => {
    const onGuardar = vi.fn();

    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={onGuardar}
        onCerrar={vi.fn()}
      />
    );

    const campoNombre =
      screen.queryByLabelText(/nombre/i) ?? screen.getByPlaceholderText(/personalizado|nombre/i);
    const campoPrecio =
      screen.queryByLabelText(/precio/i) ??
      document.querySelector('input[type="number"], input[inputmode="decimal"]')!;
    const botonEnviar = screen.getByRole('button', { name: /crear plan|actualizar plan|guardar/i });

    fireEvent.change(campoNombre, { target: { value: 'Plan Fuerza' } });

    // Añadir beneficio 'Nutrición'
    const inputBeneficio = screen.getByPlaceholderText(/check-in|beneficio/i);
    const botonAnadir = screen.getByRole('button', { name: /añadir/i });
    fireEvent.change(inputBeneficio, { target: { value: 'Nutrición' } });
    fireEvent.click(botonAnadir);

    // 1. Precio vacío ''
    fireEvent.change(campoPrecio, { target: { value: '' } });
    fireEvent.click(botonEnviar);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(onGuardar).not.toHaveBeenCalled();

    // 2. Precio '0'
    fireEvent.change(campoPrecio, { target: { value: '0' } });
    fireEvent.click(botonEnviar);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(onGuardar).not.toHaveBeenCalled();

    // 3. Precio 'abc'
    fireEvent.change(campoPrecio, { target: { value: 'abc' } });
    fireEvent.click(botonEnviar);
    expect(screen.getByRole('alert')).toBeDefined();
    expect(onGuardar).not.toHaveBeenCalled();

    // 4. Con '90' sí se llama una vez con precioBaseUsd '90.00' o '90'
    fireEvent.change(campoPrecio, { target: { value: '90' } });
    fireEvent.click(botonEnviar);
    expect(onGuardar).toHaveBeenCalledTimes(1);
    const primerArg = onGuardar.mock.calls[0][0];
    expect(['90', '90.00']).toContain(primerArg.precioBaseUsd);
  });

  it('MP4 · Error de guardado visible', () => {
    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={vi.fn()}
        {...({ errorGuardado: 'Fallo de red' } as any)}
      />
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Fallo de red');
  });

  it('MP5 · Cambios sin guardar', () => {
    const onCerrar = vi.fn();
    const { unmount } = render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={onCerrar}
      />
    );

    // 1. Sin cambios, Escape llama a onCerrar
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    unmount();

    // 2. Tras escribir en el nombre, Escape NO llama a onCerrar y aparece confirmación
    const onCerrarConCambios = vi.fn();
    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={onCerrarConCambios}
      />
    );

    const campoNombre =
      screen.queryByLabelText(/nombre/i) ?? screen.getByPlaceholderText(/personalizado|nombre/i);
    fireEvent.change(campoNombre, { target: { value: 'Nuevo Plan' } });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrarConCambios).not.toHaveBeenCalled();

    // En el diálogo, 'Seguir editando' lo cierra sin llamar a onCerrar
    const botonSeguirEditando = screen.getByRole('button', { name: /seguir editando/i });
    fireEvent.click(botonSeguirEditando);
    expect(onCerrarConCambios).not.toHaveBeenCalled();

    // Vuelve a presionar Escape y pulsa 'Salir sin guardar': onCerrar se llama una vez
    fireEvent.keyDown(document, { key: 'Escape' });
    const botonSalir = screen.getByRole('button', { name: /salir sin guardar/i });
    fireEvent.click(botonSalir);
    expect(onCerrarConCambios).toHaveBeenCalledTimes(1);
  });

  it('MP6 · Quitar beneficio accesible', () => {
    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={vi.fn()}
      />
    );

    const inputBeneficio = screen.getByPlaceholderText(/check-in|beneficio/i);
    fireEvent.change(inputBeneficio, { target: { value: 'Nutrición' } });
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }));

    const botonQuitar = screen.getByRole('button', { name: /quitar beneficio nutrición/i });
    expect(botonQuitar.className).toContain('min-h-11');

    fireEvent.click(botonQuitar);
    expect(screen.queryByText('Nutrición')).toBeNull();
  });

  it('MP7 · Tras el éxito no hay reenvío ni falsa alarma', () => {
    const onCerrar = vi.fn();
    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg="Plan creado"
        onGuardar={vi.fn()}
        onCerrar={onCerrar}
      />
    );

    const campoNombre =
      screen.queryByLabelText(/nombre/i) ?? screen.getByPlaceholderText(/personalizado|nombre/i);
    fireEvent.change(campoNombre, { target: { value: 'Nuevo Plan' } });

    const botonEnviar = screen.getByRole('button', { name: /crear plan|actualizar plan|guardar/i });
    expect((botonEnviar as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/salir sin guardar/i)).toBeNull();
  });

  it('MP8 · Precio demasiado largo', () => {
    const onGuardar = vi.fn();

    render(
      <ModalPlanComercial
        plan={null}
        isSubmitting={false}
        successMsg={null}
        onGuardar={onGuardar}
        onCerrar={vi.fn()}
      />
    );

    const campoNombre =
      screen.queryByLabelText(/nombre/i) ?? screen.getByPlaceholderText(/personalizado|nombre/i);
    const campoPrecio =
      screen.queryByLabelText(/precio/i) ??
      document.querySelector('input[type="number"], input[inputmode="decimal"]')!;
    const botonEnviar = screen.getByRole('button', { name: /crear plan|actualizar plan|guardar/i });

    fireEvent.change(campoNombre, { target: { value: 'Plan Fuerza' } });

    const inputBeneficio = screen.getByPlaceholderText(/check-in|beneficio/i);
    const botonAnadir = screen.getByRole('button', { name: /añadir/i });
    fireEvent.change(inputBeneficio, { target: { value: 'Nutrición' } });
    fireEvent.click(botonAnadir);

    // Con 8 dígitos (precio demasiado largo) no envía y muestra alerta
    fireEvent.change(campoPrecio, { target: { value: '12345678' } });
    fireEvent.click(botonEnviar);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(onGuardar).not.toHaveBeenCalled();

    // Con 7 dígitos sí se envía
    fireEvent.change(campoPrecio, { target: { value: '1234567' } });
    fireEvent.click(botonEnviar);

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const primerArg = onGuardar.mock.calls[0][0];
    expect(primerArg.precioBaseUsd).toBe('1234567');
  });

  it('MP9 · Precarga al editar', () => {
    const onCerrar = vi.fn();
    render(
      <ModalPlanComercial
        plan={PLAN_FIXTURE}
        isSubmitting={false}
        successMsg={null}
        onGuardar={vi.fn()}
        onCerrar={onCerrar}
      />
    );

    const campoPrecio = screen.getByLabelText(/precio/i);
    expect((campoPrecio as HTMLInputElement).value).toBe('30,00');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/salir sin guardar/i)).toBeNull();
  });
});
