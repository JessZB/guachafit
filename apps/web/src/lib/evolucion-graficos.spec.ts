import { describe, it, expect } from 'vitest';
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ControlAntropometricoDetalleDTO,
} from '@guachafit/shared';
import {
  MAX_METRICAS_ACTIVAS,
  RANGOS_EVOLUCION,
  agruparSeriesPorEje,
  alternarMetricaActiva,
  calcularDeltas,
  calcularDominio,
  construirSeries,
  encontrarIndiceMasCercano,
  fechaCalendarioMs,
  fechasOrdenadas,
  filtrarPorRango,
  formatearDeltaMetrica,
  formatearValorMetrica,
  mapearX,
  mapearY,
  metricaPorId,
  resumenAccesible,
  seleccionarTicksX,
  valorEnFecha,
} from './evolucion-graficos';

function control(parcial: {
  id?: string;
  fecha: string;
  peso?: string;
  grasa?: string | null;
  cintura?: string | null;
  brazo?: string | null;
  pecho?: string | null;
  muslo?: string | null;
}): ControlAntropometricoDetalleDTO {
  return {
    id: parcial.id ?? `ctrl-${parcial.fecha}`,
    alumnoId: 'a4444444-4444-4444-8444-444444444444',
    fechaEvaluacion: parcial.fecha,
    pesoKg: parcial.peso ?? '80.00',
    porcentajeGrasa: parcial.grasa === undefined ? '20.00' : parcial.grasa,
    perimetros: {
      cinturaCm: parcial.cintura === undefined ? '85.00' : parcial.cintura,
      brazoCm: parcial.brazo === undefined ? '36.00' : parcial.brazo,
      pechoCm: parcial.pecho === undefined ? '100.00' : parcial.pecho,
      musloCm: parcial.muslo === undefined ? '57.00' : parcial.muslo,
    },
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: 'a4444444-4444-4444-8444-444444444444',
    estado: EstadoMedicion.APROBADO,
    fotos: [],
    createdAtUtc: `${parcial.fecha}T10:00:00.000Z`,
    updatedAtUtc: `${parcial.fecha}T10:00:00.000Z`,
  };
}

const SERIE = [
  control({ fecha: '2026-01-10', peso: '86.00', grasa: '22.50', cintura: '90.00' }),
  control({ fecha: '2026-02-07', peso: '84.20', grasa: '20.80', cintura: '88.50' }),
  control({ fecha: '2026-03-05', peso: '81.50', grasa: '18.50', cintura: '86.00' }),
];

describe('filtrarPorRango (RN-01: 1M / 3M / 6M / 1A / Todo)', () => {
  const ahora = new Date(2026, 8, 22); // 22 sep 2026, hora local

  it('`todo` devuelve la serie completa sin reordenar', () => {
    expect(filtrarPorRango(SERIE, 'todo', ahora).map((e) => e.fechaEvaluacion)).toEqual([
      '2026-01-10',
      '2026-02-07',
      '2026-03-05',
    ]);
  });

  it('1M solo incluye fechas dentro del último mes local', () => {
    const serie = [
      control({ fecha: '2026-08-01' }),
      control({ fecha: '2026-08-23' }),
      control({ fecha: '2026-09-01' }),
      control({ fecha: '2026-09-22' }),
    ];
    expect(filtrarPorRango(serie, '1M', ahora).map((e) => e.fechaEvaluacion)).toEqual([
      '2026-08-23',
      '2026-09-01',
      '2026-09-22',
    ]);
  });

  it('3M, 6M y 1A cortan con el mismo criterio de calendario local', () => {
    const serie = [
      control({ fecha: '2025-08-01' }),
      control({ fecha: '2025-10-01' }),
      control({ fecha: '2026-04-01' }),
      control({ fecha: '2026-07-01' }),
      control({ fecha: '2026-09-01' }),
    ];
    expect(filtrarPorRango(serie, '3M', ahora).map((e) => e.fechaEvaluacion)).toEqual([
      '2026-07-01',
      '2026-09-01',
    ]);
    expect(filtrarPorRango(serie, '6M', ahora).map((e) => e.fechaEvaluacion)).toEqual([
      '2026-04-01',
      '2026-07-01',
      '2026-09-01',
    ]);
    expect(filtrarPorRango(serie, '1A', ahora).map((e) => e.fechaEvaluacion)).toEqual([
      '2025-10-01',
      '2026-04-01',
      '2026-07-01',
      '2026-09-01',
    ]);
  });

  it('las fechas inválidas nunca entran al rango', () => {
    const serie = [{ ...control({ fecha: '2026-09-01' }), fechaEvaluacion: 'no-es-fecha' }];
    expect(filtrarPorRango(serie, '1M', ahora)).toEqual([]);
  });

  it('los cinco rangos de RN-01 están declarados en orden', () => {
    expect(RANGOS_EVOLUCION.map((r) => r.id)).toEqual(['1M', '3M', '6M', '1A', 'todo']);
  });
});

