import { describe, expect, it } from 'vitest';
import { Modalidad, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  avisoExpiracionYaEmitido,
  calcularDesdeGlobalExpiracion,
  calcularRangoGlobalRecordatorio,
  filtrarCandidatosExpiracion,
  filtrarCandidatosRecordatorio,
  nombreCompleto,
  tieneAvisoDesdeMedianoche,
  tieneMedicionDesde,
  tieneReporteEnVentana,
  ventanaRecordatorio,
  type AlumnoCalendarioReglas,
} from './recordatorio-reglas';

/** Cobertura directa de las reglas puras del barrido. */
describe('Reglas puras del recordatorio antropométrico', () => {
  const lunes06 = new Date('2026-09-07T10:00:00.000Z');
  const base: AlumnoCalendarioReglas = {
    usuarioId: 'a3333333-3333-4333-8333-333333333333',
    entrenadorId: 'c1111111-1111-4111-8111-111111111111',
    nombres: 'Laura',
    apellidos: 'Remota',
    modalidad: Modalidad.REMOTO,
    periodicidad: PeriodicidadAntropometria.SEMANAL,
    inicio: '2026-09-07',
    timezone: 'America/Caracas',
  };

  it('filtra candidatos del día programado a la hora local', () => {
    const candidatos = filtrarCandidatosRecordatorio([base], lunes06);

    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].recordatorio.fechaProgramada).toBe('2026-09-07');
  });

  it('deja fuera a quien cae en día no programado', () => {
    const martes06 = new Date('2026-09-08T10:00:00.000Z');
    const candidatos = filtrarCandidatosRecordatorio([base], martes06);

    expect(candidatos).toHaveLength(0);
  });

  it('calcula el rango global de 48 h con un candidato', () => {
    const candidatos = filtrarCandidatosRecordatorio([base], lunes06);
    const rango = calcularRangoGlobalRecordatorio(candidatos);

    expect(rango.desdeGlobal).toBe('2026-09-06');
    expect(rango.hastaGlobal).toBe('2026-09-08');
    expect(rango.inicioAvisoGlobalUtc).toEqual(new Date('2026-09-07T04:00:00.000Z'));
  });

  it('describe la ventana de 48 h de la fecha programada', () => {
    expect(ventanaRecordatorio('2026-09-07')).toEqual({
      desdeVentana: '2026-09-06',
      hastaVentana: '2026-09-08',
    });
  });

  it('detecta el reporte dentro de la ventana y respeta otros alumnos', () => {
    const controles = [{ alumnoId: base.usuarioId, fechaEvaluacion: '2026-09-06' }];

    expect(tieneReporteEnVentana(controles, base.usuarioId, '2026-09-06', '2026-09-08')).toBe(true);
    expect(tieneReporteEnVentana(controles, 'otro-alumno', '2026-09-06', '2026-09-08')).toBe(false);
    expect(tieneReporteEnVentana(controles, base.usuarioId, '2026-09-07', '2026-09-08')).toBe(false);
  });

  it('detecta el aviso previo desde la medianoche local e ignora fechas inválidas', () => {
    const inicioMs = new Date('2026-09-07T04:00:00.000Z').getTime();
    const avisos = [{ usuarioId: base.usuarioId, createdAtUtc: new Date('2026-09-07T05:00:00.000Z') }];

    expect(tieneAvisoDesdeMedianoche(avisos, base.usuarioId, inicioMs)).toBe(true);
    expect(tieneAvisoDesdeMedianoche(avisos, 'otro-alumno', inicioMs)).toBe(false);
    expect(
      tieneAvisoDesdeMedianoche(
        [{ usuarioId: base.usuarioId, createdAtUtc: 'fecha-rota' }],
        base.usuarioId,
        inicioMs
      )
    ).toBe(false);
  });

  it('solo mira remotos para expiración y calcula la cota inferior', () => {
    const presencial = { ...base, modalidad: Modalidad.PRESENCIAL };
    const martes06 = new Date('2026-09-08T10:00:00.000Z');

    expect(filtrarCandidatosExpiracion([presencial], martes06)).toHaveLength(0);

    const candidatos = filtrarCandidatosExpiracion([base], martes06);
    expect(candidatos).toHaveLength(1);
    expect(calcularDesdeGlobalExpiracion(candidatos)).toBe('2026-09-06');
  });

  it('la medición posterior al inicio de la ventana cuenta como atendida', () => {
    const controles = [{ alumnoId: base.usuarioId, fechaEvaluacion: '2026-09-10' }];

    expect(tieneMedicionDesde(controles, base.usuarioId, '2026-09-06')).toBe(true);
    expect(tieneMedicionDesde([], base.usuarioId, '2026-09-06')).toBe(false);
  });

  it('detecta el aviso ya emitido al coach por referencia', () => {
    const referencia = 'antropometria_expirado_a3333333_2026-09-07';
    const avisos = [{ usuarioId: base.entrenadorId, referenciaId: referencia }];

    expect(avisoExpiracionYaEmitido(avisos, base.entrenadorId, referencia)).toBe(true);
    expect(avisoExpiracionYaEmitido(avisos, base.entrenadorId, 'otra-referencia')).toBe(false);
    expect(avisoExpiracionYaEmitido(avisos, 'otro-coach', referencia)).toBe(false);
  });

  it('recorta los bordes del nombre visible', () => {
    expect(nombreCompleto(' Laura', 'Remota ')).toBe('Laura Remota');
  });
});
