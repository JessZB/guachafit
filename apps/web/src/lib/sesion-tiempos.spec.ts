import { describe, expect, it } from 'vitest';
import {
  DELTA_SIN_DATO,
  deltaEntreEjerciciosSegundos,
  deltasEntreEjercicios,
  deltasEntreSeries,
  descansosRealesEntreEjercicios,
  descansosRealesEntreSeries,
  duracionesEjecucionSeries,
  formatearDeltaSegundos,
  formatearSegundos,
  marcarInicioSerieReal,
  type EjercicioConMarcas,
  type SerieConMarca,
} from './sesion-tiempos';

const BASE = '2026-09-20T10:00:00.000Z';

/** Marca ISO desplazada N segundos desde la base (facilita leer los deltas esperados). */
function iso(segundos: number): string {
  return new Date(new Date(BASE).getTime() + segundos * 1000).toISOString();
}

function serie(
  numeroSerie: number,
  timestampCompletadaUtc: string | null | undefined,
  completada = true
): SerieConMarca {
  return { numeroSerie, timestampCompletadaUtc, completada };
}

function ejercicio(...series: SerieConMarca[]): EjercicioConMarcas {
  return { series };
}

describe('deltasEntreSeries (WU15: Δ real entre series completadas)', () => {
  it('sin series devuelve un arreglo vacío (sin romper)', () => {
    expect(deltasEntreSeries([])).toEqual([]);
  });

  it('la primera serie marcada no tiene delta (no existe una anterior)', () => {
    expect(deltasEntreSeries([serie(1, iso(0))])).toEqual([null]);
  });

  it('calcula el delta de cada serie contra la anterior del mismo ejercicio', () => {
    const series = [serie(1, iso(0)), serie(2, iso(95)), serie(3, iso(200)), serie(4, iso(310))];
    expect(deltasEntreSeries(series)).toEqual([null, 95, 105, 110]);
  });

  it('omite series sin timestamp y encadena la siguiente contra la última marcada', () => {
    const series = [
      serie(1, iso(0)),
      serie(2, null),
      serie(3, iso(180)),
      serie(4, undefined),
      serie(5, iso(300)),
    ];
    expect(deltasEntreSeries(series)).toEqual([null, null, 180, null, 120]);
  });

  it('descarta timestamps inválidos con gracia (nunca NaN)', () => {
    const series = [serie(1, iso(0)), serie(2, 'no-es-fecha'), serie(3, iso(90)), serie(4, '')];
    const deltas = deltasEntreSeries(series);
    expect(deltas[0]).toBeNull();
    expect(deltas[1]).toBeNull();
    expect(deltas[2]).toBe(90);
    expect(deltas[3]).toBeNull();
  });

  it('una serie no completada con timestamp no participa del cálculo', () => {
    const series = [serie(1, iso(0)), serie(2, iso(90), false), serie(3, iso(200))];
    expect(deltasEntreSeries(series)).toEqual([null, null, 200]);
  });

  it('alinea el resultado por índice original aunque el arreglo llegue desordenado', () => {
    const series = [serie(3, iso(200)), serie(1, iso(0)), serie(2, iso(95))];
    expect(deltasEntreSeries(series)).toEqual([105, null, 95]);
  });

  it('marcas simultáneas dan delta 0 (no negativo ni ausente)', () => {
    const series = [serie(1, iso(0)), serie(2, iso(0))];
    expect(deltasEntreSeries(series)).toEqual([null, 0]);
  });
});

describe('deltaEntreEjerciciosSegundos (WU15: Δ real entre ejercicios)', () => {
  it('usa la última marca del anterior y la primera del siguiente', () => {
    const anterior = ejercicio(serie(1, iso(0)), serie(2, iso(300)));
    const siguiente = ejercicio(serie(1, iso(590)), serie(2, iso(700)));
    expect(deltaEntreEjerciciosSegundos(anterior, siguiente)).toBe(290);
  });

  it('devuelve null si al ejercicio anterior o al siguiente les falta marca', () => {
    const completo = ejercicio(serie(1, iso(0)));
    const sinMarcas = ejercicio(serie(1, null), serie(2, undefined));
    expect(deltaEntreEjerciciosSegundos(sinMarcas, completo)).toBeNull();
    expect(deltaEntreEjerciciosSegundos(completo, sinMarcas)).toBeNull();
  });

  it('ignora series no completadas al buscar extremos', () => {
    const anterior = ejercicio(serie(1, iso(0)), serie(2, iso(999), false));
    const siguiente = ejercicio(serie(1, iso(400), false), serie(2, iso(500)));
    expect(deltaEntreEjerciciosSegundos(anterior, siguiente)).toBe(500);
  });

  it('omite el delta si el siguiente ejercicio empezó antes de terminar el anterior', () => {
    const anterior = ejercicio(serie(1, iso(600)));
    const siguiente = ejercicio(serie(1, iso(300)));
    expect(deltaEntreEjerciciosSegundos(anterior, siguiente)).toBeNull();
  });
});