describe('construirSeries (series por métrica, color único y eje por unidad)', () => {
  it('extrae peso y grasa con sus unidades y puntos cronológicos', () => {
    const series = construirSeries(SERIE, ['peso', 'grasa']);
    expect(series).toHaveLength(2);
    expect(series[0].metrica.id).toBe('peso');
    expect(series[0].metrica.unidad).toBe('kg');
    expect(series[0].puntos.map((p) => p.valor)).toEqual([86, 84.2, 81.5]);
    expect(series[1].metrica.unidad).toBe('%');
    expect(series[1].puntos.map((p) => p.valor)).toEqual([22.5, 20.8, 18.5]);
  });

  it('asigna el eje izquierdo a la primera unidad y el derecho a la segunda (doble eje RN-01)', () => {
    const series = construirSeries(SERIE, ['peso', 'grasa']);
    expect(series[0].eje).toBe('izquierda');
    expect(series[1].eje).toBe('derecha');
    expect(agruparSeriesPorEje(series).izquierda.map((s) => s.metrica.id)).toEqual(['peso']);
    expect(agruparSeriesPorEje(series).derecha.map((s) => s.metrica.id)).toEqual(['grasa']);
  });

  it('métricas de la misma unidad comparten eje', () => {
    const series = construirSeries(SERIE, ['cintura', 'brazo']);
    expect(series.map((s) => s.eje)).toEqual(['izquierda', 'izquierda']);
  });

  it('nunca repite color entre las métricas activas', () => {
    const series = construirSeries(SERIE, ['cintura', 'muslo', 'brazo']);
    const colores = series.map((s) => s.color);
    expect(new Set(colores).size).toBe(colores.length);
  });

  it('ignora valores nulos y corta la línea en el hueco (segmentos)', () => {
    const serie = [
      control({ fecha: '2026-01-10', grasa: '22.50' }),
      control({ fecha: '2026-02-07', grasa: null }),
      control({ fecha: '2026-03-05', grasa: '18.50' }),
    ];
    const [grasa] = construirSeries(serie, ['grasa']);
    expect(grasa.puntos.map((p) => p.fecha)).toEqual(['2026-01-10', '2026-03-05']);
    expect(grasa.segmentos).toHaveLength(2);
    expect(grasa.segmentos[0]).toHaveLength(1);
    expect(grasa.segmentos[1]).toHaveLength(1);
  });

  it('con una sola medición devuelve un único segmento de un punto', () => {
    const [peso] = construirSeries([control({ fecha: '2026-09-01' })], ['peso']);
    expect(peso.segmentos).toEqual([[{ fecha: '2026-09-01', valor: 80 }]]);
  });

  it('valorEnFecha solo responde en fechas con medición de esa métrica', () => {
    const [grasa] = construirSeries(
      [control({ fecha: '2026-01-10', grasa: '22.50' }), control({ fecha: '2026-02-07', grasa: null })],
      ['grasa']
    );
    expect(valorEnFecha(grasa, '2026-01-10')).toBe(22.5);
    expect(valorEnFecha(grasa, '2026-02-07')).toBeNull();
  });
});

describe('calcularDeltas (Gherkin Escenario 1: cambio neto del periodo)', () => {
  it('calcula el delta entre la primera y la última medición del rango', () => {
    const deltas = calcularDeltas(SERIE, ['peso', 'grasa']);
    expect(deltas[0].valorInicial).toBe(86);
    expect(deltas[0].valorFinal).toBe(81.5);
    expect(deltas[0].diferencia).toBeCloseTo(-4.5);
    expect(deltas[1].diferencia).toBeCloseTo(-4);
  });

  it('con una sola medición no fabrica delta', () => {
    const deltas = calcularDeltas([control({ fecha: '2026-09-01' })], ['peso']);
    expect(deltas[0].diferencia).toBeNull();
    expect(deltas[0].valorFinal).toBe(80);
  });

  it('sin mediciones de la métrica devuelve null (nunca NaN)', () => {
    const deltas = calcularDeltas([control({ fecha: '2026-09-01', grasa: null })], ['grasa']);
    expect(deltas[0]).toMatchObject({ valorInicial: null, valorFinal: null, diferencia: null });
  });
});

describe('alternarMetricaActiva (topes del selector)', () => {
  it('agrega y quita métricas mientras respeta los topes', () => {
    expect(alternarMetricaActiva(['peso'], 'grasa')).toMatchObject({
      activas: ['peso', 'grasa'],
      cambio: true,
      motivo: null,
    });
    expect(alternarMetricaActiva(['peso', 'grasa'], 'grasa')).toMatchObject({
      activas: ['peso'],
      cambio: true,
    });
  });

  it('no permite quedarse sin métricas', () => {
    const resultado = alternarMetricaActiva(['peso'], 'peso');
    expect(resultado.cambio).toBe(false);
    expect(resultado.activas).toEqual(['peso']);
    expect(resultado.motivo).toContain('al menos una métrica');
  });

  it(`no permite más de ${MAX_METRICAS_ACTIVAS} métricas a la vez`, () => {
    const resultado = alternarMetricaActiva(['peso', 'grasa', 'cintura'], 'brazo');
    expect(resultado.cambio).toBe(false);
    expect(resultado.motivo).toContain('Máximo 3 métricas');
  });

  it('no permite una tercera unidad en el mismo gráfico (máximo 2 ejes)', () => {
    const resultado = alternarMetricaActiva(['peso', 'grasa'], 'cintura');
    expect(resultado.cambio).toBe(false);
    expect(resultado.motivo).toContain('Máximo dos unidades');
  });

  it('permite una tercera métrica de una unidad ya activa', () => {
    const resultado = alternarMetricaActiva(['cintura', 'brazo'], 'muslo');
    expect(resultado.cambio).toBe(true);
    expect(resultado.activas).toEqual(['cintura', 'brazo', 'muslo']);
  });
});

