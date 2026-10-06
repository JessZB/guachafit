/**
 * Lote F3 · Zona horaria del perfil (RF-002 RN-02 / ADR-019): utilidades puras en entorno Node.
 * Todos los instantes van fijos en UTC; no se usa el reloj real ni la zona del dispositivo.
 */
import { describe, expect, it } from 'vitest';
import {
  ZONA_HORARIA_POR_DEFECTO,
  ZONAS_HORARIAS_COMUNES,
  esInstanteValido,
  formatearHoraEnZona,
  listarZonasHorarias,
  nombreZonaHoraria,
  partesEnZona,
} from './zona-horaria';

const INSTANTE = new Date('2026-10-06T03:50:00Z');

describe('ZONA_HORARIA_POR_DEFECTO y ZONAS_HORARIAS_COMUNES', () => {
  it('la zona por defecto es Caracas y encabeza las comunes', () => {
    expect(ZONA_HORARIA_POR_DEFECTO).toBe('America/Caracas');
    expect(ZONAS_HORARIAS_COMUNES[0]).toBe('America/Caracas');
  });

  it('incluye las zonas comunes acordadas', () => {
    for (const zona of [
      'America/Bogota',
      'America/Lima',
      'America/Mexico_City',
      'America/Santiago',
      'America/Argentina/Buenos_Aires',
      'Europe/Madrid',
      'America/New_York',
    ]) {
      expect(ZONAS_HORARIAS_COMUNES).toContain(zona);
    }
  });
});

describe('listarZonasHorarias', () => {
  it('devuelve primero las comunes y después el resto en orden alfabético, sin duplicados', () => {
    const resultado = listarZonasHorarias(() => [
      'Asia/Tokyo',
      'America/Caracas',
      'Europe/Madrid',
      'Africa/Cairo',
      'Europe/Madrid',
      'Asia/Tokyo',
    ]);

    expect(resultado.slice(0, ZONAS_HORARIAS_COMUNES.length)).toEqual([...ZONAS_HORARIAS_COMUNES]);
    expect(resultado.slice(ZONAS_HORARIAS_COMUNES.length)).toEqual(['Africa/Cairo', 'Asia/Tokyo']);
    expect(new Set(resultado).size).toBe(resultado.length);
  });

  it('si la lista soportada lanza, devuelve solo las comunes', () => {
    expect(
      listarZonasHorarias(() => {
        throw new Error('sin datos ICU');
      })
    ).toEqual([...ZONAS_HORARIAS_COMUNES]);
  });

  it('sin Intl.supportedValuesOf devuelve solo las comunes', () => {
    const intl = Intl as unknown as { supportedValuesOf?: unknown };
    const original = intl.supportedValuesOf;
    try {
      intl.supportedValuesOf = undefined;
      expect(listarZonasHorarias()).toEqual([...ZONAS_HORARIAS_COMUNES]);
    } finally {
      intl.supportedValuesOf = original;
    }
  });

  it('sin argumentos usa Intl.supportedValuesOf: comunes primero y extras alfabéticas', () => {
    const resultado = listarZonasHorarias();
    expect(resultado.slice(0, ZONAS_HORARIAS_COMUNES.length)).toEqual([...ZONAS_HORARIAS_COMUNES]);
    const extras = resultado.slice(ZONAS_HORARIAS_COMUNES.length);
    expect(extras).toContain('Europe/Paris');
    expect([...extras].sort()).toEqual(extras);
  });
});

describe('nombreZonaHoraria', () => {
  it('nombra en español las zonas comunes', () => {
    expect(nombreZonaHoraria('America/Caracas')).toBe('Hora de Caracas');
    expect(nombreZonaHoraria('America/Bogota')).toBe('Hora de Bogotá');
    expect(nombreZonaHoraria('America/Lima')).toBe('Hora de Lima');
    expect(nombreZonaHoraria('America/Mexico_City')).toBe('Hora de Ciudad de México');
    expect(nombreZonaHoraria('America/Santiago')).toBe('Hora de Santiago');
    expect(nombreZonaHoraria('America/Argentina/Buenos_Aires')).toBe('Hora de Buenos Aires');
    expect(nombreZonaHoraria('Europe/Madrid')).toBe('Hora de Madrid');
    expect(nombreZonaHoraria('America/New_York')).toBe('Hora de Nueva York');
  });

  it('para otras zonas usa la última parte del identificador con "_" → espacio', () => {
    expect(nombreZonaHoraria('Asia/Tokyo')).toBe('Hora de Tokyo');
    expect(nombreZonaHoraria('America/Los_Angeles')).toBe('Hora de Los Angeles');
    expect(nombreZonaHoraria('Europe/Paris')).toBe('Hora de Paris');
  });

  it('con zona vacía o inválida cae a "Hora de Caracas"', () => {
    expect(nombreZonaHoraria('')).toBe('Hora de Caracas');
    expect(nombreZonaHoraria('Foo/Bar')).toBe('Hora de Caracas');
  });
});

describe('partesEnZona', () => {
  it('devuelve la fecha local YYYY-MM-DD y la hora/minuto de la zona', () => {
    expect(partesEnZona(INSTANTE, 'America/Caracas')).toEqual({
      fecha: '2026-10-05',
      hora: 23,
      minuto: 50,
    });
    expect(partesEnZona(INSTANTE, 'Europe/Madrid')).toEqual({
      fecha: '2026-10-06',
      hora: 5,
      minuto: 50,
    });
  });

  it('una zona inválida se interpreta en Caracas', () => {
    expect(partesEnZona(INSTANTE, 'Foo/Bar')).toEqual({
      fecha: '2026-10-05',
      hora: 23,
      minuto: 50,
    });
  });
});

describe('formatearHoraEnZona', () => {
  it('formatea HH:mm en 24 horas', () => {
    expect(formatearHoraEnZona('2026-10-06T03:50:00Z', 'America/Caracas')).toBe('23:50');
  });

  it('rellena con cero a la izquierda', () => {
    expect(formatearHoraEnZona('2026-10-06T12:05:00Z', 'America/Caracas')).toBe('08:05');
  });
});

describe('LOTE F3: esInstanteValido', () => {
  it('acepta un instante ISO y rechaza vacío, nulo o texto ilegible', () => {
    expect(esInstanteValido('2026-10-06T03:50:00Z')).toBe(true);
    expect(esInstanteValido('')).toBe(false);
    expect(esInstanteValido(null)).toBe(false);
    expect(esInstanteValido('abc')).toBe(false);
  });
});
