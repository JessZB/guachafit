import { describe, expect, it } from 'vitest';
import {
  aplicarTabEnQuery,
  parsearTabFichaAlumno,
  TAB_FICHA_ALUMNO_POR_DEFECTO,
  TABS_FICHA_ALUMNO,
} from './alumno-detalle-tab';

describe('parsearTabFichaAlumno (WU16: deep-link ?tab= de la ficha)', () => {
  it('reconoce las cinco pestañas válidas de la ficha', () => {
    expect([...TABS_FICHA_ALUMNO]).toEqual([
      'resumen',
      'finanzas',
      'antropometria',
      'entrenamiento',
      'nutricion',
    ]);
  });

  it('parsea el deep-link del monitor (?tab=entrenamiento)', () => {
    expect(parsearTabFichaAlumno('entrenamiento')).toBe('entrenamiento');
  });

  it.each(TABS_FICHA_ALUMNO)('acepta el tab válido "%s"', (tab) => {
    expect(parsearTabFichaAlumno(tab)).toBe(tab);
  });

  it('normaliza mayúsculas y espacios alrededor del valor', () => {
    expect(parsearTabFichaAlumno('  ENTRENAMIENTO ')).toBe('entrenamiento');
    expect(parsearTabFichaAlumno('Finanzas')).toBe('finanzas');
  });

  it('cae al tab por defecto con null, cadena vacía o valores desconocidos', () => {
    expect(parsearTabFichaAlumno(null)).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
    expect(parsearTabFichaAlumno(undefined)).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
    expect(parsearTabFichaAlumno('')).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
    expect(parsearTabFichaAlumno('   ')).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
    expect(parsearTabFichaAlumno('historial')).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
    expect(parsearTabFichaAlumno('../etc')).toBe(TAB_FICHA_ALUMNO_POR_DEFECTO);
  });
});

describe('aplicarTabEnQuery (WU16: sincronización del tab con la URL)', () => {
  it('escribe ?tab=<valor> para un tab no-default', () => {
    const resultado = aplicarTabEnQuery(new URLSearchParams(), 'entrenamiento');
    expect(resultado.get('tab')).toBe('entrenamiento');
  });

  it('elimina ?tab cuando el tab activo es el default (URL limpia)', () => {
    const resultado = aplicarTabEnQuery(
      new URLSearchParams('tab=entrenamiento'),
      TAB_FICHA_ALUMNO_POR_DEFECTO
    );
    expect(resultado.has('tab')).toBe(false);
  });

  it('preserva los parámetros ajenos al tab', () => {
    const resultado = aplicarTabEnQuery(
      new URLSearchParams('ref=monitor&tab=finanzas'),
      'entrenamiento'
    );
    expect(resultado.get('ref')).toBe('monitor');
    expect(resultado.get('tab')).toBe('entrenamiento');
  });

  it('no muta el objeto de parámetros original', () => {
    const originales = new URLSearchParams('tab=finanzas');
    aplicarTabEnQuery(originales, 'entrenamiento');
    expect(originales.get('tab')).toBe('finanzas');
  });

  it('reemplaza un ?tab existente en vez de duplicarlo', () => {
    const resultado = aplicarTabEnQuery(new URLSearchParams('tab=finanzas'), 'antropometria');
    expect(resultado.getAll('tab')).toEqual(['antropometria']);
  });
});
