/**
 * M5-L1B (contrato A): lógica pura de la suscripción del alumno.
 *
 * Fase ROJA: el módulo `suscripcion-alumno.ts` todavía no existe; estos tests definen su
 * contrato exacto (formato de fechas, rango de inicio, decisión de guardado, textos y fixture
 * demo) y deben fallar por importación hasta que la implementación llegue.
 */
import { describe, expect, it } from 'vitest';
import type { SuscripcionAlumnoDTO } from '@guachafit/shared';
import {
  MENSAJE_FECHA_INICIO_REQUERIDA,
  decidirGuardadoSuscripcion,
  esErrorSinPlanAsignado,
  formatearFechaCorta,
  rangoFechaInicioSuscripcion,
  suscripcionDemoAlumno,
  textoProximaCuota,
} from './suscripcion-alumno';

const HOY = '2026-10-09';

/** Suscripción vigente de ejemplo (plan A) para las reglas con suscripción. */
function suscripcion(parcial: Partial<SuscripcionAlumnoDTO> = {}): SuscripcionAlumnoDTO {
  return {
    clienteId: 'alumno-1',
    planId: 'plan-a',
    planNombre: 'Plan A',
    duracionMeses: 1,
    fechaInicio: '2026-10-01',
    proximoCorte: '2026-11-01',
    cuotaEmitidaId: null,
    ...parcial,
  };
}

/** Entrada de `decidirGuardadoSuscripcion` con valores neutros; cada test ajusta lo que prueba. */
function entrada(
  parcial: Partial<{
    suscripcionActual: SuscripcionAlumnoDTO | null;
    planSeleccionadoId: string;
    fechaInicio: string;
    hoyLocal: string;
  }> = {}
) {
  return {
    suscripcionActual: null,
    planSeleccionadoId: '',
    fechaInicio: '',
    hoyLocal: HOY,
    ...parcial,
  };
}

