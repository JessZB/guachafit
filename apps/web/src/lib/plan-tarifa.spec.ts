import { describe, expect, it } from 'vitest';
import {
  decidirGuardadoPlanTarifa,
  esOverrideBecado,
  esPrecioAcordadoValido,
  esTasaEspecialValida,
  normalizarPrecioAcordado,
  normalizarTasaEspecial,
  overrideDemoAlumno,
  textoPrecioVigente,
} from './plan-tarifa';
import type { OverridePlanDetalleDTO } from '@guachafit/shared';

function override(parcial: Partial<OverridePlanDetalleDTO> = {}): OverridePlanDetalleDTO {
  return {
    id: 'override-1',
    planId: 'plan-1',
    clienteId: 'alumno-1',
    precioAcordadoUsd: '35.00',
    tasaFijadaOverride: null,
    beneficiosPersonalizados: null,
    motivoOverride: null,
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-01T00:00:00.000Z',
    ...parcial,
  };
}

describe('WU-J: helpers de plan y tarifa (RF-005)', () => {
  it('valida el precio acordado con hasta 2 decimales y permite 0.00 (becado)', () => {
    expect(esPrecioAcordadoValido('35')).toBe(true);
    expect(esPrecioAcordadoValido('35.5')).toBe(true);
    expect(esPrecioAcordadoValido('35.50')).toBe(true);
    expect(esPrecioAcordadoValido('0.00')).toBe(true);
    expect(esPrecioAcordadoValido('')).toBe(false);
    expect(esPrecioAcordadoValido('35.555')).toBe(false);
    expect(esPrecioAcordadoValido('-5')).toBe(false);
    expect(esPrecioAcordadoValido('abc')).toBe(false);
  });

  it('valida la tasa especial (mayor a 0, hasta 4 decimales) y normaliza ambos valores', () => {
    expect(esTasaEspecialValida('65')).toBe(true);
    expect(esTasaEspecialValida('65.0000')).toBe(true);
    expect(esTasaEspecialValida('0')).toBe(false);
    expect(esTasaEspecialValida('0.0000')).toBe(false);
    expect(esTasaEspecialValida('65.00001')).toBe(false);
    expect(esTasaEspecialValida('')).toBe(false);

    expect(normalizarPrecioAcordado('35')).toBe('35.00');
    expect(normalizarTasaEspecial('65')).toBe('65.0000');
  });

  it('rechaza entradas inválidas con un mensaje humano (nunca guarda basura)', () => {
    const porPrecio = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-1',
      precioAcordado: '35.555',
      tasaEspecial: '',
      overridesVigentes: [],
    });
    expect(porPrecio.accion).toBe('error');

    const porTasa = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-1',
      precioAcordado: '',
      tasaEspecial: '0',
      overridesVigentes: [],
    });
    expect(porTasa.accion).toBe('error');
  });

  it('sin plan seleccionado y sin override no hace nada', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: '',
      precioAcordado: '',
      tasaEspecial: '65.0000',
      overridesVigentes: [],
    });
    expect(decision.accion).toBe('ninguna');
  });

  it('sin plan seleccionado pero con override vigente lo elimina (vuelve al catálogo)', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: '',
      precioAcordado: '',
      tasaEspecial: '',
      overridesVigentes: [override({ id: 'override-a' }), override({ id: 'override-b' })],
    });
    expect(decision.accion).toBe('eliminar_override');
    if (decision.accion === 'eliminar_override') {
      expect(decision.overridesAEliminar).toEqual(['override-a', 'override-b']);
    }
  });

  it('con plan seleccionado y sin cambios reales no escribe nada', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-1',
      precioAcordado: '35.00',
      tasaEspecial: '65.0000',
      overridesVigentes: [override({ precioAcordadoUsd: '35.00', tasaFijadaOverride: '65.0000' })],
    });
    expect(decision.accion).toBe('ninguna');
  });

  it('asigna un plan nuevo creando el override con precio/tasa explícitos y null cuando se deja vacío', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-2',
      precioAcordado: '30',
      tasaEspecial: '',
      overridesVigentes: [],
    });
    expect(decision.accion).toBe('guardar_override');
    if (decision.accion === 'guardar_override') {
      expect(decision.payload).toEqual({
        planId: 'plan-2',
        precioAcordadoUsd: '30.00',
        tasaFijadaOverride: null,
      });
      expect(decision.overridesAEliminar).toEqual([]);
    }
  });

  it('al cambiar de plan elimina los overrides de otros planes y conserva el vigente actualizado', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-2',
      precioAcordado: '',
      tasaEspecial: '70.0000',
      overridesVigentes: [
        override({ id: 'override-viejo', planId: 'plan-1' }),
        override({ id: 'override-plan-2', planId: 'plan-2', precioAcordadoUsd: '35.00' }),
      ],
    });

    expect(decision.accion).toBe('guardar_override');
    if (decision.accion === 'guardar_override') {
      // Vaciar el precio significa "volver a heredar el catálogo": viaja null explícito.
      expect(decision.payload.precioAcordadoUsd).toBeNull();
      expect(decision.payload.tasaFijadaOverride).toBe('70.0000');
      expect(decision.overridesAEliminar).toEqual(['override-viejo']);
    }
  });

  it('al cambiar SOLO el precio de un override existente del mismo plan, no borra otros', () => {
    const decision = decidirGuardadoPlanTarifa({
      planSeleccionadoId: 'plan-1',
      precioAcordado: '0.00',
      tasaEspecial: '',
      overridesVigentes: [override({ precioAcordadoUsd: '35.00' })],
    });

    expect(decision.accion).toBe('guardar_override');
    if (decision.accion === 'guardar_override') {
      expect(decision.payload.precioAcordadoUsd).toBe('0.00');
      expect(decision.overridesAEliminar).toEqual([]);
    }
  });

  it('reconoce becados y describe el precio vigente en lenguaje humano', () => {
    expect(esOverrideBecado(override({ precioAcordadoUsd: '0.00' }))).toBe(true);
    expect(esOverrideBecado(override({ precioAcordadoUsd: '35.00' }))).toBe(false);
    expect(esOverrideBecado(override({ precioAcordadoUsd: null }))).toBe(false);
    expect(esOverrideBecado(null)).toBe(false);

    expect(textoPrecioVigente(override({ precioAcordadoUsd: '0.00' }))).toBe('Becado ($0.00)');
    expect(textoPrecioVigente(override({ precioAcordadoUsd: '35.00' }))).toBe('$35.00 acordado');
    expect(
      textoPrecioVigente(override({ precioAcordadoUsd: null }), {
        id: 'plan-1',
        entrenadorId: 'coach-1',
        nombre: 'Plan',
        beneficios: [],
        precioBaseUsd: '40.00',
        duracionMeses: 1,
        activo: true,
        createdAtUtc: '',
        updatedAtUtc: '',
      })
    ).toBe('Precio del catálogo ($40.00)');
    expect(textoPrecioVigente(null)).toBe('Sin precio definido');
  });

  it('el fixture demo declara un override de ejemplo coherente con RN-03 (base 40, acordado 35)', () => {
    const demo = overrideDemoAlumno();
    expect(demo.planId).toBe('plan-presencial');
    expect(demo.precioAcordadoUsd).toBe('35.00');
    expect(demo.planPrecioBaseUsd).toBe('40.00');
    expect(esOverrideBecado(demo)).toBe(false);
  });
});
