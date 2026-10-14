import { describe, it, expect } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  calcularEstadoCalendarioAntropometria,
  resolverTimezoneAntropometria,
  TIMEZONE_ANTROPOMETRIA_POR_DEFECTO,
} from '../../src/modules/antropometria/antropometria-periodicidad.util';

/**
 * Caracterización del calendario de periodicidad (RN-01): resolución de zona y lectura del
 * estado del calendario en el día local del alumno. Cubre lo que el modelo no importa de
 * forma directa. Módulo puro: sin base de datos.
 */
describe('Caracterización periodicidad: zona y estado del calendario', () => {
  describe('resolución de la zona del alumno', () => {
    it('conserva una zona IANA válida', () => {
      expect(resolverTimezoneAntropometria('Europe/Madrid')).toBe('Europe/Madrid');
    });

    it('cae a la zona por defecto del producto con zona inválida o ausente', () => {
      expect(TIMEZONE_ANTROPOMETRIA_POR_DEFECTO).toBe('America/Caracas');
      expect(resolverTimezoneAntropometria('No/Existe')).toBe('America/Caracas');
      expect(resolverTimezoneAntropometria(undefined)).toBe('America/Caracas');
      expect(resolverTimezoneAntropometria(null)).toBe('America/Caracas');
    });
  });

  describe('lectura del estado del calendario', () => {
    it('sin periodicidad ni ancla no hay calendario (comportamiento previo)', () => {
      const estado = calcularEstadoCalendarioAntropometria({
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });

      expect(estado.configurado).toBe(false);
      expect(estado.fechaProgramada).toBeNull();
      expect(estado.proximaFecha).toBeNull();
      expect(estado.esDiaProgramado).toBe(false);
    });

    it('el día del ancla semanal es día programado', () => {
      const estado = calcularEstadoCalendarioAntropometria({
        periodicidad: PeriodicidadAntropometria.SEMANAL,
        antropometriaInicio: '2026-09-07',
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });

      expect(estado.configurado).toBe(true);
      expect(estado.hoyLocal).toBe('2026-09-07');
      expect(estado.esDiaProgramado).toBe(true);
      expect(estado.fechaProgramada).toBe('2026-09-07');
      expect(estado.proximaFecha).toBe('2026-09-07');
    });

    it('con ancla futura la próxima fecha es el ancla y hoy no es programado', () => {
      const estado = calcularEstadoCalendarioAntropometria({
        periodicidad: PeriodicidadAntropometria.SEMANAL,
        antropometriaInicio: '2026-09-10',
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });

      expect(estado.configurado).toBe(true);
      expect(estado.esDiaProgramado).toBe(false);
      expect(estado.proximaFecha).toBe('2026-09-10');
    });
  });
});
