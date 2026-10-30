/**
 * 01 · UX-10 · Contrato E2 · textoSaldoBs en formato venezolano.
 *
 * E2: lib/cartera.ts textoSaldoBs con saldoPendienteBs: '1825.00' -> "Bs. 1.825,00".
 */
import { describe, expect, it } from 'vitest';
import { textoSaldoBs } from './cartera';

describe('Contrato E2 · textoSaldoBs formato venezolano (UX-10)', () => {
  it('formatea el saldo en bolívares con separadores venezolanos (Bs. 1.825,00)', () => {
    const resultado = textoSaldoBs({ saldoPendienteBs: '1825.00' } as any);
    expect(resultado).toBe('Bs. 1.825,00');
  });

  it('devuelve null si saldoPendienteBs no existe', () => {
    const resultado = textoSaldoBs({ saldoPendienteBs: null } as any);
    expect(resultado).toBeNull();
  });
});
