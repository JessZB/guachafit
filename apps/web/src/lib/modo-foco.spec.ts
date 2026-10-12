/**
 * Lote E5 (RF-001) · contrato C1: funciones puras del modo foco (`lib/modo-foco.ts`).
 *
 * Fase roja: el módulo `./modo-foco` aún no existe; este spec fija el contrato completo.
 * Las sesiones de prueba se construyen con los tipos de `@guachafit/shared`; las funciones
 * solo dependen de `ejercicios[].series[].completada` y `numeroSerie`.
 *
 * Decisiones del dueño (2026-10-10/11): el foco sigue la primera serie pendiente en orden;
 * un `ejercicioPreferido` ("Hacer ahora") busca primero en ese ejercicio, luego hacia delante
 * y al final vuelve desde el principio.
 */
import { describe, expect, it } from 'vitest';
import { EstadoSesion } from '@guachafit/shared';
import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import {
  posicionEnFoco,
  progresoFoco,
  siguienteEjercicioPendiente,
  textoProgresoFoco,
  textoSeriesRestantes,
} from './modo-foco';

function serie(
  ejercicioSesionId: string,
  numeroSerie: number,
  completada: boolean
): SerieRegistroDetalleDTO {
  return {
    id: `${ejercicioSesionId}-s${numeroSerie}`,
    ejercicioSesionId,
    numeroSerie,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: null,
    rpe: null,
    descansoSegundos: 90,
    completada,
  };
}

/** Ejercicio con `totalSeries` series; las `seriesCompletadas` primeras quedan hechas. */
function ejercicio(
  indice: number,
  totalSeries: number,
  seriesCompletadas = 0
): EjercicioSesionDetalleDTO {
  const id = `es-${indice}`;
  return {
    id,
    sesionId: 'sesion-1',
    ejercicioId: `ej-${indice}`,
    orden: indice + 1,
    series: Array.from({ length: totalSeries }, (_, s) =>
      serie(id, s + 1, s < seriesCompletadas)
    ),
  };
}

function sesion(ejercicios: EjercicioSesionDetalleDTO[]): SesionEntrenamientoDetalleDTO {
  return {
    id: 'sesion-1',
    alumnoId: 'alumno-1',
    fechaProgramada: '2026-10-11',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    ejercicios,
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  };
}

describe('modo-foco · posicionEnFoco (C1)', () => {
  it('sin preferido devuelve la primera serie pendiente en orden (3 ejercicios de 2 series)', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, null)).toEqual({ ejercicioIndex: 0, serieIndex: 0 });
  });

  it('con la primera serie del primer ejercicio hecha avanza a su segunda serie', () => {
    const s = sesion([ejercicio(0, 2, 1), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, null)).toEqual({ ejercicioIndex: 0, serieIndex: 1 });
  });

  it('con el primer ejercicio completo pasa al segundo ejercicio', () => {
    const s = sesion([ejercicio(0, 2, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, null)).toEqual({ ejercicioIndex: 1, serieIndex: 0 });
  });

  it('con ejercicioPreferido=2 y todo pendiente empieza en el ejercicio preferido', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, 2)).toEqual({ ejercicioIndex: 2, serieIndex: 0 });
  });

  it('con el ejercicio preferido completo vuelve al principio de la sesión', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2, 2)]);

    expect(posicionEnFoco(s, 2)).toEqual({ ejercicioIndex: 0, serieIndex: 0 });
  });

  it('con el preferido completo pero un ejercicio posterior pendiente, sigue hacia delante', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, 1)).toEqual({ ejercicioIndex: 2, serieIndex: 0 });
  });

  it('con todo completo devuelve null', () => {
    const s = sesion([ejercicio(0, 2, 2), ejercicio(1, 2, 2)]);

    expect(posicionEnFoco(s, null)).toBeNull();
  });

  // Lote E5 · validación (H5): un preferido fuera de rango no debe romper el foco.
  it('con ejercicioPreferido=-1 fuera de rango se comporta como null: primer pendiente', () => {
    const s = sesion([ejercicio(0, 2, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, -1)).toEqual(posicionEnFoco(s, null));
    expect(posicionEnFoco(s, -1)).toEqual({ ejercicioIndex: 1, serieIndex: 0 });
  });

  it('con ejercicioPreferido=99 fuera de rango se comporta como null: primer pendiente', () => {
    const s = sesion([ejercicio(0, 2, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(posicionEnFoco(s, 99)).toEqual(posicionEnFoco(s, null));
    expect(posicionEnFoco(s, 99)).toEqual({ ejercicioIndex: 1, serieIndex: 0 });
  });

  it('S4: con ejercicioPreferido=99 fuera de rango en sesión de 2 ejercicios empieza en el primer pendiente', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2)]);
    expect(posicionEnFoco(s, 99)).toEqual({ ejercicioIndex: 0, serieIndex: 0 });

    const parcial = sesion([ejercicio(0, 2, 2), ejercicio(1, 2)]);
    expect(posicionEnFoco(parcial, 99)).toEqual({ ejercicioIndex: 1, serieIndex: 0 });
  });
});

