// @vitest-environment jsdom
/**
 * Ficha del alumno · `TarjetaPlanTarifaAlumno` (fase roja L1.4 + L3.1, L3.2 y L3.4).
 *
 * Contratos que fija este spec:
 * - L1.4: título «Plan y tarifa» (sin «Comercial», «& Tarifa» ni «(RF-005)»), estado «Sin plan»,
 *   campos «Precio acordado (USD)» y «Tasa especial (Bs por USD)», placeholders «Del plan» y
 *   «Global», y ninguna aparición visible del literal «Override» (tampoco «Quitar override»).
 * - L3.1: `getByLabelText` encuentra el selector de plan, el precio y la tasa; dos tarjetas
 *   simultáneas no repiten `id`.
 * - L3.2: precio y tasa abren el teclado decimal.
 * - L3.4: precio y tasa son `grid-cols-1 sm:grid-cols-2`.
 */
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type {
  OverridePlanDetalleDTO,
  PlanMembresiaDetalleDTO,
} from '@guachafit/shared';
import {
  TarjetaPlanTarifaAlumno,
  type PlanTarjetaAlumno,
} from './TarjetaPlanTarifaAlumno';

const PLAN: PlanMembresiaDetalleDTO = {
  id: 'plan-1',
  entrenadorId: 'entrenador-1',
  nombre: 'Mensual',
  beneficios: [],
  precioBaseUsd: '40.00',
  duracionMeses: 1,
  activo: true,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

const OVERRIDE: OverridePlanDetalleDTO = {
  id: 'override-1',
  planId: 'plan-1',
  clienteId: 'cliente-1',
  precioAcordadoUsd: '30.00',
  tasaFijadaOverride: '40.0000',
  beneficiosPersonalizados: null,
  motivoOverride: 'Beca',
  planNombre: 'Mensual',
  planPrecioBaseUsd: '40.00',
  clienteNombre: 'Ana Pérez',
  createdAtUtc: '2026-01-01T00:00:00.000Z',
  updatedAtUtc: '2026-01-01T00:00:00.000Z',
};

const ETIQUETAS = [
  'Plan Asignado del Catálogo',
  'Precio acordado (USD)',
  'Tasa especial (Bs por USD)',
] as const;

function planTarjeta(overrides: Partial<PlanTarjetaAlumno> = {}): PlanTarjetaAlumno {
  return {
    suscripcion: null,
    suscripcionError: null,
    overrideError: null,
    overridesAlumno: [],
    selectedPlanId: '',
    precioOverride: '',
    tasaFijadaOverride: '',
    fechaInicioPlan: '',
    hoyDelAlumno: () => '2026-10-26',
    setSelectedPlanId: vi.fn(),
    setPrecioOverride: vi.fn(),
    setTasaFijadaOverride: vi.fn(),
    setFechaInicioPlan: vi.fn(),
    ...overrides,
  };
}

function elementoTarjeta(overrides: Partial<PlanTarjetaAlumno> = {}) {
  return (
    <TarjetaPlanTarifaAlumno
      plan={planTarjeta(overrides)}
      planesCatalogo={[PLAN]}
      zonaHoraria="America/Caracas"
      onQuitarPlan={vi.fn()}
      onQuitarOverride={vi.fn()}
      refSelectorPlan={createRef<HTMLSelectElement>()}
    />
  );
}

function renderTarjeta(overrides: Partial<PlanTarjetaAlumno> = {}) {
  return render(elementoTarjeta(overrides));
}

afterEach(() => {
  cleanup();
});

describe('TarjetaPlanTarifaAlumno · L1.4 textos', () => {
  it('titula la tarjeta «Plan y tarifa» sin «Comercial» ni «(RF-005)»', () => {
    renderTarjeta();

    expect(screen.getByRole('heading', { name: 'Plan y tarifa' })).toBeTruthy();
    expect(screen.queryByText(/Comercial/)).toBeNull();
    expect(screen.queryByText(/RF-005/)).toBeNull();
  });

  it('llama «Sin plan» al estado sin plan asignado', () => {
    renderTarjeta();

    expect(screen.getByText('Sin plan')).toBeTruthy();
    expect(screen.queryByText('Sin plan asignado')).toBeNull();
  });

  it('nombra los campos y placeholders de precio y tasa', () => {
    renderTarjeta();

    expect(screen.getByText('Precio acordado (USD)')).toBeTruthy();
    expect(screen.getByText('Tasa especial (Bs por USD)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Del plan')).toBeTruthy();
    expect(screen.getByPlaceholderText('Global')).toBeTruthy();
    expect(screen.queryByText('Precio Acordado ($ USD)')).toBeNull();
    expect(screen.queryByText('Tasa Especial Override (VES)')).toBeNull();
  });

  it('no deja ninguna aparición visible de «Override» con un precio especial vigente', () => {
    const { container } = renderTarjeta({ overridesAlumno: [OVERRIDE] });

    expect(container.textContent ?? '').not.toMatch(/override/i);
    // El tooltip también es texto visible: si la acción de quitar sigue existiendo, se renombra.
    for (const elemento of Array.from(container.querySelectorAll('[title]'))) {
      expect(elemento.getAttribute('title')).not.toMatch(/override/i);
    }
  });
});

describe('TarjetaPlanTarifaAlumno · V6 filas de tarifa con wrap', () => {
  it('la fila de la tarifa vigente usa flex-wrap y su texto no se corta', () => {
    const { container } = renderTarjeta({ overridesAlumno: [OVERRIDE] });

    const vigente = container.querySelector('div.rounded-2xl.border');
    const fila = vigente?.querySelector('div.flex.items-center.justify-between') ?? null;
    expect(fila).not.toBeNull();
    expect(fila!.className.split(/\s+/)).toContain('flex-wrap');
    for (const texto of Array.from(fila!.querySelectorAll('span'))) {
      expect(texto.className.split(/\s+/)).not.toContain('truncate');
    }
  });

  it('la fila de la próxima cuota usa flex-wrap y su texto no se corta', () => {
    const { container } = renderTarjeta({
      suscripcion: {
        planId: 'plan-1',
        planNombre: 'Plan Suscripción Larga Con Un Nombre Muy Extenso',
        cicloActual: '2026-10',
        proximoVencimiento: '2026-11-01',
        precioAcordadoUsd: null,
        tasaFijadaBs: null,
      } as unknown as PlanTarjetaAlumno['suscripcion'],
    });

    const suscripcion = container.querySelector('div.rounded-xl.border');
    const fila = suscripcion?.querySelector('div.flex.items-center.justify-between') ?? null;
    expect(fila).not.toBeNull();
    expect(fila!.className.split(/\s+/)).toContain('flex-wrap');
    const texto = fila!.querySelector('p');
    expect(texto).not.toBeNull();
    expect(texto!.className.split(/\s+/)).not.toContain('truncate');
  });
});

describe('TarjetaPlanTarifaAlumno · L3.1 etiquetas asociadas', () => {
  it.each(ETIQUETAS)('asocia «%s» a su control', (etiqueta) => {
    renderTarjeta();

    const control = screen.getByLabelText(etiqueta);
    expect(['INPUT', 'SELECT']).toContain(control.tagName);
  });

  it('genera ids únicos cuando hay dos tarjetas montadas a la vez', () => {
    render(
      <>
        {elementoTarjeta()}
        {elementoTarjeta()}
      </>
    );

    for (const etiqueta of ETIQUETAS) {
      const controles = screen.getAllByLabelText(etiqueta);
      expect(controles).toHaveLength(2);
      const ids = controles.map((control) => control.id);
      expect(ids.every((id) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(2);
    }
  });
});

describe('TarjetaPlanTarifaAlumno · L3.2 teclado numérico', () => {
  it('precio y tasa abren el teclado decimal', () => {
    renderTarjeta();

    expect(screen.getByLabelText('Precio acordado (USD)').getAttribute('inputmode')).toBe(
      'decimal'
    );
    expect(screen.getByLabelText('Tasa especial (Bs por USD)').getAttribute('inputmode')).toBe(
      'decimal'
    );
  });
});

describe('TarjetaPlanTarifaAlumno · L3.4 cuadrícula móvil', () => {
  it('precio y tasa son una columna en móvil y dos desde sm', () => {
    const { container } = renderTarjeta();

    // Sin suscripción y sin plan elegido, los únicos <input> de la tarjeta son precio y tasa.
    const [precio] = Array.from(container.querySelectorAll('input'));
    const fila = precio?.closest('[class*="grid-cols"]');

    expect(fila).not.toBeNull();
    expect(fila?.classList.contains('grid-cols-1')).toBe(true);
    expect(fila?.classList.contains('sm:grid-cols-2')).toBe(true);
    expect(fila?.classList.contains('grid-cols-2')).toBe(false);
  });
});
