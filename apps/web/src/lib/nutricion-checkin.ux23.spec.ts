/**
 * Specs de lógica pura para RF-002 · UX-23 (Fase roja TDD).
 * Contratos ALU-16 (texto botón fuera de ventana) y ALU-19 (validación campos opcionales).
 */
import { describe, expect, it } from 'vitest';
import {
  textoBotonFueraDeVentanaCheckin,
  validarCamposOpcionalesCheckin,
} from './nutricion-checkin';

describe('textoBotonFueraDeVentanaCheckin (ALU-16)', () => {
  it('incluye la hora de inicio y la zona horaria del perfil cuando es válida', () => {
    expect(textoBotonFueraDeVentanaCheckin('Europe/Madrid')).toBe(
      'Disponible a partir de las 18:00 (hora de Madrid)'
    );
    expect(textoBotonFueraDeVentanaCheckin('America/Argentina/Buenos_Aires')).toBe(
      'Disponible a partir de las 18:00 (hora de Buenos Aires)'
    );
  });

  it('usa la zona por defecto del producto cuando la zona falta o es inválida', () => {
    expect(textoBotonFueraDeVentanaCheckin(undefined)).toBe(
      'Disponible a partir de las 18:00 (hora de Caracas)'
    );
    expect(textoBotonFueraDeVentanaCheckin('Zona/Inexistente')).toBe(
      'Disponible a partir de las 18:00 (hora de Caracas)'
    );
  });
});

describe('validarCamposOpcionalesCheckin (ALU-19)', () => {
  it('devuelve un objeto vacío cuando los tres campos están vacíos o con valores válidos', () => {
    expect(validarCamposOpcionalesCheckin({})).toEqual({});
    expect(validarCamposOpcionalesCheckin({ aguaLitros: '  ', calorias: '', proteina: '' })).toEqual(
      {}
    );
    expect(
      validarCamposOpcionalesCheckin({ aguaLitros: '2,5', calorias: '2100', proteina: '140' })
    ).toEqual({});
  });

  it('reporta error de agua cuando tiene más de 2 decimales, es negativo o no numérico', () => {
    expect(validarCamposOpcionalesCheckin({ aguaLitros: '2.555' }).aguaLitros).toBe(
      'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.'
    );
    expect(validarCamposOpcionalesCheckin({ aguaLitros: 'abc' }).aguaLitros).toBe(
      'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.'
    );
    expect(validarCamposOpcionalesCheckin({ aguaLitros: '25' }).aguaLitros).toBe(
      'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.'
    );
  });

  it('distingue decimales no permitidos de valores fuera de rango en calorías y proteína', () => {
    expect(validarCamposOpcionalesCheckin({ calorias: '2000.5' }).calorias).toBe(
      'Calorías inválidas: usa solo números enteros (sin decimales).'
    );
    expect(validarCamposOpcionalesCheckin({ calorias: '16000' }).calorias).toBe(
      'Calorías: escribe un número entre 0 y 15000.'
    );
    expect(validarCamposOpcionalesCheckin({ proteina: '120,5' }).proteina).toBe(
      'Proteína inválida: usa solo números enteros (sin decimales).'
    );
    expect(validarCamposOpcionalesCheckin({ proteina: '1200' }).proteina).toBe(
      'Proteína: escribe los gramos con un número entre 0 y 1000.'
    );
  });
});
