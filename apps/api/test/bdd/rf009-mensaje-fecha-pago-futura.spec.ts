import { describe, expect, it } from 'vitest';
import { MENSAJE_FECHA_PAGO_FUTURA } from '@guachafit/shared';

/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 1 — constante compartida.
 *
 * Fase ROJA: `MENSAJE_FECHA_PAGO_FUTURA` todavía no existe en `@guachafit/shared`; el valor
 * aprobado por el dueño es el texto exacto que la API y la web deben mostrar.
 */
describe('RF-009/RF-007 · contrato 1: MENSAJE_FECHA_PAGO_FUTURA', () => {
  it('1 · la constante vale exactamente el mensaje aprobado', () => {
    expect(MENSAJE_FECHA_PAGO_FUTURA).toBe('La fecha del pago no puede ser posterior a hoy.');
  });
});
