/**
 * Lote E3 · contratos C1–C3 (fase roja): filtros de entrada numérica de la web.
 *
 * El módulo `./entrada-numerica` todavía no existe: el archivo debe fallar al resolver
 * el import. Cuando exista, cada caso de esta tabla describe el contrato exacto.
 *
 * C1: los filtros reciben (nuevo, anterior) y devuelven el texto que debe quedar: el nuevo
 * si es un estado válido mientras se escribe, o el anterior si no lo es. Nunca transforman
 * el texto (no cambian la coma por punto).
 */
import { describe, expect, it } from 'vitest';
import {
  componerPesoPrescrito,
  esRepsPrescritasValidas,
  filtrarEntradaPeso,
  filtrarEntradaReps,
  filtrarEntradaRepsPrescritas,
  filtrarEntradaRpe,
  filtrarEntradaSeries,
  interpretarPesoPrescrito,
} from './entrada-numerica';

type ModoPesoPrescrito = 'numero' | 'corporal';

interface PesoPrescritoInterpretado {
  modo: ModoPesoPrescrito;
  numero: string;
  textoCorporal: string;
}

describe('C1 · filtrarEntradaPeso: peso del alumno (kg o lb) sin superar el tope', () => {
  const CASOS_KG: Array<[string, string]> = [
    ['60', '60'],
    ['60,5', '60,5'],
    ['60.25', '60.25'],
    ['60,', '60,'],
    ['', ''],
    ['999', '999'],
    ['6a', '6'],
    ['6-', '6'],
    ['60.255', '6'],
    ['6,5,', '6'],
    ['1000', '6'],
    ['999.01', '6'],
    [',', '6'],
    [' 6', '6'],
  ];

  it.each(CASOS_KG)('kg · con anterior "6", "%s" queda como "%s"', (nuevo, esperado) => {
    expect(filtrarEntradaPeso(nuevo, '6', 'kg')).toBe(esperado);
  });

  it('lb · acepta 2202 y devuelve el anterior para 2203', () => {
    expect(filtrarEntradaPeso('2202', '220', 'lb')).toBe('2202');
    expect(filtrarEntradaPeso('2203', '2202', 'lb')).toBe('2202');
  });
});

describe('C1 · filtrarEntradaReps: repeticiones hechas por el alumno (0–200)', () => {
  it.each(['', '0', '12', '200'])('acepta "%s"', (nuevo) => {
    expect(filtrarEntradaReps(nuevo, '5')).toBe(nuevo);
  });

  it.each(['201', '1a', '1.5', '-1', '0012'])(
    'rechaza "%s" y devuelve el anterior',
    (nuevo) => {
      expect(filtrarEntradaReps(nuevo, '12')).toBe('12');
    }
  );
});

describe('C1 · filtrarEntradaRpe: esfuerzo del alumno (1–10 en pasos de 0,5)', () => {
  it.each(['', '1', '8', '8.', '8,', '8.5', '8,5', '8.0', '10'])('acepta "%s"', (nuevo) => {
    expect(filtrarEntradaRpe(nuevo, '8')).toBe(nuevo);
  });

  it.each(['0', '11', '8.3', '8.55', '10.', '10.5', 'a', '.5'])(
    'rechaza "%s" y devuelve el anterior',
    (nuevo) => {
      expect(filtrarEntradaRpe(nuevo, '8.5')).toBe('8.5');
    }
  );
});

describe('C1 · filtrarEntradaRepsPrescritas: reps que prescribe el entrenador', () => {
  it.each(['', '1', '10', '8-', '8-1', '8-10', '45 ', '45 s', '45s'])('acepta "%s"', (nuevo) => {
    expect(filtrarEntradaRepsPrescritas(nuevo, '8')).toBe(nuevo);
  });

  it.each(['0', '201', '8-201', '8--', '8-10-12', 'abc', '10 kg', 's', '-8'])(
    'rechaza "%s" y devuelve el anterior',
    (nuevo) => {
      expect(filtrarEntradaRepsPrescritas(nuevo, '10')).toBe('10');
    }
  );
});

describe('C1 · filtrarEntradaSeries: series de un ajuste (1–50, fuera del contrato original)', () => {
  it.each(['', '1', '12', '50'])('acepta "%s"', (nuevo) => {
    expect(filtrarEntradaSeries(nuevo, '5')).toBe(nuevo);
  });

  it.each(['0', '51', '05', '1a', '100'])('rechaza "%s" y devuelve el anterior', (nuevo) => {
    expect(filtrarEntradaSeries(nuevo, '5')).toBe('5');
  });
});

describe('C2 · esRepsPrescritasValidas: validación final al guardar', () => {
  it.each(['10', '8-10', '8 - 10', '45s', '45 s', '200'])('acepta "%s"', (texto) => {
    expect(esRepsPrescritasValidas(texto)).toBe(true);
  });

  it.each(['', '8-', '10-8', '0', '201', '8-250', '45 seg', 'abc'])('rechaza "%s"', (texto) => {
    expect(esRepsPrescritasValidas(texto)).toBe(false);
  });
});

describe('C3 · interpretarPesoPrescrito: separa número y texto corporal', () => {
  const CASOS: Array<[string, PesoPrescritoInterpretado]> = [
    ['', { modo: 'numero', numero: '', textoCorporal: '' }],
    ['60', { modo: 'numero', numero: '60', textoCorporal: '' }],
    ['60,5 kg', { modo: 'numero', numero: '60.5', textoCorporal: '' }],
    ['Corporal', { modo: 'corporal', numero: '', textoCorporal: 'Corporal' }],
    ['Moderado', { modo: 'corporal', numero: '', textoCorporal: 'Moderado' }],
    ['2x20 kg', { modo: 'numero', numero: '2', textoCorporal: '' }],
  ];

  it.each(CASOS)('interpreta "%s"', (texto, esperado) => {
    expect(interpretarPesoPrescrito(texto)).toEqual(esperado);
  });
});

describe('C3 · componerPesoPrescrito: valor listo para el formulario', () => {
  it('modo corporal: conserva el texto o cae a "Corporal"', () => {
    expect(
      componerPesoPrescrito({ modo: 'corporal', numero: '', textoCorporal: 'Corporal' })
    ).toBe('Corporal');
    expect(
      componerPesoPrescrito({ modo: 'corporal', numero: '', textoCorporal: 'Moderado' })
    ).toBe('Moderado');
    expect(componerPesoPrescrito({ modo: 'corporal', numero: '', textoCorporal: '' })).toBe(
      'Corporal'
    );
  });

  it('modo número: punto decimal y sin separador final', () => {
    expect(componerPesoPrescrito({ modo: 'numero', numero: '60,5', textoCorporal: '' })).toBe(
      '60.5'
    );
    expect(componerPesoPrescrito({ modo: 'numero', numero: '60,', textoCorporal: '' })).toBe('60');
    expect(componerPesoPrescrito({ modo: 'numero', numero: '', textoCorporal: '' })).toBe('');
  });
});
