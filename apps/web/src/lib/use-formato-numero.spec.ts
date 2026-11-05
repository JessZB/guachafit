// @vitest-environment happy-dom
/**
 * Spec de `lib/use-formato-numero.ts` (§6.17 de `00_Reglas_Desarrollo_SDD.md`).
 *
 * Comprueba:
 * 1. result.current.formato es 'coma-decimal' (FORMATO_NUMERO_POR_DEFECTO).
 * 2. formatMonto('50', 'USD', { conCodigo: true }) -> '$50,00 USD' y formatMonto('36500', 'VES') -> 'Bs. 36.500,00'.
 * 3. formatDecimal('36.5', { decimales: 4 }) -> '36,5000'.
 * 4. el objeto devuelto es estable entre renders (rerender() conserva la misma referencia).
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormatoNumero } from './use-formato-numero';
import { FORMATO_NUMERO_POR_DEFECTO } from './formato-monto';

describe('useFormatoNumero (§6.17)', () => {
  it('1 · formato activo es "coma-decimal" (FORMATO_NUMERO_POR_DEFECTO)', () => {
    const { result } = renderHook(() => useFormatoNumero());
    expect(result.current.formato).toBe('coma-decimal');
    expect(result.current.formato).toBe(FORMATO_NUMERO_POR_DEFECTO);
  });

  it('2 · formatMonto aplica formato venezolano con y sin código de moneda', () => {
    const { result } = renderHook(() => useFormatoNumero());
    expect(result.current.formatMonto('50', 'USD', { conCodigo: true })).toBe('$50,00 USD');
    expect(result.current.formatMonto('36500', 'VES')).toBe('Bs. 36.500,00');
  });

  it('3 · formatDecimal formatea decimales con coma y respeta precisión solicitada', () => {
    const { result } = renderHook(() => useFormatoNumero());
    expect(result.current.formatDecimal('36.5', { decimales: 4 })).toBe('36,5000');
  });

  it('4 · el objeto devuelto es estable entre renders (misma referencia)', () => {
    const { result, rerender } = renderHook(() => useFormatoNumero());
    const primeraReferencia = result.current;
    rerender();
    expect(result.current).toBe(primeraReferencia);
  });
});
