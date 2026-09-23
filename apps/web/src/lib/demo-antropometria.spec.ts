import { describe, expect, it } from 'vitest';
import { Modalidad } from '@guachafit/shared';
import {
  crearPendientesDemoAntropometria,
  contextoDemoAntropometria,
  ESCENARIOS_DEMO_ANTROPOMETRIA,
} from './demo-antropometria';
import { calcularEstadoVentanaCheckinAntropometrico } from './antropometria-ventana';
import { fechaCalendarioLocal } from './date-format';

/**
 * WU RF-003b: los escenarios demo deben ejercitar de verdad los estados de RN-03/RN-04 (no basta
 * con etiquetas). Se valida contra el helper puro de ventana, no contra textos fijos.
 */
describe('contextoDemoAntropometria (fixtures por escenario)', () => {
  const AHORA = new Date(2026, 8, 23, 10, 0, 0); // 23 sep 2026, hora local.

  it('`remoto-ventana` deja la ventana ABIERTA hoy (ancla = hoy)', () => {
    const contexto = contextoDemoAntropometria('remoto-ventana', AHORA);
    expect(contexto.modalidad).toBe(Modalidad.REMOTO);

    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: contexto.periodicidadAntropometria,
      antropometriaInicio: contexto.antropometriaInicio,
      hoyLocal: fechaCalendarioLocal(AHORA),
    });
    expect(estado.estado).toBe('abierta');
    expect(estado.permiteRegistrar).toBe(true);
  });

  it('`remoto-fuera` deja la ventana CERRADA con próxima fecha futura', () => {
    const contexto = contextoDemoAntropometria('remoto-fuera', AHORA);
    expect(contexto.modalidad).toBe(Modalidad.REMOTO);

    const estado = calcularEstadoVentanaCheckinAntropometrico({
      periodicidad: contexto.periodicidadAntropometria,
      antropometriaInicio: contexto.antropometriaInicio,
      hoyLocal: fechaCalendarioLocal(AHORA),
    });
    expect(estado.estado).toBe('cerrada');
    expect(estado.permiteRegistrar).toBe(false);
    expect(estado.proximaVentana).not.toBeNull();
  });

  it('`presencial` activa el solo lectura y no configura calendario', () => {
    const contexto = contextoDemoAntropometria('presencial', AHORA);
    expect(contexto.modalidad).toBe(Modalidad.PRESENCIAL);
    expect(contexto.periodicidadAntropometria).toBeNull();
    expect(contexto.antropometriaInicio).toBeNull();
  });

  it('cubre los tres escenarios declarados', () => {
    expect(ESCENARIOS_DEMO_ANTROPOMETRIA).toHaveLength(3);
    for (const escenario of ESCENARIOS_DEMO_ANTROPOMETRIA) {
      expect(contextoDemoAntropometria(escenario, AHORA).modalidad).toBeDefined();
    }
  });
});

describe('crearPendientesDemoAntropometria (cola del coach con fotos auditables)', () => {
  const AHORA = new Date(2026, 8, 23, 10, 0, 0);

  it('cada pendiente trae al menos una foto con URL sintética (marca DEMO, sin red)', () => {
    const pendientes = crearPendientesDemoAntropometria(AHORA);
    expect(pendientes.length).toBeGreaterThan(0);

    for (const pendiente of pendientes) {
      expect(pendiente.estado).toBe('pendiente_aprobacion');
      expect(pendiente.fotos.length).toBeGreaterThan(0);
      for (const foto of pendiente.fotos) {
        expect(foto.presignedGetUrl).toMatch(/^data:image\/svg\+xml/);
      }
    }
  });

  it('el primer control expone el modelo RN-02 completo (brazos, muslo medio y pliegues)', () => {
    const [primero] = crearPendientesDemoAntropometria(AHORA);
    expect(primero.perimetros?.brazoRelajadoCm).toBeTruthy();
    expect(primero.perimetros?.brazoContraidoCm).toBeTruthy();
    expect(primero.perimetros?.musloMedioCm).toBeTruthy();
    expect(primero.pliegues?.tricepsMm).toBeTruthy();
    expect(primero.pliegues?.subescapularMm).toBeTruthy();
    expect(primero.pliegues?.suprailiacoMm).toBeTruthy();
    expect(primero.pliegues?.abdominalMm).toBeTruthy();
    expect(primero.fotos).toHaveLength(3);
  });

  it('las fechas de las tomas son pasadas relativas a "ahora"', () => {
    const pendientes = crearPendientesDemoAntropometria(AHORA);
    const hoy = fechaCalendarioLocal(AHORA);
    for (const pendiente of pendientes) {
      expect(pendiente.fechaEvaluacion < hoy).toBe(true);
    }
  });
});
