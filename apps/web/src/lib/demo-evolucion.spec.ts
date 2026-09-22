import { describe, it, expect } from 'vitest';
import { AnguloFoto, EstadoMedicion } from '@guachafit/shared';
import { crearEvolucionDemo } from './demo-evolucion';
import { angulosComparables, angulosDeControl } from './comparador-fotos';
import { fechaCalendarioMs } from './evolucion-graficos';

describe('crearEvolucionDemo (RF-004, fixture tras isDemoMode)', () => {
  const ahora = new Date(2026, 8, 22, 12, 0, 0);

  it('entrega una serie cronológica ascendente de controles aprobados', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    expect(evolucion.alumnoId).toBe('u-001');
    expect(evolucion.evaluaciones).toHaveLength(6);
    expect(evolucion.totalEvaluaciones).toBe(6);
    expect(evolucion.controlesTotal).toBe(6);

    const fechas = evolucion.evaluaciones.map((e) => fechaCalendarioMs(e.fechaEvaluacion));
    for (let i = 1; i < fechas.length; i += 1) {
      expect(fechas[i]).toBeGreaterThan(fechas[i - 1]);
    }
    expect(evolucion.evaluaciones.every((e) => e.estado === EstadoMedicion.APROBADO)).toBe(true);
  });

  it('calcula el cambio neto con la misma aritmética del servicio', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    const primera = evolucion.evaluaciones[0];
    const ultima = evolucion.evaluaciones[evolucion.evaluaciones.length - 1];
    expect(evolucion.cambioNetoPesoKg).toBe(
      (Number(ultima.pesoKg) - Number(primera.pesoKg)).toFixed(2)
    );
    expect(evolucion.cambioNetoGrasaPorcentaje).toBe(
      (Number(ultima.porcentajeGrasa) - Number(primera.porcentajeGrasa)).toFixed(2)
    );
  });

  it('todas las tomas tienen las métricas del gráfico (peso, grasa y perímetros)', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    for (const control of evolucion.evaluaciones) {
      expect(Number(control.pesoKg)).toBeGreaterThan(30);
      expect(Number(control.porcentajeGrasa)).toBeGreaterThan(2);
      expect(control.perimetros?.cinturaCm).toBeTruthy();
      expect(control.perimetros?.brazoCm).toBeTruthy();
      expect(control.perimetros?.pechoCm).toBeTruthy();
      expect(control.perimetros?.musloCm).toBeTruthy();
    }
  });

  it('las fotos demo son SVG sintéticos marcados DEMO (nunca tráfico a R2)', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    const fotos = evolucion.evaluaciones.flatMap((e) => e.fotos);
    expect(fotos.length).toBeGreaterThan(0);
    for (const foto of fotos) {
      expect(foto.presignedGetUrl).toContain('data:image/svg+xml');
      expect(decodeURIComponent(foto.presignedGetUrl ?? '')).toContain('DEMO');
    }
  });

  it('reproduce el caso borde §6: el posterior no es comparable entre la primera y la última toma', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    const primera = evolucion.evaluaciones[0];
    const ultima = evolucion.evaluaciones[evolucion.evaluaciones.length - 1];
    expect(angulosDeControl(primera)).toEqual([AnguloFoto.FRONTAL, AnguloFoto.LATERAL]);
    expect(angulosComparables(primera, ultima)).toEqual([
      AnguloFoto.FRONTAL,
      AnguloFoto.LATERAL,
    ]);
    expect(angulosDeControl(ultima)).toContain(AnguloFoto.POSTERIOR);
  });

  it('la última toma queda dentro del rango 1M (fixture siempre fresco)', () => {
    const evolucion = crearEvolucionDemo('u-001', ahora);
    const ultima = evolucion.evaluaciones[evolucion.evaluaciones.length - 1];
    const dias = (ahora.getTime() - fechaCalendarioMs(ultima.fechaEvaluacion)) / (24 * 60 * 60 * 1000);
    expect(dias).toBeLessThanOrEqual(31);
    expect(dias).toBeGreaterThanOrEqual(0);
  });
});
