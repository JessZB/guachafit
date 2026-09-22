import { describe, expect, it } from 'vitest';
import {
  clasificarTolerancia,
  contarNoReportados,
  crearCalendarioNutricional,
  derivarEstadoDiaNutricional,
  etiquetaEstadoDia,
  etiquetaSemaforoNutricional,
  etiquetaTipoComida,
  evaluarToleranciaNutricionalLocal,
  formatearDesviacionPct,
  metasConfiguradas,
  resumenMetas,
  resumenTotalesReportados,
} from './nutricion-metas';
import {
  EstadoDiaNutricional,
  SemaforoNutricional,
  TipoComida,
  type CheckinNutricionalDetalleDTO,
  type MetasNutricionalesDetalleDTO,
} from '@guachafit/shared';

function metas(parcial: Partial<MetasNutricionalesDetalleDTO> = {}): MetasNutricionalesDetalleDTO {
  return {
    id: 'm1',
    alumnoId: 'a1',
    caloriasObjetivo: null,
    proteinaGramosObjetivo: null,
    carbohidratosGramosObjetivo: null,
    grasasGramosObjetivo: null,
    aguaLitrosObjetivo: null,
    recursos: [],
    createdAtUtc: '2026-09-01T00:00:00.000Z',
    updatedAtUtc: '2026-09-01T00:00:00.000Z',
    ...parcial,
  };
}

function checkin(parcial: Partial<CheckinNutricionalDetalleDTO> = {}): CheckinNutricionalDetalleDTO {
  return {
    id: 'c1',
    alumnoId: 'a1',
    fecha: '2026-09-20',
    semaforo: SemaforoNutricional.CUMPLIDO,
    caloriasReportadas: null,
    proteinaGramosReportada: null,
    aguaLitros: null,
    notasAlumno: null,
    fotosPlatos: [],
    createdAtUtc: '2026-09-20T22:00:00.000Z',
    updatedAtUtc: '2026-09-20T22:00:00.000Z',
    ...parcial,
  };
}

describe('etiquetas humanas de nutrición (00_Reglas §6, copy español)', () => {
  it('traduce el semáforo persistido y el estado derivado sin valores crudos', () => {
    expect(etiquetaSemaforoNutricional(SemaforoNutricional.CUMPLIDO)).toEqual({
      texto: 'Cumplido',
      tono: 'success',
    });
    expect(etiquetaSemaforoNutricional(SemaforoNutricional.PARCIAL).tono).toBe('warning');
    expect(etiquetaSemaforoNutricional(SemaforoNutricional.NO_CUMPLIDO).tono).toBe('danger');
    expect(etiquetaSemaforoNutricional(EstadoDiaNutricional.NO_REPORTADO)).toEqual({
      texto: 'No reportado',
      tono: 'neutral',
    });
    expect(etiquetaSemaforoNutricional(undefined).texto).toBe('Sin dato');
  });

  it('el día en curso sin estado se declara "Día en curso" (nunca No reportado antes de cerrar)', () => {
    expect(etiquetaEstadoDia(null)).toEqual({ texto: 'Día en curso', tono: 'info' });
    expect(etiquetaEstadoDia(EstadoDiaNutricional.NO_REPORTADO).texto).toBe('No reportado');
  });

  it('etiqueta las comidas de las fotos con el copy del RF (merienda, no snack)', () => {
    expect(etiquetaTipoComida(TipoComida.DESAYUNO)).toBe('Desayuno');
    expect(etiquetaTipoComida(TipoComida.SNACK)).toBe('Merienda');
    expect(etiquetaTipoComida('desconocido')).toBe('Comida');
  });
});

