import { describe, expect, it } from 'vitest';
import { checkinsNutricionalesDemo, crearMetasNutricionalesDemo } from './demo-nutricion';
import { crearCalendarioNutricional, contarNoReportados, evaluarToleranciaNutricionalLocal } from './nutricion-metas';
import { EstadoDiaNutricional, SemaforoNutricional } from '@guachafit/shared';
import { fechaCalendarioLocal, ultimosDiasCalendario } from './date-format';

describe('fixtures demo de nutrición (ADR-012: solo tras isDemoMode)', () => {
  const ahora = new Date(2026, 8, 21, 21, 30, 0);
  const hoy = fechaCalendarioLocal(ahora);

  it('las metas demo declaran objetivos y recursos educativos reales del contrato', () => {
    const metas = crearMetasNutricionalesDemo('alumno-demo', ahora);
    expect(metas.caloriasObjetivo).toBe(2200);
    expect(metas.proteinaGramosObjetivo).toBe(160);
    expect(metas.aguaLitrosObjetivo).toBe('3.00');
    expect(metas.recursos.length).toBeGreaterThan(0);
    expect(metas.recursos[0].url).toMatch(/^https:\/\//);
  });

  it('los check-ins demo son relativos a hoy, sin duplicados y en orden descendente', () => {
    const checkins = checkinsNutricionalesDemo('alumno-demo', ahora);
    expect(checkins.length).toBeGreaterThan(8);

    const fechas = checkins.map((c) => c.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect([...fechas].sort((a, b) => b.localeCompare(a))).toEqual(fechas);
    expect(fechas[0]).toBe(ultimosDiasCalendario(hoy, 14)[1]);
    expect(fechas).not.toContain(hoy);
  });

  it('incluye fotos de platos con URL de demostración (data URI, sin red)', () => {
    const checkins = checkinsNutricionalesDemo('alumno-demo', ahora);
    const conFotos = checkins.filter((c) => c.fotosPlatos.length > 0);
    expect(conFotos.length).toBeGreaterThan(0);
    expect(conFotos.every((c) => c.fotosPlatos.length <= 4)).toBe(true);
    expect(conFotos[0].fotosPlatos[0].fotoUrl).toContain('data:image/svg+xml');
    expect(decodeURIComponent(conFotos[0].fotosPlatos[0].fotoUrl ?? '')).toContain('DEMO');
  });

  it('produce días sin reporte y tolerancias variadas contra las metas demo', () => {
    const metas = crearMetasNutricionalesDemo('alumno-demo', ahora);
    const calendario = crearCalendarioNutricional(
      ultimosDiasCalendario(hoy, 14),
      checkinsNutricionalesDemo('alumno-demo', ahora),
      hoy
    );

    expect(contarNoReportados(calendario)).toBeGreaterThan(0);
    expect(calendario[0].estado).toBeNull();

    const diaCumplido = calendario.find((d) => d.checkin?.fecha === ultimosDiasCalendario(hoy, 14)[1]);
    expect(diaCumplido?.estado).toBe(EstadoDiaNutricional.CUMPLIDO);
    expect(
      evaluarToleranciaNutricionalLocal(
        diaCumplido?.checkin?.caloriasReportadas,
        diaCumplido?.checkin?.proteinaGramosReportada,
        metas
      ).dentroMargenTolerancia
    ).toBe(true);

    const diaSinTotales = calendario.find(
      (d) => d.checkin && d.checkin.caloriasReportadas === null && d.checkin.fecha !== hoy
    );
    expect(diaSinTotales).toBeDefined();
    expect(
      evaluarToleranciaNutricionalLocal(
        diaSinTotales?.checkin?.caloriasReportadas,
        diaSinTotales?.checkin?.proteinaGramosReportada,
        metas
      )
    ).toEqual({});
  });

  it('cubre los tres estados del semáforo para que la demo muestre el rango completo', () => {
    const semaforos = new Set(checkinsNutricionalesDemo('alumno-demo', ahora).map((c) => c.semaforo));
    expect(semaforos.has(SemaforoNutricional.CUMPLIDO)).toBe(true);
    expect(semaforos.has(SemaforoNutricional.PARCIAL)).toBe(true);
    expect(semaforos.has(SemaforoNutricional.NO_CUMPLIDO)).toBe(true);
  });
});
