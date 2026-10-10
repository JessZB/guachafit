import { describe, it, expect } from 'vitest';
import {
  DIAS_ANTICIPACION_EMISION,
  sumarMesesCalendario,
  calcularSiguienteCorte,
  debeEmitirCuota,
  corteVigente,
  instanteCorteUtc,
  periodoDeCorte,
} from '../../src/modules/finanzas/suscripcion-ciclo';

/**
 * M5-L1 §A (RF-005 / RF-008 / RNF-002): funciones puras del ciclo de suscripción.
 *
 * Fijan las decisiones del dueño: emisión automática, cuota que vence al INICIO del periodo
 * que cubre, ciclos en MESES DE CALENDARIO (el día se fija al de inicio y se ajusta al último
 * día si el mes destino es más corto) y ventana de emisión T-5.
 *
 * En fase roja este spec FALLA porque `apps/api/src/modules/finanzas/suscripcion-ciclo.ts`
 * todavía no existe (import sin módulo). No se implementa nada aquí: es el contrato.
 */
describe('M5-L1 §A: ciclo de suscripción — funciones puras (RF-005 / RF-008)', () => {
  it('§A1: DIAS_ANTICIPACION_EMISION es 5 (ventana T-5 de RF-008 §4.B)', () => {
    expect(DIAS_ANTICIPACION_EMISION).toBe(5);
  });

  describe('§A2: sumarMesesCalendario ajusta el día al último del mes destino', () => {
    it('suma 3 meses conservando el mismo día (2026-03-15 → 2026-06-15)', () => {
      expect(sumarMesesCalendario('2026-03-15', 3)).toBe('2026-06-15');
    });

    it('cruza el fin de año (2026-12-10 → 2027-01-10)', () => {
      expect(sumarMesesCalendario('2026-12-10', 1)).toBe('2027-01-10');
    });

    it('ajusta al último día de febrero en año no bisiesto (2026-01-31 → 2026-02-28)', () => {
      expect(sumarMesesCalendario('2026-01-31', 1)).toBe('2026-02-28');
    });

    it('ajusta al 29 de febrero en año bisiesto (2028-01-31 → 2028-02-29)', () => {
      expect(sumarMesesCalendario('2028-01-31', 1)).toBe('2028-02-29');
    });

    it('ajusta al último día de junio (2026-05-31 → 2026-06-30)', () => {
      expect(sumarMesesCalendario('2026-05-31', 1)).toBe('2026-06-30');
    });
  });

  describe('§A3: calcularSiguienteCorte siempre calcula desde el ancla (sin arrastrar ajustes)', () => {
    it('un ancla al 31 no se queda pegada al 28 (2026-01-31 + 1 desde ancla → 2026-03-31)', () => {
      expect(calcularSiguienteCorte('2026-01-31', '2026-02-28', 1)).toBe('2026-03-31');
    });

    it('ciclo trimestral (2026-01-15 → 2026-04-15)', () => {
      expect(calcularSiguienteCorte('2026-01-15', '2026-01-15', 3)).toBe('2026-04-15');
    });

    it('ciclo mensual (2026-01-10 → 2026-02-10)', () => {
      expect(calcularSiguienteCorte('2026-01-10', '2026-01-10', 1)).toBe('2026-02-10');
    });
  });

  describe('§A4: debeEmitirCuota abre la ventana 5 días antes del corte', () => {
    it('emite exactamente en T-5 (2026-10-20 con hoy 2026-10-15)', () => {
      expect(debeEmitirCuota('2026-10-20', '2026-10-15')).toBe(true);
    });

    it('no emite en T-6 (2026-10-20 con hoy 2026-10-14)', () => {
      expect(debeEmitirCuota('2026-10-20', '2026-10-14')).toBe(false);
    });

    it('emite con el corte ya vencido (hoy posterior al corte)', () => {
      expect(debeEmitirCuota('2026-10-20', '2026-10-25')).toBe(true);
    });
  });

  describe('§A5: corteVigente salta ciclos atrasados sin cobrar meses en bloque', () => {
    it('alumno pausado 3 ciclos → solo el corte más avanzado que ya cumple la ventana (2026-05-10)', () => {
      expect(corteVigente('2026-01-10', '2026-02-10', 1, '2026-05-07')).toBe('2026-05-10');
    });

    it('a 4 días de la ventana de mayo → emite abril, no mayo (2026-04-10)', () => {
      expect(corteVigente('2026-01-10', '2026-02-10', 1, '2026-05-04')).toBe('2026-04-10');
    });

    it('dentro de la ventana de febrero → emite febrero (2026-02-10)', () => {
      expect(corteVigente('2026-01-10', '2026-02-10', 1, '2026-02-06')).toBe('2026-02-10');
    });
  });

  describe('§A6: instanteCorteUtc es el último milisegundo del día local', () => {
    it('America/Caracas (UTC-4) → 2026-10-16T03:59:59.999Z', () => {
      expect(instanteCorteUtc('2026-10-15', 'America/Caracas').toISOString()).toBe(
        '2026-10-16T03:59:59.999Z'
      );
    });

    it('una zona inválida cae a UTC sin romper', () => {
      expect(instanteCorteUtc('2026-10-15', 'Zona/Invalida').toISOString()).toBe(
        '2026-10-15T23:59:59.999Z'
      );
    });
  });

  describe('§A7: periodoDeCorte deriva el periodo del corte', () => {
    it('2026-10-15 → 2026-10', () => {
      expect(periodoDeCorte('2026-10-15')).toBe('2026-10');
    });
  });
});
