/**
 * Pure-logic specs for the conciliation demo queue.
 */
import { describe, expect, it } from 'vitest';
import { COMPROBANTE_DEMO_URL, crearColaDemo } from './conciliacion-demo';

describe('conciliacion-demo', () => {
  it('exposes the demo receipt URL over https', () => {
    expect(COMPROBANTE_DEMO_URL.startsWith('https://')).toBe(true);
  });

  it('builds the two-item WU20 queue with stable identities', () => {
    const cola = crearColaDemo();
    expect(cola.map((tx) => tx.id)).toEqual(['tx-pending-1', 'tx-pending-2']);
    expect(cola.map((tx) => tx.clienteNombre)).toEqual(['Carlos Mendoza', 'Mariana Pérez']);
    expect(cola.map((tx) => tx.metodoPago)).toEqual(['pago_movil', 'zelle']);
    expect(cola.map((tx) => tx.referenciaBancaria)).toEqual(['445566', 'ZEL-998811']);
  });

  it('returns a fresh queue on every call', () => {
    expect(crearColaDemo()).not.toBe(crearColaDemo());
  });
});