describe('deltasEntreEjercicios (WU15: encadenado por orden prescrito)', () => {
  it('sin ejercicios devuelve un arreglo vacío', () => {
    expect(deltasEntreEjercicios([])).toEqual([]);
  });

  it('el primer ejercicio no tiene delta; el resto se encadena', () => {
    const ejercicios = [
      ejercicio(serie(1, iso(0)), serie(2, iso(120))),
      ejercicio(serie(1, iso(400))),
      ejercicio(serie(1, iso(700))),
    ];
    expect(deltasEntreEjercicios(ejercicios)).toEqual([null, 280, 300]);
  });

  it('un ejercicio sin marcas corta la cadena: sus saltos vecinos devuelven null', () => {
    const ejercicios = [
      ejercicio(serie(1, iso(0))),
      ejercicio(serie(1, null)),
      ejercicio(serie(1, iso(600))),
    ];
    expect(deltasEntreEjercicios(ejercicios)).toEqual([null, null, null]);
  });
});

describe('marcarInicioSerieReal (WU17: captura sin fricción)', () => {
  it('marca el inicio de una serie pendiente que aún no tiene marca', () => {
    const pendiente = serie(1, null, false);
    expect(marcarInicioSerieReal(pendiente, iso(10))).toEqual({
      ...pendiente,
      timestampInicioUtc: iso(10),
    });
  });

  it('no marca una serie ya completada (nunca se retro-marca)', () => {
    expect(marcarInicioSerieReal(serie(1, iso(90), true), iso(200))).toBeNull();
  });

  it('no desplaza una marca de inicio existente (la primera interacción gana)', () => {
    const conInicio: SerieConMarca = {
      numeroSerie: 1,
      completada: false,
      timestampInicioUtc: iso(10),
    };
    expect(marcarInicioSerieReal(conInicio, iso(50))).toBeNull();
  });

  it('una marca de inicio inválida cuenta como ausente y se reemplaza', () => {
    const invalida: SerieConMarca = {
      numeroSerie: 1,
      completada: false,
      timestampInicioUtc: 'no-es-fecha',
    };
    expect(marcarInicioSerieReal(invalida, iso(5))?.timestampInicioUtc).toBe(iso(5));
  });
});

describe('descansosRealesEntreSeries (WU17: inicio N − completada N−1)', () => {
  it('calcula el descanso real de cada serie contra la anterior en orden de numeroSerie', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(40) },
      { numeroSerie: 2, completada: true, timestampInicioUtc: iso(130), timestampCompletadaUtc: iso(190) },
      { numeroSerie: 3, completada: true, timestampInicioUtc: iso(300), timestampCompletadaUtc: iso(350) },
    ];
    expect(descansosRealesEntreSeries(series)).toEqual([null, 90, 110]);
  });

  it('sin marca de inicio no hay medición (jamás se inventa)', () => {
    const series: SerieConMarca[] = [
      serie(1, iso(0)),
      { numeroSerie: 2, completada: true, timestampCompletadaUtc: iso(200) },
    ];
    expect(descansosRealesEntreSeries(series)).toEqual([null, null]);
  });

  it('ordena por numeroSerie aunque el arreglo llegue desordenado (alinea por índice)', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 2, completada: true, timestampInicioUtc: iso(130), timestampCompletadaUtc: iso(190) },
      { numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(40) },
    ];
    expect(descansosRealesEntreSeries(series)).toEqual([90, null]);
  });

  it('un inicio anterior a la completada previa devuelve null (nunca negativo)', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: true, timestampCompletadaUtc: iso(100) },
      { numeroSerie: 2, completada: false, timestampInicioUtc: iso(50) },
    ];
    expect(descansosRealesEntreSeries(series)).toEqual([null, null]);
  });

  it('una marca de inicio inválida no rompe el cálculo', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: true, timestampCompletadaUtc: iso(40) },
      { numeroSerie: 2, completada: false, timestampInicioUtc: 'no-es-fecha' },
    ];
    expect(descansosRealesEntreSeries(series)).toEqual([null, null]);
  });
});

