import { describe, it, expect } from 'vitest';
import {
  formatFechaCalendario,
  formatFechaLargaCalendario,
} from './date-format';

/** Mismo formato Intl (locale del entorno) sobre la fecha local esperada: sin desfase UTC. */
function esperadoLargo(anio: number, mes: number, dia: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(anio, mes - 1, dia));
}

function esperadoCorto(anio: number, mes: number, dia: number): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(anio, mes - 1, dia)
  );
}

describe('formatFechaLargaCalendario (RF-004: tooltips y resúmenes del gráfico)', () => {
  it('formatea una fecha calendario como fecha local, sin desfase de zona horaria', () => {
    expect(formatFechaLargaCalendario('2026-07-01')).toBe(esperadoLargo(2026, 7, 1));
    expect(formatFechaLargaCalendario('2026-01-01')).toBe(esperadoLargo(2026, 1, 1));
  });

  it('formatFechaCalendario conserva su comportamiento local (1 ene, nunca 31 dic)', () => {
    expect(formatFechaCalendario('2026-01-01')).toBe(esperadoCorto(2026, 1, 1));
  });

  it('devuelve null ante entradas vacías o inválidas (incluye rollover de mes/día)', () => {
    expect(formatFechaLargaCalendario(null)).toBeNull();
    expect(formatFechaLargaCalendario(undefined)).toBeNull();
    expect(formatFechaLargaCalendario('')).toBeNull();
    expect(formatFechaLargaCalendario('01/07/2026')).toBeNull();
    expect(formatFechaLargaCalendario('2026-13-40')).toBeNull();
    expect(formatFechaLargaCalendario('2026-02-30')).toBeNull();
  });
});
