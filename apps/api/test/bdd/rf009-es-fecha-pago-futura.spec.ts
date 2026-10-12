import { describe, expect, it } from 'vitest';
import { esFechaPagoFutura } from '../../src/modules/finanzas/finanzas.service';

/**
 * RF-009/RF-007 (pagos con fecha anterior): contrato 2 — función pura `esFechaPagoFutura`.
 *
 * Fase ROJA: `esFechaPagoFutura` todavía no existe en `finanzas.service.ts`.
 *
 * Regla del dueño: una fecha es futura SOLO si es posterior a "hoy" en la zona más adelantada
 * (`Pacific/Kiritimati`, UTC+14). Así la API nunca rechaza por diferencias de zona entre el
 * entrenador y el alumno.
 */
describe('RF-009/RF-007 · contrato 2: esFechaPagoFutura (día local de Pacific/Kiritimati)', () => {
  /** En Kiritimati (UTC+14) este instante ya es el día local 2026-10-12. */
  const AHORA = new Date('2026-10-11T23:00:00.000Z');

  it("2a · el día local de Kiritimati ('2026-10-12') todavía NO es futuro", () => {
    expect(esFechaPagoFutura('2026-10-12', AHORA)).toBe(false);
  });

  it("2b · el día siguiente ('2026-10-13') sí es futuro", () => {
    expect(esFechaPagoFutura('2026-10-13', AHORA)).toBe(true);
  });

  it("2c · una fecha anterior ('2026-09-30') no es futura", () => {
    expect(esFechaPagoFutura('2026-09-30', AHORA)).toBe(false);
  });

  it('2d · a medianoche UTC la regla sigue el día local de Kiritimati, no el día UTC', () => {
    // 2026-10-11T00:00:00Z → en Kiritimati son las 14:00 del 2026-10-11.
    const mananaUtc = new Date('2026-10-11T00:00:00.000Z');
    expect(esFechaPagoFutura('2026-10-11', mananaUtc)).toBe(false);
    expect(esFechaPagoFutura('2026-10-12', mananaUtc)).toBe(true);
  });
});
