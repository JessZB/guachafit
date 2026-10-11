/**
 * Lote E4 (RF-001) · contrato C1: funciones puras de la vista previa antes de iniciar.
 *
 * Fase roja: el módulo `./sesion-vista` aún no existe; este spec define el contrato de
 * `textoPrescripcionCompacta`, `textoSerieCompletada` y `resumirSesionParaVistaPrevia`.
 * Los DTO de prueba usan los tipos de `@guachafit/shared` tal como llegan de la API.
 */
import { describe, expect, it } from 'vitest';
import {
  EstadoSesion,
  type EjercicioSesionDetalleDTO,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import {
  resumirSesionParaVistaPrevia,
  textoPrescripcionCompacta,
  textoSerieCompletada,
} from './sesion-vista';

function serie(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's-1',
    ejercicioSesionId: 'es-1',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: null,
    rpe: null,
    descansoSegundos: 90,
    completada: false,
    ...parcial,
  };
}

function ejercicio(
  series: SerieRegistroDetalleDTO[],
  parcial: Partial<EjercicioSesionDetalleDTO> = {}
): EjercicioSesionDetalleDTO {
  return {
    id: 'es-1',
    sesionId: 'sesion-1',
    ejercicioId: 'ej-1',
    orden: 1,
    ejercicio: {
      id: 'ej-1',
      nombre: 'Sentadilla',
      grupoMuscular: 'Piernas',
      activo: true,
      createdAtUtc: '2026-10-01T00:00:00.000Z',
    },
    series,
    ...parcial,
  };
}

function ejercicioConSeries(id: string, cantidadSeries: number): EjercicioSesionDetalleDTO {
  const orden = Number(id.replace(/\D/g, '')) || 1;
  return ejercicio(
    Array.from({ length: cantidadSeries }, (_, indice) =>
      serie({
        id: `${id}-s${indice + 1}`,
        ejercicioSesionId: id,
        numeroSerie: indice + 1,
      })
    ),
    { id, ejercicioId: `ej-${id}`, orden }
  );
}

function sesion(ejercicios: EjercicioSesionDetalleDTO[]): SesionEntrenamientoDetalleDTO {
  return {
    id: 'sesion-1',
    alumnoId: 'alumno-1',
    fechaProgramada: '2026-10-11',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.PLANIFICADA,
    porcentajeCumplimiento: '0.00',
    ejercicios,
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  };
}

describe('sesion-vista · textoPrescripcionCompacta', () => {
  it('4 series de 10 a 60 kg con esfuerzo 8.0 → "4 × 10 · 60 kg · Esfuerzo 8"', () => {
    const sentadilla = ejercicio(
      [1, 2, 3, 4].map((numero) =>
        serie({
          id: `s-${numero}`,
          numeroSerie: numero,
          repsObjetivo: 10,
          pesoPrescritoKg: '60.00',
        })
      )
    );

    expect(textoPrescripcionCompacta(sentadilla, 'kg', '8.0')).toBe('4 × 10 · 60 kg · Esfuerzo 8');
  });

  it('3 series de 8, 9 y 10, sin peso y sin esfuerzo → "3 × 8–10"', () => {
    const ejercicioVariable = ejercicio(
      [8, 9, 10].map((reps, indice) =>
        serie({ id: `s-${indice + 1}`, numeroSerie: indice + 1, repsObjetivo: reps })
      )
    );

    expect(textoPrescripcionCompacta(ejercicioVariable, 'kg')).toBe('3 × 8–10');
  });

  it('2 series a 50 y 60 kg con esfuerzo 8.5 → "2 × 10 · 50–60 kg · Esfuerzo 8.5"', () => {
    const ejercicioDosPesos = ejercicio([
      serie({ id: 's-1', numeroSerie: 1, repsObjetivo: 10, pesoPrescritoKg: '50.00' }),
      serie({ id: 's-2', numeroSerie: 2, repsObjetivo: 10, pesoPrescritoKg: '60.00' }),
    ]);

    expect(textoPrescripcionCompacta(ejercicioDosPesos, 'kg', '8.5')).toBe(
      '2 × 10 · 50–60 kg · Esfuerzo 8.5'
    );
  });

  it('1 serie de 10 a 60 kg en lb → contiene "lb" y nunca "kg"', () => {
    const unaSerie = ejercicio([serie({ numeroSerie: 1, repsObjetivo: 10, pesoPrescritoKg: '60.00' })]);

    const texto = textoPrescripcionCompacta(unaSerie, 'lb');

    expect(texto).toBe('1 × 10 · 132.3 lb');
    expect(texto).toContain('lb');
    expect(texto).not.toContain('kg');
  });
});

describe('sesion-vista · textoSerieCompletada', () => {
  it('serie 2 con peso, reps y esfuerzo → "Serie 2 · 60 kg × 10 · Esfuerzo 8"', () => {
    const completada = serie({ numeroSerie: 2, pesoKg: '60.00', repsLogradas: 10, rpe: '8' });

    expect(textoSerieCompletada(completada, 'kg')).toBe('Serie 2 · 60 kg × 10 · Esfuerzo 8');
  });

  it('sin peso (null), 12 repeticiones y sin esfuerzo → "Serie 1 · 12 repeticiones"', () => {
    const sinPeso = serie({ numeroSerie: 1, pesoKg: null, repsLogradas: 12, rpe: null });

    expect(textoSerieCompletada(sinPeso, 'kg')).toBe('Serie 1 · 12 repeticiones');
  });

  it('sin peso (cadena vacía) y 1 repetición → "Serie 1 · 1 repetición"', () => {
    const unaRepeticion = serie({ numeroSerie: 1, pesoKg: '', repsLogradas: 1 });

    expect(textoSerieCompletada(unaRepeticion, 'kg')).toBe('Serie 1 · 1 repetición');
  });

  it("con pesoKg '0.00' (lo que persiste la API tras un completado sin peso) y 10 reps → \"Serie 1 · 10 repeticiones\"", () => {
    const persistida = serie({ numeroSerie: 1, pesoKg: '0.00', repsLogradas: 10 });

    expect(textoSerieCompletada(persistida, 'kg')).toBe('Serie 1 · 10 repeticiones');
  });

  it('con repsLogradas null usa repsObjetivo (8)', () => {
    const sinReps = serie({ numeroSerie: 1, pesoKg: null, repsLogradas: null, repsObjetivo: 8 });

    expect(textoSerieCompletada(sinReps, 'kg')).toBe('Serie 1 · 8 repeticiones');
  });
});

describe('sesion-vista · resumirSesionParaVistaPrevia', () => {
  it('5 ejercicios con 18 series → "5 ejercicios · 18 series"', () => {
    const cincoEjercicios = ['es-1', 'es-2', 'es-3', 'es-4', 'es-5'].map((id, indice) =>
      ejercicioConSeries(id, [4, 4, 4, 3, 3][indice])
    );

    expect(resumirSesionParaVistaPrevia(sesion(cincoEjercicios))).toEqual({
      totalEjercicios: 5,
      totalSeries: 18,
      texto: '5 ejercicios · 18 series',
    });
  });

  it('1 ejercicio con 1 serie → "1 ejercicio · 1 serie"', () => {
    expect(resumirSesionParaVistaPrevia(sesion([ejercicio([serie()])]))).toEqual({
      totalEjercicios: 1,
      totalSeries: 1,
      texto: '1 ejercicio · 1 serie',
    });
  });
});
