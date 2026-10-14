import { describe, it, expect } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  construirReferenciaExpiracionAntropometria,
  construirReferenciaRecordatorioAntropometria,
  evaluarExpiracionAntropometria,
  evaluarRecordatorioAntropometria,
  obtenerHoraLocalEnTimezone,
} from './recordatorio-reglas';

/** Reglas del recordatorio de las 06:00 (RN-01) y del aviso de ventana vencida (§6). */
describe('recordatorio y expiración antropométrica', () => {
  const semanalCaracas = {
    periodicidad: PeriodicidadAntropometria.SEMANAL,
    antropometriaInicio: '2026-09-07',
    timezone: 'America/Caracas',
  };

  it('construye referencias deterministas para el dedupe entre corridas', () => {
    expect(construirReferenciaRecordatorioAntropometria('2026-09-14')).toBe(
      'antropometria_2026-09-14'
    );
    expect(construirReferenciaExpiracionAntropometria('alumno-1', '2026-09-07')).toBe(
      'antropometria_expirado_alumno-1_2026-09-07'
    );
  });

  it('lee la hora local y la medianoche como hora 0', () => {
    expect(
      obtenerHoraLocalEnTimezone(new Date('2026-09-07T10:00:00.000Z'), 'America/Caracas')
    ).toBe(6);
    expect(
      obtenerHoraLocalEnTimezone(new Date('2026-09-07T04:00:00.000Z'), 'America/Caracas')
    ).toBe(0);
  });

  it('el recordatorio corresponde a las 06:00 del día programado', () => {
    const aLasSeis = evaluarRecordatorioAntropometria({
      ...semanalCaracas,
      ahora: new Date('2026-09-07T10:00:00.000Z'),
    });
    const aLasSiete = evaluarRecordatorioAntropometria({
      ...semanalCaracas,
      ahora: new Date('2026-09-07T11:00:00.000Z'),
    });

    expect(aLasSeis.corresponde).toBe(true);
    expect(aLasSeis.referenciaId).toBe('antropometria_2026-09-07');
    expect(aLasSiete.corresponde).toBe(false);
  });

  it('la fecha programada de hoy tiene la ventana abierta y no cuenta como expirada', () => {
    const resultado = evaluarExpiracionAntropometria({
      alumnoId: 'alumno-1',
      ...semanalCaracas,
      ahora: new Date('2026-09-07T10:00:00.000Z'),
    });

    expect(resultado.expirado).toBe(false);
    expect(resultado.fechaProgramada).toBeNull();
  });

  it('expira la fecha programada más reciente anterior a hoy', () => {
    const alumnoId = 'alumno-1';
    const miercoles = evaluarExpiracionAntropometria({
      alumnoId,
      ...semanalCaracas,
      ahora: new Date('2026-09-10T12:00:00.000Z'),
    });

    expect(miercoles.expirado).toBe(true);
    expect(miercoles.fechaProgramada).toBe('2026-09-07');
    expect(miercoles.referenciaId).toBe(
      construirReferenciaExpiracionAntropometria(alumnoId, '2026-09-07')
    );
  });

  it('sin calendario no hay recordatorio ni expiración', () => {
    expect(
      evaluarRecordatorioAntropometria({ timezone: 'America/Caracas' }).corresponde
    ).toBe(false);
    expect(
      evaluarExpiracionAntropometria({ alumnoId: 'alumno-1', timezone: 'America/Caracas' })
        .expirado
    ).toBe(false);
  });
});