describe('evaluarToleranciaNutricionalLocal (RF-002 Escenario 3: ±10 %)', () => {
  it('marca dentro del margen justo en el borde del 10 %', () => {
    const resultado = evaluarToleranciaNutricionalLocal(2420, 144, metas({ caloriasObjetivo: 2200, proteinaGramosObjetivo: 160 }));
    expect(resultado.dentroMargenTolerancia).toBe(true);
    expect(resultado.desviacionCaloriasPct).toBe(10);
    expect(resultado.desviacionProteinasPct).toBe(-10);
  });

  it('marca fuera del margen y expone el desvío por dimensión', () => {
    const resultado = evaluarToleranciaNutricionalLocal(2500, 150, metas({ caloriasObjetivo: 2200, proteinaGramosObjetivo: 160 }));
    expect(resultado.dentroMargenTolerancia).toBe(false);
    expect(resultado.desviacionCaloriasPct).toBe(13.64);
    expect(resultado.desviacionProteinasPct).toBe(-6.25);
  });

  it('sin metas o sin totales reportados queda "sin evaluar" (nunca un falso OK)', () => {
    expect(evaluarToleranciaNutricionalLocal(2100, 150, null)).toEqual({});
    expect(evaluarToleranciaNutricionalLocal(null, null, metas({ caloriasObjetivo: 2200 }))).toEqual({});
    expect(evaluarToleranciaNutricionalLocal(2100, undefined, metas({ caloriasObjetivo: 2200 }))).toMatchObject({
      dentroMargenTolerancia: true,
      desviacionCaloriasPct: -4.55,
    });
  });

  it('clasifica el semáforo en verde / ámbar / rojo / sin evaluar', () => {
    expect(clasificarTolerancia({}).nivel).toBe('sin_evaluar');
    expect(
      clasificarTolerancia({ dentroMargenTolerancia: true, desviacionCaloriasPct: 2, desviacionProteinasPct: -3 }).nivel
    ).toBe('verde');
    expect(
      clasificarTolerancia({ dentroMargenTolerancia: false, desviacionCaloriasPct: 13.64, desviacionProteinasPct: -6.25 }).nivel
    ).toBe('ambar');
    expect(
      clasificarTolerancia({ dentroMargenTolerancia: false, desviacionCaloriasPct: 40, desviacionProteinasPct: -30 }).nivel
    ).toBe('rojo');
  });

  it('formatea el desvío con signo y sin decimales inventados', () => {
    expect(formatearDesviacionPct(13.64)).toBe('+13.64%');
    expect(formatearDesviacionPct(-6.25)).toBe('-6.25%');
    expect(formatearDesviacionPct(0)).toBe('0%');
    expect(formatearDesviacionPct(undefined)).toBeNull();
  });
});

describe('metas del coach y totales reportados', () => {
  it('resume solo los objetivos configurados (null = no configurado, nunca 0)', () => {
    const objetivos = resumenMetas(
      metas({ caloriasObjetivo: 2200, proteinaGramosObjetivo: 160, aguaLitrosObjetivo: '3.00' })
    );
    expect(objetivos).toEqual([
      { etiqueta: 'Calorías', valor: '2200 kcal' },
      { etiqueta: 'Proteína', valor: '160 g' },
      { etiqueta: 'Agua', valor: '3.00 L' },
    ]);
  });

  it('declara "sin metas" cuando no hay objetivos ni recursos', () => {
    expect(metasConfiguradas(metas())).toBe(false);
    expect(metasConfiguradas(null)).toBe(false);
    expect(metasConfiguradas(metas({ grasasGramosObjetivo: 70 }))).toBe(true);
    expect(
      metasConfiguradas(metas({ recursos: [{ titulo: 'Lista', url: 'https://demo.test/l.pdf' }] }))
    ).toBe(true);
  });

  it('resume los totales reportados sin fabricar ceros', () => {
    expect(resumenTotalesReportados(checkin())).toEqual([]);
    expect(resumenTotalesReportados(checkin({ caloriasReportadas: 2150, proteinaGramosReportada: 158 }))).toEqual([
      { etiqueta: 'Calorías', valor: '2150 kcal' },
      { etiqueta: 'Proteína', valor: '158 g' },
    ]);
  });
});

describe('calendario nutricional y estado derivado "No reportado" (RF-002 §6)', () => {
  it('deriva No reportado solo para días cerrados sin check-in', () => {
    expect(derivarEstadoDiaNutricional('2026-09-19', '2026-09-21')).toBe(EstadoDiaNutricional.NO_REPORTADO);
    expect(derivarEstadoDiaNutricional('2026-09-21', '2026-09-21')).toBeNull();
    expect(derivarEstadoDiaNutricional('2026-09-22', '2026-09-21')).toBeNull();
    expect(derivarEstadoDiaNutricional('ayer', '2026-09-21')).toBeNull();
    expect(
      derivarEstadoDiaNutricional('2026-09-19', '2026-09-21', SemaforoNutricional.PARCIAL)
    ).toBe(EstadoDiaNutricional.PARCIAL);
  });

  it('combina check-ins reales con días faltantes y cuenta los no reportados', () => {
    const calendario = crearCalendarioNutricional(
      ['2026-09-21', '2026-09-20', '2026-09-19', '2026-09-18'],
      [checkin({ fecha: '2026-09-20', semaforo: SemaforoNutricional.NO_CUMPLIDO })],
      '2026-09-21'
    );

    expect(calendario.map((dia) => dia.estado)).toEqual([
      null,
      EstadoDiaNutricional.NO_CUMPLIDO,
      EstadoDiaNutricional.NO_REPORTADO,
      EstadoDiaNutricional.NO_REPORTADO,
    ]);
    expect(contarNoReportados(calendario)).toBe(2);
  });
});
