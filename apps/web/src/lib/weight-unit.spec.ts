import { describe, expect, it } from 'vitest';
import { normalizarPesoPrescritoTexto, validarReps, validarRpe } from './weight-unit';

describe('normalizarPesoPrescritoTexto (WU5: peso prescrito del modal)', () => {
  it('acepta vacío como prescripción cualitativa (nunca materializa 0.00)', () => {
    expect(normalizarPesoPrescritoTexto('')).toEqual({ valor: '' });
    expect(normalizarPesoPrescritoTexto('   ')).toEqual({ valor: '' });
    expect(normalizarPesoPrescritoTexto(null)).toEqual({ valor: '' });
    expect(normalizarPesoPrescritoTexto(undefined)).toEqual({ valor: '' });
  });

  it('normaliza la coma decimal entre dígitos', () => {
    expect(normalizarPesoPrescritoTexto('60,5').valor).toBe('60.5');
    expect(normalizarPesoPrescritoTexto('60,5 kg').valor).toBe('60.5 kg');
    expect(normalizarPesoPrescritoTexto(' 82,25 ').valor).toBe('82.25');
  });

  it('respeta texto cualitativo sin números', () => {
    expect(normalizarPesoPrescritoTexto('Moderado').valor).toBe('Moderado');
    expect(normalizarPesoPrescritoTexto('Corporal').valor).toBe('Corporal');
  });

  it('limpia separadores finales y rechaza números fuera del contrato decimal', () => {
    expect(normalizarPesoPrescritoTexto('60,').valor).toBe('60');
    expect(normalizarPesoPrescritoTexto('60.5.').valor).toBe('60.5');
    expect(normalizarPesoPrescritoTexto('60.555').error).toBeDefined();
  });
});

describe('validarRpe / validarReps: mensajes para el alumno sin siglas', () => {
  it('el esfuerzo inválido se explica sin la sigla RPE', () => {
    expect(validarRpe('abc').error).toBe('Esfuerzo no válido: usa un número del 0 al 10 (ej. 8 u 8.5)');
    expect(validarRpe('11').error).toBe('Esfuerzo no válido: debe estar entre 0 y 10');
  });

  it('las repeticiones inválidas se explican sin abreviar', () => {
    expect(validarReps(-1)).toBe('Repeticiones no válidas: usa un número entero entre 0 y 200');
    expect(validarReps(10)).toBeNull();
  });
});
