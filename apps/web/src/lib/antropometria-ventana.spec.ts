import { describe, expect, it } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  calcularEstadoVentanaCheckinAntropometrico,
  desplazarMesesCalendario,
  fechasProgramadasAntropometria,
  rangoVentanaAntropometria,
} from './antropometria-ventana';
import { formatFechaCalendario } from './date-format';

/**
 * RF-003 RN-01/RN-04 (WU RF-003b): el calendario y la ventana de la UI deben coincidir con el
 * helper puro del API. La ventana del día programado `D` cubre los días locales `D-1` y `D`
 * (fin EXCLUSIVO en `D+1`).
 */
describe('desplazarMesesCalendario (RN-01: meses calendario con saturación)', () => {
  it('conserva el día del mes cuando existe', () => {
    expect(desplazarMesesCalendario('2026-09-07', 1)).toBe('2026-10-07');
    expect(desplazarMesesCalendario('2026-09-07', 12)).toBe('2027-09-07');
  });

  it('satura al último día disponible (31 → 28/30)', () => {
    expect(desplazarMesesCalendario('2026-01-31', 1)).toBe('2026-02-28');
    expect(desplazarMesesCalendario('2026-03-31', 1)).toBe('2026-04-30');
    expect(desplazarMesesCalendario('2026-08-31', 1)).toBe('2026-09-30');
  });
});

describe('fechasProgramadasAntropometria (RN-01: fechas alrededor de hoy)', () => {
  it('semanal: devuelve la fecha de hoy y la próxima cuando hoy toca control', () => {
    const { anterior, siguiente } = fechasProgramadasAntropometria(
      '2026-09-07',
      PeriodicidadAntropometria.SEMANAL,
      '2026-09-07'
    );
    expect(anterior).toBe('2026-09-07');
    expect(siguiente).toBe('2026-09-07');
  });

  it('quincenal: sitúa la anterior y la siguiente alrededor del día local', () => {
    const { anterior, siguiente } = fechasProgramadasAntropometria(
      '2026-09-07',
      PeriodicidadAntropometria.QUINCENAL,
      '2026-09-20'
    );
    expect(anterior).toBe('2026-09-07');
    expect(siguiente).toBe('2026-09-21');
  });

  it('ancla futura: no hay fecha anterior y la siguiente es el ancla', () => {
    const { anterior, siguiente } = fechasProgramadasAntropometria(
      '2026-10-01',
      PeriodicidadAntropometria.SEMANAL,
      '2026-09-23'
    );
    expect(anterior).toBeNull();
    expect(siguiente).toBe('2026-10-01');
  });

  it('mensual con saturación: el 31 de enero programa el 28 de febrero', () => {
    const { anterior, siguiente } = fechasProgramadasAntropometria(
      '2026-01-31',
      PeriodicidadAntropometria.MENSUAL,
      '2026-02-10'
    );
    expect(anterior).toBe('2026-01-31');
    expect(siguiente).toBe('2026-02-28');
  });
});

describe('calcularEstadoVentanaCheckinAntropometrico (RN-04/§6: ventana de 48 h)', () => {
  it('sin periodicidad o sin ancla la ventana NO aplica y el registro sigue permitido', () => {
    const sinPeriodicidad = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: null,
      antropometriaInicio: '2026-09-07',
      hoyLocal: '2026-09-20',
    });
    expect(sinPeriodicidad.estado).toBe('sin_calendario');
    expect(sinPeriodicidad.aplica).toBe(false);
    expect(sinPeriodicidad.permiteRegistrar).toBe(true);
    expect(sinPeriodicidad.mensaje).toBe('');

    const sinAncla = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: null,
      hoyLocal: '2026-09-20',
    });
    expect(sinAncla.estado).toBe('sin_calendario');
  });

  it('un ancla malformada cae a sin_calendario en vez de romper la pantalla', () => {
    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '07/09/2026',
      hoyLocal: '2026-09-20',
    });
    expect(estado.estado).toBe('sin_calendario');
    expect(estado.permiteRegistrar).toBe(true);
  });

  it('el día programado y el día anterior están dentro de la ventana', () => {
    const diaAnterior = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      hoyLocal: '2026-09-06',
    });
    expect(diaAnterior.estado).toBe('abierta');
    expect(diaAnterior.permiteRegistrar).toBe(true);
    expect(diaAnterior.ventanaVigente).toEqual({
      fechaProgramada: '2026-09-07',
      desde: '2026-09-06',
      hasta: '2026-09-07',
      hastaExclusivo: '2026-09-08',
    });

    const diaProgramado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      hoyLocal: '2026-09-07',
    });
    expect(diaProgramado.estado).toBe('abierta');
    expect(diaProgramado.mensaje).toMatch(/Ventana abierta/);
  });

  it('el día siguiente al programado la ventana ya cerró (fin exclusivo) y anuncia la próxima', () => {
    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      hoyLocal: '2026-09-08',
    });
    expect(estado.estado).toBe('cerrada');
    expect(estado.permiteRegistrar).toBe(false);
    expect(estado.ultimaVentanaVencida?.fechaProgramada).toBe('2026-09-07');
    expect(estado.proximaVentana?.fechaProgramada).toBe('2026-09-14');
    expect(estado.mensaje).toMatch(/Ventana cerrada/);
    expect(estado.mensaje).toMatch(/La próxima abre/);
    expect(estado.motivoBloqueo).toBe('Tu ventana de check-in está cerrada');
  });

  it('la víspera de la próxima fecha ya está dentro de la ventana', () => {
    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      hoyLocal: '2026-09-13',
    });
    expect(estado.estado).toBe('abierta');
    expect(estado.ventanaVigente?.fechaProgramada).toBe('2026-09-14');
  });

  it('con el ancla en el futuro la ventana está próxima a abrir', () => {
    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.QUINCENAL,
      antropometriaInicio: '2026-10-01',
      hoyLocal: '2026-09-23',
    });
    expect(estado.estado).toBe('proxima');
    expect(estado.permiteRegistrar).toBe(false);
    expect(estado.proximaVentana).toEqual({
      fechaProgramada: '2026-10-01',
      desde: '2026-09-30',
      hasta: '2026-10-01',
      hastaExclusivo: '2026-10-02',
    });
    expect(estado.mensaje).toMatch(/Tu ventana abre/);
    expect(estado.motivoBloqueo).toBe(
      `Tu ventana abre el ${formatFechaCalendario('2026-09-30')}`
    );
  });

  it('mensual: la ventana del 28 de febrero abre el 27 y cierra al terminar el 28', () => {
    const vispera = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.MENSUAL,
      antropometriaInicio: '2026-01-31',
      hoyLocal: '2026-02-27',
    });
    expect(vispera.estado).toBe('abierta');
    expect(vispera.ventanaVigente?.fechaProgramada).toBe('2026-02-28');

    const cerrada = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.MENSUAL,
      antropometriaInicio: '2026-01-31',
      hoyLocal: '2026-03-01',
    });
    expect(cerrada.estado).toBe('cerrada');
    expect(cerrada.ultimaVentanaVencida?.fechaProgramada).toBe('2026-02-28');
    expect(cerrada.proximaVentana?.fechaProgramada).toBe('2026-03-31');
  });
});

describe('rangoVentanaAntropometria', () => {
  it('expone el rango inclusivo visible y el fin exclusivo', () => {
    expect(rangoVentanaAntropometria('2026-09-07')).toEqual({
      fechaProgramada: '2026-09-07',
      desde: '2026-09-06',
      hasta: '2026-09-07',
      hastaExclusivo: '2026-09-08',
    });
  });
});
