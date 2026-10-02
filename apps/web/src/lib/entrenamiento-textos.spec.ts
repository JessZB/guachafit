import { describe, expect, it } from 'vitest';
import {
  describirEsfuerzo,
  formatearFechaLegible,
  formatearNotaEntrenadorParaAlumno,
  formatearNotasParaAlumno,
  formatearProgresoDias,
  formatearRangoHorario,
  formatearTituloSemana,
  textoEsfuerzoSugerido,
  textoUltimoEntrenamientoGuardado,
} from './entrenamiento-textos';

describe('entrenamiento-textos: textos claros para el alumno', () => {
  it('título de la semana con fechas legibles en español (sin semana ISO)', () => {
    expect(formatearTituloSemana('2026-09-14', '2026-09-20')).toBe(
      'Tu semana · del 14 sept al 20 sept'
    );
    expect(formatearTituloSemana('2026-05-04', '2026-05-10')).toBe(
      'Tu semana · del 4 may al 10 may'
    );
    expect(formatearTituloSemana('no-es-fecha', '2026-05-10')).toBe('Tu semana');
  });

  it('progreso de la semana en días hechos', () => {
    expect(formatearProgresoDias(3, 5)).toBe('3 de 5 días hechos');
    expect(formatearProgresoDias(0, 1)).toBe('0 de 1 día hecho');
    expect(formatearProgresoDias(1, 1)).toBe('1 de 1 día hecho');
  });

  it('rango horario sin "h local"', () => {
    const inicio = new Date(2026, 9, 2, 10, 15).toISOString();
    const fin = new Date(2026, 9, 2, 11, 20).toISOString();
    expect(formatearRangoHorario(inicio, fin)).toBe('de 10:15 a 11:20');
    expect(formatearRangoHorario(inicio, null)).toBe('desde las 10:15');
    expect(formatearRangoHorario(null, null)).toBeNull();
  });

  it('describe el esfuerzo de 1 a 10 sin siglas técnicas', () => {
    expect(describirEsfuerzo(8)).toBe('Exigente: te quedaban 2 repeticiones');
    expect(describirEsfuerzo(9)).toBe('Casi al límite: te quedaba 1 o ninguna');
    expect(describirEsfuerzo(10)).toBe('Al máximo: no podías hacer ni una más');
    for (let valor = 1; valor <= 10; valor++) {
      expect(describirEsfuerzo(valor)).not.toMatch(/RPE|RIR/);
    }
  });

  it('esfuerzo sugerido legible', () => {
    expect(textoEsfuerzoSugerido('8')).toBe('Esfuerzo sugerido: 8 de 10');
    expect(textoEsfuerzoSugerido('8.50')).toBe('Esfuerzo sugerido: 8,5 de 10');
  });

  it('las notas guardadas se muestran como etiquetas legibles (el formato guardado no cambia)', () => {
    expect(
      formatearNotasParaAlumno('[RPE: 8/10] • [Molestia: Hombro] • Buen ritmo hoy')
    ).toBe('Esfuerzo 8/10 · Molestia: Hombro · Buen ritmo hoy');
    expect(
      formatearNotasParaAlumno(
        '[RPE: 7/10] • [Descanso promedio: 2 min (planificado: 1 min 30 s · +30 s)]'
      )
    ).toBe('Esfuerzo 7/10 · Descanso promedio: 2 min (planificado: 1 min 30 s · +30 s)');
    expect(formatearNotasParaAlumno('Solo texto')).toBe('Solo texto');
    expect(formatearNotasParaAlumno(null)).toBe('');
  });

  it('fecha legible y aviso de último entrenamiento guardado de otro día', () => {
    expect(formatearFechaLegible('2026-10-01')).toBe('jueves, 1 de octubre');
    expect(textoUltimoEntrenamientoGuardado('2026-10-01')).toBe(
      'Tu último entrenamiento guardado es del jueves, 1 de octubre'
    );
    expect(formatearFechaLegible('2026-13-01')).toBeNull();
  });

  it('la nota automática "Peso: Sugerido" se muestra como "a tu criterio" (solo formato local)', () => {
    expect(
      formatearNotaEntrenadorParaAlumno('Bloque: Día 1 • Reps: 8-10 • Peso: Sugerido')
    ).toBe('Bloque: Día 1 • Reps: 8-10 • Peso: a tu criterio');
    expect(formatearNotaEntrenadorParaAlumno('Baja controlado')).toBe('Baja controlado');
  });
});
