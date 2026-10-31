// @vitest-environment jsdom
/**
 * UX-18 · Contratos de interacción: PanelPlanes (PP1–PP4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelPlanes } from './PanelPlanes';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';

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

describe('PanelPlanes · interacción (UX-18)', () => {
  it('PP1 · Carga', () => {
    render(
      <PanelPlanes
        planes={[]}
        isLoadingPlanes={true}
        planesError={null}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
        onCrear={vi.fn()}
        onReintentar={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByText('No tienes planes comerciales creados')).toBeNull();
  });

  it('PP2 · Error de activación no es de carga', () => {
    render(
      <PanelPlanes
        planes={[PLAN_FIXTURE]}
        isLoadingPlanes={false}
        planesError={null}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
        onCrear={vi.fn()}
        onReintentar={vi.fn()}
        {...({ errorToggle: 'No se pudo actualizar el plan.' } as any)}
      />
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo actualizar el plan.');
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
  });

  it('PP3 · Aviso cerrable', () => {
    const onCerrarErrorToggle = vi.fn();
    render(
      <PanelPlanes
        planes={[PLAN_FIXTURE]}
        isLoadingPlanes={false}
        planesError={null}
        errorToggle="No se pudo actualizar el plan."
        onCerrarErrorToggle={onCerrarErrorToggle}
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
        onCrear={vi.fn()}
        onReintentar={vi.fn()}
      />
    );

    const botonCerrar = screen.getByRole('button', { name: /cerrar aviso/i });
    fireEvent.click(botonCerrar);
    expect(onCerrarErrorToggle).toHaveBeenCalledTimes(1);
  });

  it('PP4 · Todas bloqueadas', () => {
    const plan1: PlanMembresiaDetalleDTO = { ...PLAN_FIXTURE, id: 'plan-1', activo: true };
    const plan2: PlanMembresiaDetalleDTO = { ...PLAN_FIXTURE, id: 'plan-2', activo: false };

    render(
      <PanelPlanes
        planes={[plan1, plan2]}
        isLoadingPlanes={false}
        planesError={null}
        planEnCurso="plan-1"
        onEditar={vi.fn()}
        onToggleActivo={vi.fn()}
        onCrear={vi.fn()}
        onReintentar={vi.fn()}
      />
    );

    const botonDesactivar = screen.getByRole('button', { name: /desactivar/i });
    const botonReactivar = screen.getByRole('button', { name: /reactivar/i });

    expect((botonDesactivar as HTMLButtonElement).disabled).toBe(true);
    expect((botonReactivar as HTMLButtonElement).disabled).toBe(true);
  });
});
