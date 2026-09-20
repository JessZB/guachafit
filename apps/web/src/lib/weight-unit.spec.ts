import { describe, expect, it } from 'vitest';
import { normalizarPesoPrescritoTexto } from './weight-unit';

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
