// @vitest-environment jsdom
/**
 * UX-26 (Fase Roja / TDD) · Contratos para ListaCompletaEjercicios:
 * - ENT-03: Botón de finalizar entrenamiento al final de la lista completa para no tener que volver arriba tras la última serie
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { EstadoSesion } from '@guachafit/shared';
import { ListaCompletaEjercicios } from './ListaCompletaEjercicios';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SESION_MOCK: SesionEntrenamientoDetalleDTO = {
  id: 'sesion-1',
  alumnoId: 'alumno-1',
  bloqueId: 'bloque-1',
  fechaProgramada: '2026-11-02',
  estado: EstadoSesion.EN_PROGRESO,
  fechaInicioUtc: '2026-11-02T10:00:00Z',
  fechaFinUtc: null,
  duracionMinutos: 30,
  notasAlumno: null,
  timezoneCliente: 'America/Caracas',
  porcentajeCumplimiento: '100%',
  createdAtUtc: '2026-11-02T10:00:00Z',
  updatedAtUtc: '2026-11-02T10:00:00Z',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: 'sesion-1',
      orden: 1,
      ejercicioId: 'cat-1',
      ejercicio: {
        id: 'cat-1',
        nombre: 'Press de Banca',
        grupoMuscular: 'PECHO',
        patronMovimiento: 'EMPUJE_HORIZONTAL',
        esBilateral: true,
      } as any,
      series: [
        {
          id: 's-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: 10,
          pesoKg: '70',
          pesoPrescritoKg: '70',
          rpe: null,
          descansoSegundos: 90,
          completada: true,
        },
      ],
    },
  ],
};

describe('ListaCompletaEjercicios · UX-26', () => {
  it('ENT-03: en progreso con onFinalizar renderiza el CTA al final de la lista', () => {
    const onFinalizar = vi.fn();
    render(
      <ListaCompletaEjercicios
        sesion={SESION_MOCK}
        enProgreso={true}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={{}}
        mostrarVolverAlEnfoque={true}
        onVolverAlEnfoque={vi.fn()}
        onHacerAhora={vi.fn()}
        onVerTecnica={vi.fn()}
        renderSerie={() => <div key="serie">Serie 1</div>}
        onFinalizar={onFinalizar}
      />
    );

    const botonFinalizarAbajo = screen.getByRole('button', {
      name: 'Finalizar entrenamiento al final de la lista',
    });
    expect(botonFinalizarAbajo).not.toBeNull();
    fireEvent.click(botonFinalizarAbajo);
    expect(onFinalizar).toHaveBeenCalledTimes(1);
  });

  it('ENT-03: cuando no está en progreso no renderiza el botón de finalizar al final', () => {
    render(
      <ListaCompletaEjercicios
        sesion={{ ...SESION_MOCK, estado: EstadoSesion.COMPLETADA }}
        enProgreso={false}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={{}}
        mostrarVolverAlEnfoque={false}
        onVolverAlEnfoque={vi.fn()}
        onHacerAhora={vi.fn()}
        onVerTecnica={vi.fn()}
        renderSerie={() => <div key="serie">Serie 1</div>}
        onFinalizar={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', {
        name: 'Finalizar entrenamiento al final de la lista',
      })
    ).toBeNull();
  });
});
