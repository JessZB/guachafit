// @vitest-environment happy-dom
/**
 * UX-18 · Contratos de interacción: TarjetaPlanComercial (TP1–TP3).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TarjetaPlanComercial } from './TarjetaPlanComercial';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';

const PLAN_BASE: PlanMembresiaDetalleDTO = {
  id: 'plan-1',
  entrenadorId: 'e1',
  nombre: 'Plan Trimestral',
  descripcion: 'Entrenamiento completo',
  beneficios: ['Rutina en app', 'Monitoreo diario'],
  precioBaseUsd: '90.00',
  duracionMeses: 3,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TarjetaPlanComercial · interacción (UX-18)', () => {
  it('TP1 · Precio según la duración (D7)', () => {
    const { rerender } = render(
      <TarjetaPlanComercial
        plan={{ ...PLAN_BASE, precioBaseUsd: '90.00', duracionMeses: 3 }}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
      />
    );

    const texto3Meses = document.body.textContent ?? '';
    expect(texto3Meses).toContain('$90,00');
    expect(texto3Meses).toContain('cada 3 meses');
    expect(texto3Meses).not.toContain('/ mes');

    rerender(
      <TarjetaPlanComercial
        plan={{ ...PLAN_BASE, precioBaseUsd: '30.00', duracionMeses: 1 }}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
      />
    );

    const texto1Mes = document.body.textContent ?? '';
    expect(texto1Mes).toContain('al mes');
  });

  it('TP2 · Desactivar pide confirmación', () => {
    const onToggleActivo = vi.fn();
    const planActivo = { ...PLAN_BASE, activo: true };

    const { rerender } = render(
      <TarjetaPlanComercial
        plan={planActivo}
        onEditar={vi.fn()}
        onToggleActivo={onToggleActivo}
      />
    );

    // 1. Con plan activo, pulsar Desactivar no llama a onToggleActivo y muestra confirmación
    fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));
    expect(onToggleActivo).not.toHaveBeenCalled();

    const botonConfirmar = screen.getByRole('button', {
      name: /confirmar|desactivar plan|sí, desactivar/i,
    });
    fireEvent.click(botonConfirmar);
    expect(onToggleActivo).toHaveBeenCalledTimes(1);
    expect(onToggleActivo).toHaveBeenCalledWith(planActivo);

    // 2. Con plan inactivo, Reactivar llama directamente
    onToggleActivo.mockClear();
    const planInactivo = { ...PLAN_BASE, activo: false };
    rerender(
      <TarjetaPlanComercial
        plan={planInactivo}
        onEditar={vi.fn()}
        onToggleActivo={onToggleActivo}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reactivar/i }));
    expect(onToggleActivo).toHaveBeenCalledTimes(1);
    expect(onToggleActivo).toHaveBeenCalledWith(planInactivo);
  });

  it('TP3 · Sin doble envío', () => {
    render(
      <TarjetaPlanComercial
        plan={PLAN_BASE}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
        {...({ procesando: true } as any)}
      />
    );

    const boton = screen.getByRole('button', { name: /desactivar|reactivar/i });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});
