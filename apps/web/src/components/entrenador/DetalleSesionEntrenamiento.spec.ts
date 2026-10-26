/**
 * WU16: smoke tests de render del detalle de sesión reutilizado por la ficha del alumno.
 *
 * Sin jsdom (el repo no tiene testing-library): se rinde a string en Node con
 * `react-dom/server`, suficiente para comprobar qué datos aparecen en cada modo del acordeón.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetalleSesionEntrenamiento } from './DetalleSesionEntrenamiento';
import { sesionesDemoAlumno } from '../../lib/demo-sesiones';

describe('DetalleSesionEntrenamiento (WU16: props de la ficha del alumno)', () => {
  it('colapsado (mostrarSeries=false) solo rinde la cabecera: sin series, deltas ni notas', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const html = renderToStaticMarkup(
      createElement(DetalleSesionEntrenamiento, {
        sesion,
        mostrarSeries: false,
        chipRecuperada: 'Recuperada · Lunes',
      })
    );

    expect(html).toContain('Recuperada · Lunes');
    expect(html).toContain('Completada');
    expect(html).not.toContain('Tiempo entre series');
    expect(html).not.toContain('Nota del coach');
    expect(html).not.toContain('Sin series registradas');
  });

  it('expandido (mostrarSeries=true) incluye descanso real, ejecución, timer, notas del coach y grupo muscular', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const html = renderToStaticMarkup(
      createElement(DetalleSesionEntrenamiento, {
        sesion,
        mostrarSeries: true,
        mostrarGrupoMuscular: true,
      })
    );

    // WU17: con marcas de inicio en las fixtures, la medición real reemplaza al Δ derivado.
    expect(html).toContain('Descanso real:');
    expect(html).toContain('Duración de la serie:');
    // WU18: copy humano, sin abreviaturas ni segundos en crudo (timer 90 s → '1 min 30 s').
    expect(html).toContain('Temporizador: 1 min 30 s');
    expect(html).toContain('Descanso planificado: 1 min 30 s');
    expect(html).toContain('Plan: 12 reps · 28 kg');
    expect(html).not.toContain('Timer:');
    expect(html).not.toContain('Presc.');
    expect(html).toContain('Nota del coach');
    expect(html).toContain('Pecho');
    expect(html).toContain('Feedback del alumno');
  });

  it('sin marcas de inicio cae al tiempo aproximado derivado como respaldo (nunca inventa la medición)', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const sinInicio = {
      ...sesion,
      ejercicios: sesion.ejercicios.map((ejercicio) => ({
        ...ejercicio,
        series: ejercicio.series.map((serie) => ({ ...serie, timestampInicioUtc: null })),
      })),
    };
    const html = renderToStaticMarkup(
      createElement(DetalleSesionEntrenamiento, { sesion: sinInicio, mostrarSeries: true })
    );

    expect(html).toContain('Tiempo entre series (aprox.):');
    expect(html).toContain('Tiempo entre ejercicios (aprox.):');
    expect(html).not.toContain('Descanso real:');
    expect(html).not.toContain('Duración de la serie:');
  });

  it('rinde la acción externa de cabecera (toggle Ver/Ocultar series) en su slot', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const html = renderToStaticMarkup(
      createElement(DetalleSesionEntrenamiento, {
        sesion,
        mostrarSeries: false,
        accionesCabecera: createElement('button', { type: 'button' }, 'Ocultar Series'),
      })
    );

    expect(html).toContain('Ocultar Series');
  });

  it('una sesión de descanso sin series muestra el estado vacío honesto al expandirse', () => {
    const sesionDescanso = sesionesDemoAlumno('al-002').find(
      (sesion) => sesion.esDiaDescansoOriginal
    );
    expect(sesionDescanso).toBeDefined();

    const html = renderToStaticMarkup(
      createElement(DetalleSesionEntrenamiento, {
        sesion: sesionDescanso!,
        mostrarSeries: true,
      })
    );

    expect(html).toContain('Sin series registradas en esta sesión.');
  });
});
