import { describe, it, expect } from 'vitest';
import {
  fechaCalendarioLocal,
  formatFechaCalendario,
  formatFechaLargaCalendario,
  sumarDiasCalendario,
  ultimosDiasCalendario,
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

describe('fechaCalendarioLocal y aritmética de días (RF-002: día local, no UTC)', () => {
  it('devuelve el día LOCAL del dispositivo (nunca el día UTC)', () => {
    const tarde = new Date(2026, 8, 21, 21, 30, 0);
    expect(fechaCalendarioLocal(tarde)).toBe('2026-09-21');
    expect(fechaCalendarioLocal(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
    expect(fechaCalendarioLocal(new Date(2026, 11, 31, 23, 59, 0))).toBe('2026-12-31');
  });

  it('suma y resta días calendario cruzando fin de mes y de año', () => {
    expect(sumarDiasCalendario('2026-09-21', -1)).toBe('2026-09-20');
    expect(sumarDiasCalendario('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDiasCalendario('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('enumera los últimos N días en orden descendente e ignora entradas inválidas', () => {
    expect(ultimosDiasCalendario('2026-09-21', 3)).toEqual(['2026-09-21', '2026-09-20', '2026-09-19']);
    expect(ultimosDiasCalendario('ayer', 3)).toEqual([]);
    expect(ultimosDiasCalendario('2026-09-21', 0)).toEqual([]);
  });
});