describe('modo-foco · progresoFoco y textos (C1)', () => {
  it('cuenta ejercicio, serie y series restantes con el ejemplo del contrato', () => {
    const s = sesion([
      ejercicio(0, 2, 2),
      ejercicio(1, 4, 2),
      ejercicio(2, 2),
      ejercicio(3, 2),
      ejercicio(4, 2),
    ]);

    expect(progresoFoco(s, { ejercicioIndex: 1, serieIndex: 2 })).toEqual({
      ejercicioNumero: 2,
      totalEjercicios: 5,
      serieNumero: 3,
      totalSeries: 4,
      seriesRestantes: 2,
    });
  });

  it('con la primera serie de un ejercicio intacto cuenta todas sus series como restantes', () => {
    const s = sesion([ejercicio(0, 3), ejercicio(1, 3)]);

    expect(progresoFoco(s, { ejercicioIndex: 0, serieIndex: 0 })).toEqual({
      ejercicioNumero: 1,
      totalEjercicios: 2,
      serieNumero: 1,
      totalSeries: 3,
      seriesRestantes: 3,
    });
  });

  it('textoProgresoFoco formatea "Ejercicio X de N · Serie Y de M"', () => {
    expect(
      textoProgresoFoco({
        ejercicioNumero: 2,
        totalEjercicios: 5,
        serieNumero: 3,
        totalSeries: 4,
        seriesRestantes: 2,
      })
    ).toBe('Ejercicio 2 de 5 · Serie 3 de 4');
  });

  it('textoSeriesRestantes singular para 1 y plural para el resto', () => {
    expect(textoSeriesRestantes(1)).toBe('Queda 1 serie de este ejercicio');
    expect(textoSeriesRestantes(2)).toBe('Quedan 2 series de este ejercicio');
    expect(textoSeriesRestantes(3)).toBe('Quedan 3 series de este ejercicio');
  });
});

describe('modo-foco · siguienteEjercicioPendiente (C1)', () => {
  it('devuelve el siguiente ejercicio con series pendientes', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(siguienteEjercicioPendiente(s, { ejercicioIndex: 0, serieIndex: 0 })).toBe(1);
  });

  it('desde el último ejercicio vuelve al principio', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2)]);

    expect(siguienteEjercicioPendiente(s, { ejercicioIndex: 2, serieIndex: 0 })).toBe(0);
  });

  it('salta los ejercicios completos al buscar hacia delante y al envolver', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2), ejercicio(2, 2, 2)]);

    expect(siguienteEjercicioPendiente(s, { ejercicioIndex: 1, serieIndex: 0 })).toBe(0);
  });

  it('si solo el ejercicio actual tiene series pendientes devuelve null', () => {
    const s = sesion([ejercicio(0, 2), ejercicio(1, 2, 2)]);

    expect(siguienteEjercicioPendiente(s, { ejercicioIndex: 0, serieIndex: 0 })).toBeNull();
  });
});
