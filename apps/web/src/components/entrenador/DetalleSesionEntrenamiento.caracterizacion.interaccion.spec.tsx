// @vitest-environment jsdom
/**
 * DetalleSesionEntrenamiento · caracterización de interacción (Ola 3, prompt 87).
 *
 * Fija el comportamiento ACTUAL en verde sobre el código sin tocar, antes de la
 * extracción a componentes atómicos. El componente es de props puras (sin fetch,
 * sin TanStack Query): se monta directo, sin `QueryClientProvider` (R9).
 * Consultas por rol, label, title o texto, con `fireEvent`
 * (`@testing-library/user-event` no instalado).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { EstadoSesion } from '@guachafit/shared';
import { DetalleSesionEntrenamiento } from './DetalleSesionEntrenamiento';
import { sesionesDemoAlumno } from '../../lib/demo-sesiones';

afterEach(() => {
  cleanup();
});

function serieBase(
  numero: number,
  parcial: Partial<SerieRegistroDetalleDTO> = {},
): SerieRegistroDetalleDTO {
  return {
    id: `serie-${numero}`,
    ejercicioSesionId: 'ej-1',
    numeroSerie: numero,
    repsObjetivo: 10,
    repsLogradas: 10,
    pesoKg: '20.00',
    pesoPrescritoKg: '20.00',
    rpe: '8.0',
    descansoSegundos: 90,
    timestampInicioUtc: '2026-10-05T10:01:00.000Z',
    completada: true,
    timestampCompletadaUtc: '2026-10-05T10:02:00.000Z',
    ...parcial,
  };
}

function ejercicioBase(
  parcial: Partial<EjercicioSesionDetalleDTO> = {},
): EjercicioSesionDetalleDTO {
  return {
    id: 'ej-1',
    sesionId: 'ses-1',
    ejercicioId: '11111111-1111-4111-8111-111111111c01',
    orden: 1,
    series: [serieBase(1)],
    ...parcial,
  };
}

function sesionBase(
  parcial: Partial<SesionEntrenamientoDetalleDTO> = {},
): SesionEntrenamientoDetalleDTO {
  return {
    id: 'ses-1',
    alumnoId: 'al-001',
    bloqueId: 'd1',
    fechaProgramada: '2026-10-05',
    fechaInicioUtc: '2026-10-05T10:00:00.000Z',
    fechaFinUtc: '2026-10-05T11:00:00.000Z',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    volumenTotalKg: '1200.00',
    notasAlumno: null,
    ejercicios: [ejercicioBase()],
    duracionMinutos: 60,
    createdAtUtc: '2026-10-05T11:00:00.000Z',
    updatedAtUtc: '2026-10-05T11:00:00.000Z',
    ...parcial,
  };
}

describe('DetalleSesionEntrenamiento · caracterización (cabecera y acordeón)', () => {
  it('colapsado solo rinde la cabecera: sin series, deltas, notas ni vacío', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    render(
      <DetalleSesionEntrenamiento
        sesion={sesion}
        mostrarSeries={false}
        chipRecuperada="Recuperada en Lunes (Día de descanso)"
      />,
    );

    expect(screen.getByText('Recuperada en Lunes (Día de descanso)')).toBeTruthy();
    expect(screen.getByText('Completada')).toBeTruthy();
    expect(screen.queryByText(/Tiempo entre series/)).toBeNull();
    expect(screen.queryByText('Nota del coach')).toBeNull();
    expect(screen.queryByText('Sin series registradas')).toBeNull();
    expect(screen.queryByText('Sin series registradas en esta sesión.')).toBeNull();
  });

  it('expandido incluye descanso real, ejecución, timer, plan, notas, grupo y feedback', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    render(
      <DetalleSesionEntrenamiento sesion={sesion} mostrarSeries mostrarGrupoMuscular />,
    );

    // WU17: con marcas de inicio, la medición real reemplaza al Δ derivado.
    expect(screen.getAllByText(/Descanso real:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Duración de la serie:/).length).toBeGreaterThan(0);
    // WU18: copy humano, sin abreviaturas ni segundos en crudo.
    expect(screen.getAllByText('Temporizador: 1 min 30 s (en meta)').length).toBeGreaterThan(0);
    expect(screen.getByText('Temporizador: 2 min (+30 s)')).toBeTruthy();
    expect(screen.getAllByText('Descanso planificado: 1 min 30 s').length).toBeGreaterThan(0);
    expect(screen.getByText('Plan: 12 reps · 28 kg')).toBeTruthy();
    expect(screen.queryByText('Timer:')).toBeNull();
    expect(screen.queryByText('Presc.')).toBeNull();
    expect(screen.getAllByText('Nota del coach').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pecho').length).toBeGreaterThan(0);
    expect(screen.getByText('Feedback del alumno')).toBeTruthy();
  });

  it('sin marcas de inicio cae al tiempo aproximado como respaldo', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const sinInicio: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      ejercicios: sesion.ejercicios.map((ejercicio) => ({
        ...ejercicio,
        series: ejercicio.series.map((serie) => ({ ...serie, timestampInicioUtc: null })),
      })),
    };
    render(<DetalleSesionEntrenamiento sesion={sinInicio} mostrarSeries />);

    expect(screen.getAllByText(/Tiempo entre series \(aprox.\):/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tiempo entre ejercicios \(aprox.\):/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Descanso real:/)).toBeNull();
    expect(screen.queryByText(/Duración de la serie:/)).toBeNull();
  });

  it('el slot de cabecera rinde el nodo externo, propaga el clic y cablea el id de series', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    const onToggle = vi.fn();
    const { container } = render(
      <DetalleSesionEntrenamiento
        sesion={sesion}
        mostrarSeries
        idSeries="sesion-series-demo"
        accionesCabecera={
          <button type="button" onClick={onToggle}>
            Ocultar Series
          </button>
        }
      />,
    );

    const boton = screen.getByRole('button', { name: 'Ocultar Series' });
    fireEvent.click(boton);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const bloque = container.querySelector('#sesion-series-demo');
    expect(bloque).toBeTruthy();
    expect(within(bloque as HTMLElement).getAllByText(/Descanso real:/).length).toBeGreaterThan(0);
  });

  it('una sesión de descanso sin series muestra el vacío honesto al expandirse', () => {
    const sesionDescanso = sesionesDemoAlumno('al-002').find(
      (sesion) => sesion.esDiaDescansoOriginal,
    );
    expect(sesionDescanso).toBeDefined();

    render(<DetalleSesionEntrenamiento sesion={sesionDescanso!} mostrarSeries />);

    expect(screen.getByText('Sin series registradas en esta sesión.')).toBeTruthy();
  });

  it('rinde el título del bloque cuando se pasa por prop', () => {
    render(<DetalleSesionEntrenamiento sesion={sesionBase()} titulo="Día 1 (Lunes): Empuje" />);

    expect(screen.getByText('Día 1 (Lunes): Empuje')).toBeTruthy();
  });
});

describe('DetalleSesionEntrenamiento · caracterización (chips de cabecera)', () => {
  it('sin chipRecuperada y en día de descanso original conserva el texto plano', () => {
    render(<DetalleSesionEntrenamiento sesion={sesionBase({ esDiaDescansoOriginal: true })} />);

    expect(screen.getByText(/Recuperada en día de descanso/)).toBeTruthy();
  });

  it('con chipRecuperada nula no rinde ningún chip de recuperación', () => {
    render(
      <DetalleSesionEntrenamiento
        sesion={sesionBase({ esDiaDescansoOriginal: true })}
        chipRecuperada={null}
      />,
    );

    expect(screen.queryByText(/Recuperada/)).toBeNull();
  });

  it('con volumen cero y sin duración declara los honestos y oculta sus chips', () => {
    render(
      <DetalleSesionEntrenamiento
        sesion={sesionBase({ volumenTotalKg: '0.00', duracionMinutos: null })}
      />,
    );

    expect(screen.getByText('Sin duración registrada')).toBeTruthy();
    // pesoLegible('0.00') sería 'Corporal', pero el chip exige volumen > 0.
    expect(screen.queryByText('Corporal')).toBeNull();
  });

  it('con porcentaje no numérico oculta el chip de cumplimiento', () => {
    render(
      <DetalleSesionEntrenamiento sesion={sesionBase({ porcentajeCumplimiento: 'no-numérico' })} />,
    );

    expect(screen.queryByText(/cumplido/)).toBeNull();
    expect(screen.getByText('Completada')).toBeTruthy();
  });
});

describe('DetalleSesionEntrenamiento · caracterización (tarjeta de serie)', () => {
  it('la serie no completada declara reps, peso y estado honestos con su plan', () => {
    const sesion = sesionBase({
      ejercicios: [
        ejercicioBase({
          descansoPrescritoSegundos: 90,
          series: [
            serieBase(1, {
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              descansoSegundos: null,
              timestampInicioUtc: null,
              timestampCompletadaUtc: null,
              completada: false,
            }),
          ],
        }),
      ],
    });
    render(<DetalleSesionEntrenamiento sesion={sesion} mostrarSeries />);

    expect(screen.getByText('No completada')).toBeTruthy();
    expect(screen.getByText('Sin reps')).toBeTruthy();
    expect(screen.getByText('Sin peso')).toBeTruthy();
    expect(screen.getByText('Plan: 10 reps · 20 kg')).toBeTruthy();
  });

  it('el peso corporal cero se declara como carga corporal', () => {
    const sesion = sesionBase({
      ejercicios: [ejercicioBase({ series: [serieBase(1, { pesoKg: '0' })] })],
    });
    render(<DetalleSesionEntrenamiento sesion={sesion} mostrarSeries />);

    expect(screen.getByText('Corporal')).toBeTruthy();
  });

  it('la desviación del temporizador declara exceso, meta y recorte con copy humano', () => {
    const sesion = sesionBase({
      ejercicios: [
        ejercicioBase({
          descansoPrescritoSegundos: 90,
          series: [
            serieBase(1, { descansoSegundos: 120 }),
            serieBase(2, { descansoSegundos: 90 }),
            serieBase(3, { descansoSegundos: 60 }),
          ],
        }),
      ],
    });
    render(<DetalleSesionEntrenamiento sesion={sesion} mostrarSeries />);

    expect(screen.getByText('Temporizador: 2 min (+30 s)')).toBeTruthy();
    expect(screen.getByText('Temporizador: 1 min 30 s (en meta)')).toBeTruthy();
    expect(screen.getByText('Temporizador: 1 min (-30 s)')).toBeTruthy();
  });

  it('el RPE real y los tooltips del temporizador conservan su copy', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    render(<DetalleSesionEntrenamiento sesion={sesion} mostrarSeries />);

    expect(screen.getAllByTitle('RPE real registrado por el alumno')[0]).toBeTruthy();
    expect(screen.getAllByText('@7.5').length).toBeGreaterThan(0);
    expect(
      screen.getAllByTitle(
        'Valor del temporizador de descanso configurado en pantalla para esta serie: es un objetivo, no una medición del descanso real.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('el grupo muscular solo se muestra cuando se pide (el monitor no lo usa)', () => {
    const [sesion] = sesionesDemoAlumno('al-001');
    render(<DetalleSesionEntrenamiento sesion={sesion} mostrarSeries />);

    expect(screen.queryByText('Pecho')).toBeNull();
    expect(screen.getAllByText('Nota del coach').length).toBeGreaterThan(0);
  });
});
