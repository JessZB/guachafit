/**
 * Specs de `lib/ajustes-entrenador-planes.ts` (lógica pura extraída de AjustesPage).
 */
import { describe, expect, it } from 'vitest';
import {
  construirPayloadActualizarPlan,
  construirPayloadCrearPlan,
  type DatosFormularioPlan,
} from './ajustes-entrenador-planes';

const BASE: DatosFormularioPlan = {
  nombre: '  Plan Personalizado  ',
  descripcion: '  Alcance general  ',
  precioBaseUsd: '40',
  duracionMeses: 3,
  beneficios: ['Rutina en app'],
};

describe('ajustes-entrenador-planes', () => {
  it('actualizar recorta textos, fija 2 decimales y no incluye activo', () => {
    expect(construirPayloadActualizarPlan(BASE)).toEqual({
      nombre: 'Plan Personalizado',
      descripcion: 'Alcance general',
      precioBaseUsd: '40.00',
      duracionMeses: 3,
      beneficios: ['Rutina en app'],
    });
  });

  it('actualizar omite la descripción vacía como undefined', () => {
    const payload = construirPayloadActualizarPlan({ ...BASE, descripcion: '   ' });
    expect(payload.descripcion).toBeUndefined();
  });

  it('crear añade activo:true sobre el mismo cuerpo de actualizar', () => {
    expect(construirPayloadCrearPlan(BASE)).toEqual({
      ...construirPayloadActualizarPlan(BASE),
      activo: true,
    });
  });
});
