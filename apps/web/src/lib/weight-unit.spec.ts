import { describe, expect, it } from 'vitest';
import { MENSAJE_ESFUERZO_INVALIDO, MENSAJE_PESO_FUERA_DE_RANGO } from '@guachafit/shared';
import {
  convertirEntradaPesoAKg,
  normalizarPesoPrescritoTexto,
  validarReps,
  validarRpe,
} from './weight-unit';

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
    expect(validarRpe('abc').error).toBe(MENSAJE_ESFUERZO_INVALIDO);
    expect(validarRpe('11').error).toBe(MENSAJE_ESFUERZO_INVALIDO);
  });

  it('las repeticiones inválidas se explican sin abreviar', () => {
    expect(validarReps(-1)).toBe('Repeticiones no válidas: usa un número entero entre 0 y 200');
    expect(validarReps(10)).toBeNull();
  });
});

describe('C4 · límites compartidos de la serie (RF-001 / RF-017)', () => {
  it('validarRpe acepta la coma y normaliza a punto', () => {
    expect(validarRpe('8,5')).toEqual({ ok: true, rpe: '8.5' });
    expect(validarRpe('')).toEqual({ ok: true, rpe: '' });
  });

  it('validarRpe rechaza 0, los pasos distintos de 0,5 y los valores fuera de rango', () => {
    expect(validarRpe('0')).toMatchObject({ ok: false, error: MENSAJE_ESFUERZO_INVALIDO });
    expect(validarRpe('8.3')).toMatchObject({ ok: false, error: MENSAJE_ESFUERZO_INVALIDO });
    expect(validarRpe('11')).toMatchObject({ ok: false, error: MENSAJE_ESFUERZO_INVALIDO });
  });

  it('convertirEntradaPesoAKg acepta el tope exacto de 999 kg', () => {
    expect(convertirEntradaPesoAKg('999', 'kg')).toMatchObject({ ok: true });
  });

  it('convertirEntradaPesoAKg rechaza lo que supera 999 kg', () => {
    expect(convertirEntradaPesoAKg('999.01', 'kg')).toMatchObject({
      ok: false,
      error: MENSAJE_PESO_FUERA_DE_RANGO,
    });
    expect(convertirEntradaPesoAKg('1000', 'kg')).toMatchObject({
      ok: false,
      error: MENSAJE_PESO_FUERA_DE_RANGO,
    });
  });

  it('convertirEntradaPesoAKg aplica el tope equivalente en lb', () => {
    expect(convertirEntradaPesoAKg('2202', 'lb')).toMatchObject({ ok: true });
    expect(convertirEntradaPesoAKg('2203', 'lb')).toMatchObject({
      ok: false,
      error: MENSAJE_PESO_FUERA_DE_RANGO,
    });
  });

  it('normalizarPesoPrescritoTexto rechaza cualquier número por encima de 999', () => {
    expect(normalizarPesoPrescritoTexto('1000 kg').error).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
    expect(normalizarPesoPrescritoTexto('500-1200').error).toBe(MENSAJE_PESO_FUERA_DE_RANGO);
  });

  it('normalizarPesoPrescritoTexto mantiene válidos el tope y el texto cualitativo', () => {
    expect(normalizarPesoPrescritoTexto('999').error).toBeUndefined();
    expect(normalizarPesoPrescritoTexto('Corporal').error).toBeUndefined();
  });
});