describe('descansosRealesEntreEjercicios (WU17: primera del siguiente − última del anterior)', () => {
  it('usa el inicio de la primera serie del siguiente y la última completada del anterior', () => {
    const anterior: EjercicioConMarcas = {
      series: [
        { numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(40) },
        { numeroSerie: 2, completada: true, timestampInicioUtc: iso(120), timestampCompletadaUtc: iso(170) },
      ],
    };
    const siguiente: EjercicioConMarcas = {
      series: [
        { numeroSerie: 1, completada: true, timestampInicioUtc: iso(300), timestampCompletadaUtc: iso(350) },
      ],
    };
    expect(descansosRealesEntreEjercicios([anterior, siguiente])).toEqual([null, 130]);
  });

  it('devuelve null si falta la marca de inicio del siguiente o la completada del anterior', () => {
    const completo: EjercicioConMarcas = {
      series: [
        { numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(40) },
      ],
    };
    const sinInicio: EjercicioConMarcas = {
      series: [{ numeroSerie: 1, completada: true, timestampCompletadaUtc: iso(300) }],
    };
    expect(descansosRealesEntreEjercicios([completo, sinInicio])).toEqual([null, null]);
    expect(descansosRealesEntreEjercicios([sinInicio, completo])).toEqual([null, null]);
  });

  it('el primer ejercicio siempre devuelve null', () => {
    const primero: EjercicioConMarcas = {
      series: [{ numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(40) }],
    };
    expect(descansosRealesEntreEjercicios([primero])).toEqual([null]);
  });
});

describe('duracionesEjecucionSeries (WU17: completada − inicio)', () => {
  it('deriva la ejecución por serie completada', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: true, timestampInicioUtc: iso(0), timestampCompletadaUtc: iso(36) },
      { numeroSerie: 2, completada: true, timestampInicioUtc: iso(130), timestampCompletadaUtc: iso(158) },
    ];
    expect(duracionesEjecucionSeries(series)).toEqual([36, 28]);
  });

  it('omite series no completadas o sin alguna de las dos marcas', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: false, timestampInicioUtc: iso(0) },
      { numeroSerie: 2, completada: true, timestampInicioUtc: iso(50) },
      { numeroSerie: 3, completada: true, timestampCompletadaUtc: iso(200) },
      { numeroSerie: 4, completada: true, timestampInicioUtc: 'no-es-fecha', timestampCompletadaUtc: iso(300) },
    ];
    expect(duracionesEjecucionSeries(series)).toEqual([null, null, null, null]);
  });

  it('un fin anterior al inicio devuelve null (nunca negativo)', () => {
    const series: SerieConMarca[] = [
      { numeroSerie: 1, completada: true, timestampInicioUtc: iso(100), timestampCompletadaUtc: iso(40) },
    ];
    expect(duracionesEjecucionSeries(series)).toEqual([null]);
  });
});

describe('formatearDeltaSegundos (WU15: formato humano honesto)', () => {
  it('devuelve el marcador de sin dato para null, undefined, NaN y negativos', () => {
    expect(formatearDeltaSegundos(null)).toBe(DELTA_SIN_DATO);
    expect(formatearDeltaSegundos(undefined)).toBe(DELTA_SIN_DATO);
    expect(formatearDeltaSegundos(Number.NaN)).toBe(DELTA_SIN_DATO);
    expect(formatearDeltaSegundos(-5)).toBe(DELTA_SIN_DATO);
  });

  it('formatea segundos sueltos y el minuto exacto', () => {
    expect(formatearDeltaSegundos(0)).toBe('0 s');
    expect(formatearDeltaSegundos(45)).toBe('45 s');
    expect(formatearDeltaSegundos(59)).toBe('59 s');
    expect(formatearDeltaSegundos(60)).toBe('1 min');
  });

  it('formatea minutos con segundos y sin ellos', () => {
    expect(formatearDeltaSegundos(105)).toBe('1 min 45 s');
    expect(formatearDeltaSegundos(590)).toBe('9 min 50 s');
    expect(formatearDeltaSegundos(3599)).toBe('59 min 59 s');
  });

  it('formatea horas con minutos y sin ellos', () => {
    expect(formatearDeltaSegundos(3600)).toBe('1 h');
    expect(formatearDeltaSegundos(4320)).toBe('1 h 12 min');
    expect(formatearDeltaSegundos(7260)).toBe('2 h 1 min');
  });

  it('redondea deltas no enteros al segundo más cercano', () => {
    expect(formatearDeltaSegundos(104.6)).toBe('1 min 45 s');
    expect(formatearDeltaSegundos(104.4)).toBe('1 min 44 s');
  });
});

describe('formatearSegundos (WU18: alias para tiempos planificados y temporizador)', () => {
  it('usa el mismo formato humano que los deltas', () => {
    expect(formatearSegundos(45)).toBe('45 s');
    expect(formatearSegundos(90)).toBe('1 min 30 s');
    expect(formatearSegundos(120)).toBe('2 min');
  });

  it('mantiene el marcador honesto cuando no hay dato', () => {
    expect(formatearSegundos(null)).toBe(DELTA_SIN_DATO);
    expect(formatearSegundos(-1)).toBe(DELTA_SIN_DATO);
  });
});
