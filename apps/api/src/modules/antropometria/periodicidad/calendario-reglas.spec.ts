import { describe, it, expect } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  calcularEstadoCalendarioAntropometria,
  desplazarMesesCalendario,
  esDiaProgramadoAntropometria,
  fechasProgramadasAntropometria,
  resolverTimezoneAntropometria,
  sumarDiasCalendario,
} from './calendario-reglas';
import { TIMEZONE_ANTROPOMETRIA_POR_DEFECTO } from './constantes';

/** Reglas del calendario de periodicidad (RN-01): ancla, intervalos y día local. */
describe('calendario de periodicidad antropométrica', () => {
  it('reexporta la aritmética única de fechas de calendario', () => {
    expect(sumarDiasCalendario('2026-09-07', 7)).toBe('2026-09-14');
  });

  it('resuelve la zona del alumno o cae a la zona por defecto', () => {
    expect(resolverTimezoneAntropometria('Europe/Madrid')).toBe('Europe/Madrid');
    expect(resolverTimezoneAntropometria('No/Existe')).toBe(
      TIMEZONE_ANTROPOMETRIA_POR_DEFECTO
    );
    expect(resolverTimezoneAntropometria()).toBe(TIMEZONE_ANTROPOMETRIA_POR_DEFECTO);
  });

  it('desplaza meses saturando al último día disponible', () => {
    expect(desplazarMesesCalendario('2026-01-31', 1)).toBe('2026-02-28');
    expect(desplazarMesesCalendario('2026-01-31', 2)).toBe('2026-03-31');
    expect(desplazarMesesCalendario('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('rodea el día local con las fechas semanal y quincenal vecinas', () => {
    const semanal = fechasProgramadasAntropometria(
      '2026-09-07',
      PeriodicidadAntropometria.SEMANAL,
      '2026-09-10'
    );
    expect(semanal).toEqual({ anterior: '2026-09-07', siguiente: '2026-09-14' });

    const quincenal = fechasProgramadasAntropometria(
      '2026-09-07',
      PeriodicidadAntropometria.QUINCENAL,
      '2026-09-10'
    );
    expect(quincenal).toEqual({ anterior: '2026-09-07', siguiente: '2026-09-21' });
  });

  it('con ancla futura no hay fecha anterior y la siguiente es el ancla', () => {
    expect(
      fechasProgramadasAntropometria(
        '2026-12-01',
        PeriodicidadAntropometria.SEMANAL,
        '2026-09-07'
      )
    ).toEqual({ anterior: null, siguiente: '2026-12-01' });
  });

  it('detecta el día programado mensual con saturación de febrero', () => {
    expect(
      esDiaProgramadoAntropometria(
        '2026-01-31',
        PeriodicidadAntropometria.MENSUAL,
        '2026-02-28'
      )
    ).toBe(true);
    expect(
      esDiaProgramadoAntropometria(
        '2026-09-07',
        PeriodicidadAntropometria.SEMANAL,
        '2026-09-16'
      )
    ).toBe(false);
  });

  it('lee el estado del calendario en el día local del alumno', () => {
    const estado = calcularEstadoCalendarioAntropometria({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      timezone: 'America/Caracas',
      ahora: new Date('2026-09-10T12:00:00.000Z'),
    });

    expect(estado.configurado).toBe(true);
    expect(estado.hoyLocal).toBe('2026-09-10');
    expect(estado.esDiaProgramado).toBe(false);
    expect(estado.fechaProgramada).toBe('2026-09-07');
    expect(estado.proximaFecha).toBe('2026-09-14');
  });
});
