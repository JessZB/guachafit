import { describe, expect, it } from 'vitest';
import { pesoEfectivoKg, pesoVieneDelPlan } from './entrenamiento-peso-plan';

describe('entrenamiento-peso-plan', () => {
  describe('pesoEfectivoKg', () => {
    it.each([
      ['peso real "62.50" con plan distinto "60.00" (gana el real)', { pesoKg: '62.50', pesoPrescritoKg: '60.00' }, '62.50'],
      ['peso null con plan válido "60.00"', { pesoKg: null, pesoPrescritoKg: '60.00' }, '60.00'],
      ['peso undefined con plan válido "60.00"', { pesoPrescritoKg: '60.00' }, '60.00'],
      ['peso vaciado "" con plan "60.00"', { pesoKg: '', pesoPrescritoKg: '60.00' }, ''],
      ['peso guardado "0.00" con plan "60.00"', { pesoKg: '0.00', pesoPrescritoKg: '60.00' }, '0.00'],
      ['plan null con peso null', { pesoKg: null, pesoPrescritoKg: null }, null],
      ['plan vaciado "" con peso null', { pesoKg: null, pesoPrescritoKg: '' }, null],
      ['plan "0" con peso null', { pesoKg: null, pesoPrescritoKg: '0' }, null],
      ['plan negativo "-5" con peso null', { pesoKg: null, pesoPrescritoKg: '-5' }, null],
      ['plan no numérico "abc" con peso null', { pesoKg: null, pesoPrescritoKg: 'abc' }, null],
      ['ambos null', { pesoKg: null, pesoPrescritoKg: null }, null],
    ])('%s -> %s', (_nombre, entrada, esperado) => {
      expect(pesoEfectivoKg(entrada)).toBe(esperado);
    });
  });

  describe('pesoVieneDelPlan', () => {
    it.each([
      ['peso real "62.50" con plan distinto "60.00"', { pesoKg: '62.50', pesoPrescritoKg: '60.00' }, false],
      ['peso null con plan válido "60.00"', { pesoKg: null, pesoPrescritoKg: '60.00' }, true],
      ['peso undefined con plan válido "60.00"', { pesoPrescritoKg: '60.00' }, true],
      ['peso vaciado "" con plan "60.00"', { pesoKg: '', pesoPrescritoKg: '60.00' }, false],
      ['peso guardado "0.00" con plan "60.00"', { pesoKg: '0.00', pesoPrescritoKg: '60.00' }, false],
      ['plan null con peso null', { pesoKg: null, pesoPrescritoKg: null }, false],
      ['plan vaciado "" con peso null', { pesoKg: null, pesoPrescritoKg: '' }, false],
      ['plan "0" con peso null', { pesoKg: null, pesoPrescritoKg: '0' }, false],
      ['plan negativo "-5" con peso null', { pesoKg: null, pesoPrescritoKg: '-5' }, false],
      ['plan no numérico "abc" con peso null', { pesoKg: null, pesoPrescritoKg: 'abc' }, false],
      ['ambos null', { pesoKg: null, pesoPrescritoKg: null }, false],
    ])('%s -> %s', (_nombre, entrada, esperado) => {
      expect(pesoVieneDelPlan(entrada)).toBe(esperado);
    });
  });
});
