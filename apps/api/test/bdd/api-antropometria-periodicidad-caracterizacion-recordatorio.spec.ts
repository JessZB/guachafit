import { describe, it, expect } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  evaluarRecordatorioAntropometria,
  HORA_RECORDATORIO_ANTROPOMETRIA,
  obtenerHoraLocalEnTimezone,
} from '../../src/modules/antropometria/antropometria-periodicidad.util';

/**
 * Caracterización del recordatorio de las 06:00 locales (RN-01): hora local en zona IANA y
 * correspondencia del aviso en fecha programada. Módulo puro: sin base de datos.
 */
describe('Caracterización periodicidad: hora local y recordatorio', () => {
  describe('hora local en zona IANA', () => {
    it('la hora del recordatorio es las 06:00 locales', () => {
      expect(HORA_RECORDATORIO_ANTROPOMETRIA).toBe(6);
    });

    it('lee las 06:00 de Caracas desde un instante UTC', () => {
      expect(
        obtenerHoraLocalEnTimezone(new Date('2026-09-07T10:00:00.000Z'), 'America/Caracas')
      ).toBe(6);
    });

    it('la medianoche local es la hora 0, nunca 24', () => {
      expect(
        obtenerHoraLocalEnTimezone(new Date('2026-09-07T04:00:00.000Z'), 'America/Caracas')
      ).toBe(0);
    });
  });

  describe('correspondencia del recordatorio', () => {
    it('corresponde a las 06:00 locales del día programado', () => {
      const resultado = evaluarRecordatorioAntropometria({
        periodicidad: PeriodicidadAntropometria.SEMANAL,
        antropometriaInicio: '2026-09-07',
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });

      expect(resultado.corresponde).toBe(true);
      expect(resultado.fechaProgramada).toBe('2026-09-07');
      expect(resultado.referenciaId).toBe('antropometria_2026-09-07');
    });

    it('no corresponde una hora después aunque sea día programado', () => {
      const resultado = evaluarRecordatorioAntropometria({
        periodicidad: PeriodicidadAntropometria.SEMANAL,
        antropometriaInicio: '2026-09-07',
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-07T11:00:00.000Z'),
      });

      expect(resultado.corresponde).toBe(false);
      expect(resultado.horaLocal).toBe(7);
    });

    it('no corresponde fuera del día programado aunque sean las 06:00', () => {
      const resultado = evaluarRecordatorioAntropometria({
        periodicidad: PeriodicidadAntropometria.SEMANAL,
        antropometriaInicio: '2026-09-07',
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-09T10:00:00.000Z'),
      });

      expect(resultado.corresponde).toBe(false);
      expect(resultado.fechaProgramada).toBeNull();
    });
  });
});
