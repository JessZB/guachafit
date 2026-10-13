/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote A): spec de lógica pura.
 */
import { describe, expect, it } from 'vitest';
import { nombreCompletoAsignacion } from './asignacion-masiva-plantilla-nombres';

describe('nombreCompletoAsignacion', () => {
  it('une nombres y apellidos con un espacio', () => {
    expect(
      nombreCompletoAsignacion({ nombres: 'Carlos Alberto', apellidos: 'Mendoza Silva' })
    ).toBe('Carlos Alberto Mendoza Silva');
  });

  it('recorta espacios sobrantes en los bordes', () => {
    expect(nombreCompletoAsignacion({ nombres: '  Mariana', apellidos: 'Pérez Gómez  ' })).toBe(
      'Mariana Pérez Gómez'
    );
  });

  it('con apellidos vacíos devuelve solo los nombres', () => {
    expect(nombreCompletoAsignacion({ nombres: 'Andrés', apellidos: '' })).toBe('Andrés');
  });
});
