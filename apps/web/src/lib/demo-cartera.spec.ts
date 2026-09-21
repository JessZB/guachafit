import { describe, expect, it } from 'vitest';
import { crearCarteraDemo } from './demo-cartera';

describe('WU-I: fixture demo del tablero de cartera', () => {
  it('publica un resumen coherente con las listas y sin tasa (Bs honesto)', () => {
    const cartera = crearCarteraDemo({ pestana: 'mora', limit: 25, offset: 0 });

    expect(cartera.resumen.tasaVigente).toBeNull();
    expect(cartera.resumen.contadores.enMora).toBe(3);
    expect(cartera.resumen.contadores.porVencer).toBe(2);
    expect(cartera.resumen.contadores.revision).toBe(2);
    expect(cartera.resumen.contadores.alDia).toBe(2);
    expect(cartera.resumen.alumnosEnMora).toBe(3);
    expect(cartera.resumen.totalEnMoraUsd).toBe('140.00'); // 45 + 60 + 35
    expect(cartera.resumen.totalPorVencerUsd).toBe('65.00'); // 40 + 25
    expect(cartera.resumen.pagosPorValidar).toBe(2);

    // Ninguna fila inventa proyección en Bs sin tasa configurada.
    for (const fila of cartera.items) {
      expect(fila.saldoPendienteBs).toBeNull();
      expect(fila.tasaAplicada).toBeNull();
    }
  });

  it('ordena la mora por días de atraso descendente y los vencimientos por cercanía', () => {
    const mora = crearCarteraDemo({ pestana: 'mora', limit: 25, offset: 0 });
    expect(mora.items.map((f) => f.diasAtraso)).toEqual([12, 7, 2]);

    const porVencer = crearCarteraDemo({ pestana: 'por_vencer', limit: 25, offset: 0 });
    expect(porVencer.items.map((f) => f.diasRestantes)).toEqual([2, 4]);
  });

  it('filtra por nombre con la misma normalización del servidor (sin acentos)', () => {
    const resultado = crearCarteraDemo({
      pestana: 'por_vencer',
      q: 'perez',
      limit: 25,
      offset: 0,
    });
    expect(resultado.total).toBe(1);
    expect(resultado.items[0].alumnoNombre).toContain('Mariana');
  });

  it('aplica los cobros de la sesión demo y recalcula el resumen', () => {
    const cartera = crearCarteraDemo({
      pestana: 'mora',
      limit: 25,
      offset: 0,
      cobrados: ['u-003'],
    });
    expect(cartera.total).toBe(2);
    expect(cartera.resumen.contadores.enMora).toBe(2);
    expect(cartera.resumen.totalEnMoraUsd).toBe('95.00'); // 60 + 35
    expect(cartera.items.some((f) => f.alumnoUsuarioId === 'u-003')).toBe(false);
  });

  it('refleja los recordatorios manuales de la sesión demo en la fila', () => {
    const cartera = crearCarteraDemo({
      pestana: 'mora',
      limit: 25,
      offset: 0,
      recordatorios: { 'u-004': '2026-09-21T10:00:00.000Z' },
    });
    const fila = cartera.items.find((f) => f.alumnoUsuarioId === 'u-004');
    expect(fila?.ultimaGestionUtc).toBe('2026-09-21T10:00:00.000Z');
  });

  it('pagina el slice con el mismo offset del envelope', () => {
    const pagina1 = crearCarteraDemo({ pestana: 'mora', limit: 2, offset: 0 });
    const pagina2 = crearCarteraDemo({ pestana: 'mora', limit: 2, offset: 2 });

    expect(pagina1.items).toHaveLength(2);
    expect(pagina1.total).toBe(3);
    expect(pagina2.items).toHaveLength(1);
    expect(pagina2.items[0].alumnoUsuarioId).toBe('u-001');
    expect(pagina2.offset).toBe(2);
  });
});
