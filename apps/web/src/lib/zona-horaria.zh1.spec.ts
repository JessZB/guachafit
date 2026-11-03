/**
 * Specs ZH-1 · Lógica pura de zona horaria (Fase roja TDD).
 * Contrato A: desfaseMinutosEnZona, hayDiscrepanciaZona, claveAvisoZona.
 */
import { describe, expect, it } from 'vitest';
import * as moduloZonaHoraria from './zona-horaria';

const {
  desfaseMinutosEnZona,
  hayDiscrepanciaZona,
  claveAvisoZona,
} = moduloZonaHoraria as unknown as {
  desfaseMinutosEnZona?: (zona: string | null | undefined, instante?: Date) => number | null;
  hayDiscrepanciaZona?: (
    zonaPerfil: string | null | undefined,
    zonaDispositivo: string | null | undefined,
    instante?: Date
  ) => boolean;
  claveAvisoZona?: (usuarioId: string, zonaPerfil: string, zonaDispositivo: string) => string;
};

describe('zona-horaria · Contrato A (ZH-1)', () => {
  it('W1: desfaseMinutosEnZona con los casos de la tabla A (incluidos verano e invierno de Madrid, y las entradas inválidas)', () => {
    expect(typeof desfaseMinutosEnZona).toBe('function');
    if (!desfaseMinutosEnZona) return;

    // America/Caracas -> -240 (UTC-4)
    expect(desfaseMinutosEnZona('America/Caracas')).toBe(-240);

    // Europe/Madrid el 2026-11-03T12:00:00Z (invierno) -> 60 (UTC+1)
    const inviernoMadrid = new Date('2026-11-03T12:00:00Z');
    expect(desfaseMinutosEnZona('Europe/Madrid', inviernoMadrid)).toBe(60);

    // Europe/Madrid el 2026-07-01T12:00:00Z (verano) -> 120 (UTC+2)
    const veranoMadrid = new Date('2026-07-01T12:00:00Z');
    expect(desfaseMinutosEnZona('Europe/Madrid', veranoMadrid)).toBe(120);

    // Asia/Kolkata -> 330 (UTC+5:30)
    expect(desfaseMinutosEnZona('Asia/Kolkata')).toBe(330);

    // Entradas inválidas -> null
    expect(desfaseMinutosEnZona('')).toBeNull();
    expect(desfaseMinutosEnZona('Zona/Invalida_Inexistente')).toBeNull();
    expect(desfaseMinutosEnZona(null)).toBeNull();
    expect(desfaseMinutosEnZona(undefined)).toBeNull();
  });

  it('W2: hayDiscrepanciaZona con Caracas/La_Paz, Caracas/Madrid, entradas inválidas y Bogotá/Nueva York el 2026-01-15T12:00:00Z y el 2026-07-01T12:00:00Z', () => {
    expect(typeof hayDiscrepanciaZona).toBe('function');
    if (!hayDiscrepanciaZona) return;

    // America/Caracas frente a America/La_Paz -> false (ambas -240)
    expect(hayDiscrepanciaZona('America/Caracas', 'America/La_Paz')).toBe(false);

    // America/Caracas frente a Europe/Madrid -> true (-240 vs +60/+120)
    expect(hayDiscrepanciaZona('America/Caracas', 'Europe/Madrid')).toBe(true);

    // Si cualquiera es inválida, null o undefined -> false
    expect(hayDiscrepanciaZona(null, 'America/Caracas')).toBe(false);
    expect(hayDiscrepanciaZona('America/Caracas', null)).toBe(false);
    expect(hayDiscrepanciaZona(undefined, 'America/Caracas')).toBe(false);
    expect(hayDiscrepanciaZona('America/Caracas', undefined)).toBe(false);
    expect(hayDiscrepanciaZona('', 'America/Caracas')).toBe(false);
    expect(hayDiscrepanciaZona('America/Caracas', '')).toBe(false);
    expect(hayDiscrepanciaZona('Invalida', 'America/Caracas')).toBe(false);
    expect(hayDiscrepanciaZona('America/Caracas', 'Invalida')).toBe(false);

    // America/Bogota (siempre -300) frente a America/New_York
    // 2026-01-15T12:00:00Z (invierno en NY, ambas -300) -> false
    const inviernoNy = new Date('2026-01-15T12:00:00Z');
    expect(hayDiscrepanciaZona('America/Bogota', 'America/New_York', inviernoNy)).toBe(false);

    // 2026-07-01T12:00:00Z (verano en NY: NY es -240, Bogotá es -300) -> true
    const veranoNy = new Date('2026-07-01T12:00:00Z');
    expect(hayDiscrepanciaZona('America/Bogota', 'America/New_York', veranoNy)).toBe(true);
  });

  it('W3: claveAvisoZona("u1","America/Caracas","Europe/Madrid")', () => {
    expect(typeof claveAvisoZona).toBe('function');
    if (!claveAvisoZona) return;

    expect(claveAvisoZona('u1', 'America/Caracas', 'Europe/Madrid')).toBe(
      'guachafit:aviso-zona:u1:America/Caracas|Europe/Madrid'
    );
  });
});
