import { describe, expect, it } from 'vitest';
import { vacioTablaCartera } from './tabla-cartera-vacio';

describe('vacioTablaCartera (prompt 85)', () => {
  it('devuelve el vacío honesto de cada pestaña', () => {
    expect(vacioTablaCartera('mora')).toEqual({
      titulo: 'Sin cuotas vencidas',
      detalle: 'Ningún alumno tiene deuda vencida por ahora.',
    });
    expect(vacioTablaCartera('por_vencer')).toEqual({
      titulo: 'Sin vencimientos próximos',
      detalle: 'Nadie tiene una cuota por vencer en los próximos 5 días.',
    });
    expect(vacioTablaCartera('revision')).toEqual({
      titulo: 'Sin pagos por validar',
      detalle: 'No hay comprobantes esperando revisión en la bandeja.',
    });
    expect(vacioTablaCartera('al_dia')).toEqual({
      titulo: 'Sin cuotas cubiertas en el ciclo',
      detalle: 'Cuando un alumno cubra al 100% su cuota del mes aparecerá aquí.',
    });
  });

  it('con búsqueda activa devuelve "Sin resultados" en cualquier pestaña', () => {
    for (const pestana of ['mora', 'por_vencer', 'revision', 'al_dia'] as const) {
      expect(vacioTablaCartera(pestana, true)).toEqual({
        titulo: 'Sin resultados',
        detalle: 'Ningún alumno coincide con la búsqueda en esta pestaña.',
      });
    }
  });
});