describe('suscripcion-alumno · contrato A (M5-L1B)', () => {
  it('A0 · MENSAJE_FECHA_INICIO_REQUERIDA es el texto del contrato', () => {
    expect(MENSAJE_FECHA_INICIO_REQUERIDA).toBe('Elige la fecha de inicio del plan.');
  });

  it('A1 · formatearFechaCorta convierte YYYY-MM-DD a DD/MM/AAAA', () => {
    expect(formatearFechaCorta('2026-12-08')).toBe('08/12/2026');
    expect(formatearFechaCorta('2026-01-05')).toBe('05/01/2026');
  });

  it('A2 · rangoFechaInicioSuscripcion devuelve hoy−30 y hoy+60 como bordes', () => {
    expect(rangoFechaInicioSuscripcion(HOY)).toEqual({
      minimo: '2026-09-09',
      maximo: '2026-12-08',
    });
  });

  it('A3.1 · sin suscripción y sin plan no hay nada que guardar', () => {
    expect(decidirGuardadoSuscripcion(entrada())).toEqual({ accion: 'ninguna' });
  });

  it('A3.2 · sin suscripción, con plan y fecha vacía exige la fecha de inicio', () => {
    expect(decidirGuardadoSuscripcion(entrada({ planSeleccionadoId: 'plan-a' }))).toEqual({
      accion: 'error',
      mensaje: MENSAJE_FECHA_INICIO_REQUERIDA,
    });
  });

  it('A3.3 · sin suscripción, con plan y fecha irreal exige una fecha válida', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-02-30' })
      )
    ).toEqual({ accion: 'error', mensaje: 'Elige una fecha de inicio válida.' });
    expect(
      decidirGuardadoSuscripcion(entrada({ planSeleccionadoId: 'plan-a', fechaInicio: 'hoy' }))
    ).toEqual({ accion: 'error', mensaje: 'Elige una fecha de inicio válida.' });
  });

  it('A3.4 · sin suscripción, con plan y fecha fuera del rango explica el rango humano', () => {
    const mensaje = 'Elige una fecha de inicio entre el 09/09/2026 y el 08/12/2026.';
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-09-08' })
      )
    ).toEqual({ accion: 'error', mensaje });
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-12-09' })
      )
    ).toEqual({ accion: 'error', mensaje });
  });

  it('A3.5 · los bordes del rango son válidos (inclusive)', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-09-09' })
      )
    ).toEqual({ accion: 'asignar', payload: { planId: 'plan-a', fechaInicio: '2026-09-09' } });
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-12-08' })
      )
    ).toEqual({ accion: 'asignar', payload: { planId: 'plan-a', fechaInicio: '2026-12-08' } });
  });

  it('A3.6 · sin suscripción, con plan y fecha válida asigna el plan', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: 'plan-a', fechaInicio: '2026-10-09' })
      )
    ).toEqual({ accion: 'asignar', payload: { planId: 'plan-a', fechaInicio: '2026-10-09' } });
  });

  it('A3.7 · con suscripción y plan vacío no toca nada (quitar el plan es otra acción)', () => {
    expect(
      decidirGuardadoSuscripcion(entrada({ suscripcionActual: suscripcion() }))
    ).toEqual({ accion: 'ninguna' });
  });

  it('A3.8 · con suscripción y el mismo plan no escribe nada aunque venga fecha', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({
          suscripcionActual: suscripcion(),
          planSeleccionadoId: 'plan-a',
          fechaInicio: '2026-11-01',
        })
      )
    ).toEqual({ accion: 'ninguna' });
  });

  it('A3.9 · con suscripción y otro plan cambia el plan sin fecha', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({
          suscripcionActual: suscripcion(),
          planSeleccionadoId: 'plan-b',
          fechaInicio: '2026-11-01',
        })
      )
    ).toEqual({ accion: 'cambiar_plan', payload: { planId: 'plan-b' } });
  });

  it('A3.10 · recorta el plan y la fecha antes de decidir y de construir el payload', () => {
    expect(
      decidirGuardadoSuscripcion(
        entrada({ planSeleccionadoId: '  plan-a  ', fechaInicio: ' 2026-10-09 ' })
      )
    ).toEqual({ accion: 'asignar', payload: { planId: 'plan-a', fechaInicio: '2026-10-09' } });
  });

  it('A4 · textoProximaCuota formatea el vencimiento y es null sin dato', () => {
    expect(textoProximaCuota(suscripcion({ proximoCorte: '2026-11-14' }))).toBe(
      'Próxima cuota: vence el 14/11/2026'
    );
    expect(textoProximaCuota(null)).toBeNull();
    expect(textoProximaCuota(suscripcion({ proximoCorte: '' }))).toBeNull();
  });

  it('A5 · esErrorSinPlanAsignado reconoce solo el mensaje del servidor', () => {
    expect(
      esErrorSinPlanAsignado(
        new Error(
          'Este alumno no tiene un plan asignado. Asígnale un plan en su ficha para registrar el cobro.'
        )
      )
    ).toBe(true);
    expect(esErrorSinPlanAsignado(new Error('Otro error distinto.'))).toBe(false);
    expect(esErrorSinPlanAsignado(null)).toBe(false);
    expect(esErrorSinPlanAsignado('Este alumno no tiene un plan asignado')).toBe(false);
    expect(esErrorSinPlanAsignado({})).toBe(false);
  });

  it('A6 · suscripcionDemoAlumno construye la suscripción demo relativa a hoy', () => {
    const demo = suscripcionDemoAlumno(HOY, {
      id: 'plan-presencial',
      nombre: 'Presencial Completo Sala',
      duracionMeses: 1,
    });
    expect(demo).toEqual({
      clienteId: 'user-demo',
      planId: 'plan-presencial',
      planNombre: 'Presencial Completo Sala',
      duracionMeses: 1,
      fechaInicio: '2026-09-29',
      proximoCorte: '2026-10-29',
      cuotaEmitidaId: null,
    });
  });
});
