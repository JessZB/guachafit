import { describe, expect, it } from 'vitest';
import {
  construirPayloadCheckinAntropometrico,
  fechaLocalHoy,
} from './antropometria-checkin';

const ALUMNO_ID = 'a3333333-3333-4333-8333-333333333333';

describe('construirPayloadCheckinAntropometrico (RF-003: contrato del check-in real)', () => {
  it('construye el payload mínimo válido con alumnoId y fechaEvaluacion del contrato', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      { pesoKg: '74.50' },
      '2026-09-20'
    );

    expect(payload.alumnoId).toBe(ALUMNO_ID);
    expect(payload.fechaEvaluacion).toBe('2026-09-20');
    expect(payload.pesoKg).toBe('74.50');
    expect(payload.porcentajeGrasa).toBeUndefined();
    expect(payload.perimetros).toBeUndefined();
    // La UX de fotos no existe todavía: nunca se inventa una subida ni un array vacío.
    expect('fotos' in payload).toBe(false);
  });

  it('normaliza coma decimal, recorta espacios y descarta campos opcionales vacíos', () => {
    const payload = construirPayloadCheckinAntropometrico(
      ALUMNO_ID,
      {
        pesoKg: ' 74,50 ',
        porcentajeGrasa: '14,80',
        cinturaCm: '81,00',
        brazoCm: '',
        pechoCm: '   ',
      },
      '2026-09-20'
    );

    expect(payload.pesoKg).toBe('74.50');
    expect(payload.porcentajeGrasa).toBe('14.80');
    expect(payload.perimetros).toEqual({ cinturaCm: '81.00' });
  });

  it('rechaza con mensaje claro un peso fuera del rango biológico (nunca viaja a la API)', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico(ALUMNO_ID, { pesoKg: '20.00' }, '2026-09-20')
    ).toThrowError(/peso debe estar entre 30.00 kg y 300.00 kg/i);
  });

  it('rechaza un porcentaje de grasa fuera del rango biológico', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico(
        ALUMNO_ID,
        { pesoKg: '70.00', porcentajeGrasa: '90.00' },
        '2026-09-20'
      )
    ).toThrowError(/porcentaje de grasa debe estar entre 2.00% y 70.00%/i);
  });

  it('rechaza un alumnoId que no sea UUID (el service busca por usuarioId)', () => {
    expect(() =>
      construirPayloadCheckinAntropometrico('user-demo-1', { pesoKg: '70.00' }, '2026-09-20')
    ).toThrowError(/UUID válido/i);
  });
});

describe('fechaLocalHoy', () => {
  it('devuelve la fecha local en YYYY-MM-DD sin desfase UTC (America/Caracas por la noche)', () => {
    // 20/09/2026 a las 22:30 local: en UTC ya sería el día 21.
    expect(fechaLocalHoy(new Date(2026, 8, 20, 22, 30, 0))).toBe('2026-09-20');
  });

  it('rellena mes y día con cero a la izquierda', () => {
    expect(fechaLocalHoy(new Date(2026, 0, 5, 8, 0, 0))).toBe('2026-01-05');
  });
});
