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
  pagoVesBloqueadoPorFaltaTasa,
  saldoVesProyectado,
  tasaEfectivaNumerica,
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
});
