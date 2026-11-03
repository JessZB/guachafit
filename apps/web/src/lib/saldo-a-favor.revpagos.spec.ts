import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { textoSaldoAFavor } from './saldo-a-favor';
import { formatDecimal, formatMonto } from './formato-monto';

const fm = (v: string, m: 'USD' | 'VES', o?: { conCodigo?: boolean }) =>
  formatMonto(v, m, { ...o, formato: 'coma-decimal' });
const fd = (v: string, decimales: number) =>
  formatDecimal(v, { decimales, formato: 'coma-decimal' });

afterEach(() => {
  cleanup();
});

describe('lib/saldo-a-favor · extensión con useFormatoNumero', () => {
  it('P5: textoSaldoAFavor sin tercer parámetro conserva los textos históricos sin cambios', () => {
    expect(textoSaldoAFavor('10.00', '65')).toBe('Saldo a favor: 10.00 USD (≈ Bs. 650.00)');
    expect(textoSaldoAFavor('10.00')).toBe('Saldo a favor: 10.00 USD');
  });

  it('P6: textoSaldoAFavor con tercer parámetro fm formatea importes con formato común y omite aproximación sin tasa válida', () => {
    const usd = '1900.00';
    const tasa = '65.0000';
    const bs = ((Number(usd) * Number(tasa))).toFixed(2);

    const esperadoConTasa = `Saldo a favor: ${fm(usd, 'USD', { conCodigo: true })} (≈ ${fm(bs, 'VES')})`;
    const esperadoSinTasa = `Saldo a favor: ${fm(usd, 'USD', { conCodigo: true })}`;

    expect((textoSaldoAFavor as any)(usd, tasa, fm)).toBe(esperadoConTasa);
    expect((textoSaldoAFavor as any)(usd, undefined, fm)).toBe(esperadoSinTasa);

    const resultadoConTasaCero = (textoSaldoAFavor as any)(usd, '0', fm);
    expect(resultadoConTasaCero).toBe(esperadoSinTasa);
    expect(resultadoConTasaCero).not.toContain('≈');
  });
});
