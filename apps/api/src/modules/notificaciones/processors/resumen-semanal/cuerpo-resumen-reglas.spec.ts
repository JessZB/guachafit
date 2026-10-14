import { describe, expect, it } from 'vitest';
import { construirCuerpoResumenSemanal } from './cuerpo-resumen-reglas';

/**
 * Reglas puras del cuerpo del digest semanal: el texto por coach sale solo de
 * sus métricas agregadas, sin leer base de datos ni colas.
 */
describe('cuerpo del resumen semanal (reglas puras)', () => {
  it('arma adherencia, cobros y cartera con el nombre del coach', () => {
    const cuerpo = construirCuerpoResumenSemanal({
      coachNombre: 'Studio Ana',
      alumnosActivos: 2,
      sesionesCompletadas: 3,
      sesionesProgramadas: 6,
      cobradoUsd: '120.00',
      cuotasPorVencer: 2,
      cuotasEnMora: 1,
      nutricionDiasNoReportados: 0,
    });

    expect(cuerpo).toContain('Hola Studio Ana');
    expect(cuerpo).toContain('3 de 6 sesiones completadas (50%)');
    expect(cuerpo).toContain('$120.00 USD cobrados');
    expect(cuerpo).toContain('2 cuota(s) por vencer');
    expect(cuerpo).toContain('1 en mora');
    expect(cuerpo).not.toContain('sin reporte nutricional');
  });

  it('sin sesiones programadas evita la división por cero', () => {
    const cuerpo = construirCuerpoResumenSemanal({
      coachNombre: 'Luis Pérez',
      alumnosActivos: 0,
      sesionesCompletadas: 0,
      sesionesProgramadas: 0,
      cobradoUsd: '0.00',
      cuotasPorVencer: 0,
      cuotasEnMora: 0,
      nutricionDiasNoReportados: 0,
    });

    expect(cuerpo).toContain('0 sesiones completadas (sin sesiones programadas esta semana)');
  });

  it('agrega la alerta nutricional solo cuando hay días sin reporte', () => {
    const conAlerta = construirCuerpoResumenSemanal({
      coachNombre: 'Studio Ana',
      alumnosActivos: 2,
      sesionesCompletadas: 3,
      sesionesProgramadas: 6,
      cobradoUsd: '120.00',
      cuotasPorVencer: 2,
      cuotasEnMora: 1,
      nutricionDiasNoReportados: 8,
    });

    expect(conAlerta).toContain('8 día(s) de tu alumnado quedaron sin reporte nutricional');
  });
});