describe('formato humano de valores y deltas', () => {
  it('formatea valores con unidad (sin espacio para %)', () => {
    expect(formatearValorMetrica(metricaPorId('peso'), 74.5)).toBe('74.50 kg');
    expect(formatearValorMetrica(metricaPorId('grasa'), 14.8)).toBe('14.80%');
    expect(formatearValorMetrica(metricaPorId('cintura'), 81)).toBe('81.00 cm');
  });

  it('formatea deltas con signo explícito', () => {
    expect(formatearDeltaMetrica(metricaPorId('peso'), -3.2)).toBe('-3.20 kg');
    expect(formatearDeltaMetrica(metricaPorId('peso'), 1.25)).toBe('+1.25 kg');
    expect(formatearDeltaMetrica(metricaPorId('grasa'), -2.4)).toBe('-2.40%');
  });
});

describe('geometría del gráfico', () => {
  it('calcularDominio abre margen y maneja el caso de un único valor', () => {
    expect(calcularDominio([])).toBeNull();
    const dominio = calcularDominio([80, 90])!;
    expect(dominio.min).toBeLessThan(80);
    expect(dominio.max).toBeGreaterThan(90);

    const unico = calcularDominio([80])!;
    expect(unico.min).toBeLessThan(80);
    expect(unico.max).toBeGreaterThan(80);
  });

  it('mapearX reparte fechas y centra el caso degenerado', () => {
    const min = fechaCalendarioMs('2026-01-01');
    const max = fechaCalendarioMs('2026-01-11');
    expect(mapearX(min, min, max, 0, 100)).toBe(0);
    expect(mapearX(max, min, max, 0, 100)).toBe(100);
    expect(mapearX(min + (max - min) / 2, min, max, 0, 100)).toBe(50);
    expect(mapearX(min, min, min, 0, 100)).toBe(50);
  });

  it('mapearY invierte el eje (arriba = máximo)', () => {
    const dominio = { min: 0, max: 100 };
    expect(mapearY(0, dominio, 0, 100)).toBe(100);
    expect(mapearY(100, dominio, 0, 100)).toBe(0);
    expect(mapearY(50, dominio, 0, 100)).toBe(50);
  });

  it('encontrarIndiceMasCercano elige el punto más próximo', () => {
    expect(encontrarIndiceMasCercano([10, 50, 90], 60)).toBe(1);
    expect(encontrarIndiceMasCercano([10, 50, 90], 100)).toBe(2);
    expect(encontrarIndiceMasCercano([], 10)).toBe(-1);
  });

  it('seleccionarTicksX respeta el máximo y conserva los extremos', () => {
    const fechas = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];
    const ticks = seleccionarTicksX(fechas, 4);
    expect(ticks[0]).toBe('2026-01-01');
    expect(ticks[ticks.length - 1]).toBe('2026-06-01');
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(seleccionarTicksX(fechas.slice(0, 2), 4)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('fechasOrdenadas deduplica y ordena cronológicamente', () => {
    const serie = [
      control({ fecha: '2026-03-05' }),
      control({ fecha: '2026-01-10' }),
      control({ fecha: '2026-03-05', id: 'otro' }),
    ];
    expect(fechasOrdenadas(serie)).toEqual(['2026-01-10', '2026-03-05']);
  });
});

describe('resumenAccesible (role="img" + resumen textual)', () => {
  const formato = (fecha: string) => fecha;

  it('describe el periodo y cada métrica activa', () => {
    const deltas = calcularDeltas(SERIE, ['peso', 'grasa']);
    const resumen = resumenAccesible(SERIE, deltas, formato);
    expect(resumen).toContain('Gráfico de evolución del 2026-01-10 al 2026-03-05');
    expect(resumen).toContain('Peso: de 86.00 kg a 81.50 kg (variación -4.50 kg)');
    expect(resumen).toContain('puntos porcentuales');
  });

  it('declara una sola medición sin inventar variación', () => {
    const serie = [control({ fecha: '2026-09-01' })];
    const resumen = resumenAccesible(serie, calcularDeltas(serie, ['peso']), formato);
    expect(resumen).toContain('una sola medición');
    expect(resumen).not.toContain('variación');
  });

  it('sin datos devuelve el vacío honesto', () => {
    expect(resumenAccesible([], [], formato)).toContain('sin mediciones en el rango');
  });
});
