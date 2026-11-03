/**
 * ZH-2: tests en fase roja para `fechaCalendarioEnZona`.
 * Contrato 1:
 * `lib/zona-horaria.ts` exporta `fechaCalendarioEnZona(zona: string | null | undefined, ahora: Date = new Date()): string`
 * -> 'YYYY-MM-DD' del día calendario en esa zona.
 * Zona nula/indefinida/inválida -> se usa `America/Caracas`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as zonaHorariaModule from './zona-horaria';

const fechaCalendarioEnZona: (
  zona?: string | null,
  ahora?: Date
) => string = (zonaHorariaModule as Record<string, unknown>).fechaCalendarioEnZona as never;

describe('ZH-2 · fechaCalendarioEnZona', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula el día calendario en Tokyo (UTC+9) cuando en Caracas aún es el día anterior', () => {
    // 2026-11-03T20:00:00Z -> Caracas 16:00 (2026-11-03), Tokyo 05:00 (2026-11-04)
    const instante = new Date('2026-11-03T20:00:00Z');
    expect(fechaCalendarioEnZona('Asia/Tokyo', instante)).toBe('2026-11-04');
  });

  it('calcula el día calendario en Madrid (UTC+1) cuando en Caracas aún es el día anterior', () => {
    // 2026-11-04T02:30:00Z -> Madrid 03:30 (2026-11-04), Caracas 22:30 (2026-11-03)
    const instante = new Date('2026-11-04T02:30:00Z');
    expect(fechaCalendarioEnZona('Europe/Madrid', instante)).toBe('2026-11-04');
  });

  it('con zona inválida usa America/Caracas por defecto', () => {
    const instante = new Date('2026-11-03T20:00:00Z');
    expect(fechaCalendarioEnZona('Zona/Invalida_Inventada', instante)).toBe('2026-11-03');
  });

  it('con zona null o undefined usa America/Caracas por defecto', () => {
    const instante = new Date('2026-11-03T20:00:00Z');
    expect(fechaCalendarioEnZona(null, instante)).toBe('2026-11-03');
    expect(fechaCalendarioEnZona(undefined, instante)).toBe('2026-11-03');
  });

  it('sin segundo argumento utiliza la hora del sistema (fake timers)', () => {
    vi.setSystemTime(new Date('2026-11-03T20:00:00Z'));
    expect(fechaCalendarioEnZona('Asia/Tokyo')).toBe('2026-11-04');
  });

  it('regresión Caracas: devuelve el día calendario de America/Caracas', () => {
    const instante = new Date('2026-11-03T20:00:00Z');
    expect(fechaCalendarioEnZona('America/Caracas', instante)).toBe('2026-11-03');
  });
});
