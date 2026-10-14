import { describe, it, expect } from 'vitest';
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  construirMensajeFueraDeVentana,
  evaluarVentanaCheckinAntropometrico,
} from './ventana-reglas';

/** Reglas de la ventana de 48 h (RN-04/§6) y del mensaje de rechazo (RF-003 §7). */
describe('ventana del check-in antropométrico', () => {
  const base = {
    periodicidad: PeriodicidadAntropometria.SEMANAL,
    antropometriaInicio: '2026-09-07',
    timezone: 'America/Caracas',
  };

  it('sin calendario no aplica ventana y se conserva el comportamiento previo', () => {
    const resultado = evaluarVentanaCheckinAntropometrico({ timezone: 'America/Caracas' });

    expect(resultado.aplica).toBe(false);
    expect(resultado.permitido).toBe(true);
    expect(resultado.motivo).toBe('SIN_PERIODICIDAD');
  });

  it('permite registrar durante todo el día programado local', () => {
    const apertura = evaluarVentanaCheckinAntropometrico({
      ...base,
      ahora: new Date('2026-09-06T04:00:00.000Z'),
    });
    const cierre = evaluarVentanaCheckinAntropometrico({
      ...base,
      ahora: new Date('2026-09-08T03:59:59.000Z'),
    });

    expect(apertura.permitido).toBe(true);
    expect(apertura.ventanaVigente?.fecha).toBe('2026-09-07');
    expect(cierre.permitido).toBe(true);
  });

  it('cierra la ventana al comenzar el día local posterior (fin exclusivo)', () => {
    const resultado = evaluarVentanaCheckinAntropometrico({
      ...base,
      ahora: new Date('2026-09-08T04:00:00.000Z'),
    });

    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toBe('FUERA_DE_VENTANA');
  });

  it('describe la ventana vencida y la próxima en el mensaje de rechazo', () => {
    const resultado = evaluarVentanaCheckinAntropometrico({
      ...base,
      ahora: new Date('2026-09-10T12:00:00.000Z'),
    });

    expect(resultado.permitido).toBe(false);
    const mensaje = construirMensajeFueraDeVentana(resultado);
    expect(mensaje).toMatch(/ya cerró/);
    expect(mensaje).toMatch(/próxima se habilita/);
  });

  it('avisa cuando la ventana aún no abre', () => {
    const resultado = evaluarVentanaCheckinAntropometrico({
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-14',
      timezone: 'America/Caracas',
      ahora: new Date('2026-09-07T12:00:00.000Z'),
    });

    expect(resultado.permitido).toBe(false);
    expect(construirMensajeFueraDeVentana(resultado)).toMatch(/aún no está abierta/);
  });

  it('responde el mensaje genérico sin datos de ventanas', () => {
    expect(
      construirMensajeFueraDeVentana({
        aplica: true,
        permitido: false,
        hoyLocal: '2026-09-10',
        ventanaVigente: null,
        proximaVentana: null,
        ultimaVentanaVencida: null,
        motivo: 'FUERA_DE_VENTANA',
      })
    ).toMatch(/fuera de la ventana activa/);
  });
});
