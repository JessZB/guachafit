/**
 * Specs de `lib/pagos-montos.ts` (fase B, prompt 54): derivados de tasa y montos
 * extraídos tal cual de `PagosPage.tsx`. Fijan el contrato D2/D6 (sin tasa real
 * no se inventa conversión).
 */
import { describe, expect, it } from 'vitest';
import { Moneda } from '@guachafit/shared';
import {
  contravalorUsd,
  etiquetaFaltaTasa,
  montoParaEditarPago,
  normalizarMontoPago,
  pagoVesBloqueadoPorFaltaTasa,
  saldoVesProyectado,
  tasaEfectivaNumerica,
  validarMontoPago,
} from './pagos-montos';

describe('pagos-montos', () => {
  it('tasaEfectivaNumerica: número válido, ausente y no numérico', () => {
    expect(tasaEfectivaNumerica('65.0000')).toBe(65);
    expect(tasaEfectivaNumerica(null)).toBe(0);
    expect(tasaEfectivaNumerica(undefined)).toBe(0);
    expect(tasaEfectivaNumerica('no-numero')).toBe(0);
  });

  it('etiquetaFaltaTasa: null con tasa; distingue fallo de consulta del dato real', () => {
    expect(etiquetaFaltaTasa('65.0000', false)).toBeNull();
    expect(etiquetaFaltaTasa(null, true)).toBe('Tasa no disponible');
    expect(etiquetaFaltaTasa(null, false)).toBe('Sin tasa configurada');
    expect(etiquetaFaltaTasa('', false)).toBe('Sin tasa configurada');
  });

  it('pagoVesBloqueadoPorFaltaTasa: solo VES con ausencia confirmada', () => {
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.VES, null, false)).toBe(true);
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.VES, '', false)).toBe(true);
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.VES, undefined, false)).toBe(true);
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.VES, null, true)).toBe(false);
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.VES, '65.0000', false)).toBe(false);
    expect(pagoVesBloqueadoPorFaltaTasa(Moneda.USD, null, false)).toBe(false);
  });

  it('contravalorUsd: convierte VES con tasa y no inventa sin ella; USD directo', () => {
    expect(contravalorUsd(Moneda.VES, '1300.00', 65)).toBe('20.00');
    expect(contravalorUsd(Moneda.VES, '1300.00', 0)).toBe('—');
    expect(contravalorUsd(Moneda.USD, '20', 0)).toBe('20.00');
    expect(contravalorUsd(Moneda.USD, 'no-numero', 65)).toBe('0.00');
  });

  it('saldoVesProyectado: multiplica el pendiente por la tasa o declara no disponible', () => {
    expect(saldoVesProyectado('30.00', 65)).toBe((30 * 65).toFixed(2));
    expect(saldoVesProyectado('30.00', 0)).toBe('—');
    expect(saldoVesProyectado(null, 65)).toBe((0).toFixed(2));
  });

  describe('montoParaEditarPago (Ítem 26)', () => {
    it('convierte un monto de la API en texto editable con dos decimales y coma decimal', () => {
      expect(montoParaEditarPago('75.00')).toBe('75,00');
      expect(montoParaEditarPago('1900.50')).toBe('1900,50');
      expect(montoParaEditarPago('75.5')).toBe('75,50');
      expect(montoParaEditarPago(' 75 ')).toBe('75,00');
      expect(montoParaEditarPago('75,5')).toBe('75,50');
      expect(montoParaEditarPago('75')).toBe('75,00');
      expect(montoParaEditarPago('1234567.89')).toBe('1234567,89');
    });

    it('devuelve tal cual entradas vacías, no numéricas o <= 0', () => {
      expect(montoParaEditarPago('')).toBe('');
      expect(montoParaEditarPago('abc')).toBe('abc');
      expect(montoParaEditarPago('0')).toBe('0');
      expect(montoParaEditarPago('-10')).toBe('-10');
    });

    it('garantiza round trip para montos válidos de la API (validarMontoPago es null y normalizarMontoPago restaura con punto)', () => {
      const editado1900 = montoParaEditarPago('1900.50');
      expect(editado1900).toBe('1900,50');
      expect(validarMontoPago(editado1900)).toBeNull();
      expect(normalizarMontoPago(editado1900)).toBe('1900.50');

      const casos = ['75.00', '75.5', '75', '1234567.89'];
      for (const m of casos) {
        const editado = montoParaEditarPago(m);
        expect(validarMontoPago(editado)).toBeNull();
        expect(normalizarMontoPago(editado)).toBe(normalizarMontoPago(m));
      }
    });
  });
});
