// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoSesion,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { FilaSerie } from './FilaSerie';
import { useEdicionSerie } from './use-edicion-serie';
import { formatearPesoDesdeKg, type UnidadPeso } from '../../../lib/weight-unit';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SERIE_BASE: SerieRegistroDetalleDTO = {
  id: 's-1',
  ejercicioSesionId: 'es-1',
  numeroSerie: 1,
  repsObjetivo: 10,
  repsLogradas: null,
  pesoKg: null,
  pesoPrescritoKg: '60.00',
  rpe: null,
  descansoSegundos: 90,
  completada: false,
};

function FilaSerieHarness({
  serieInicial,
  unidadPeso = 'kg',
  onGuardarCambio,
}: {
  serieInicial: SerieRegistroDetalleDTO;
  unidadPeso?: UnidadPeso;
  onGuardarCambio?: (campo: string, valor: string) => void;
}) {
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO>({
    id: 'sesion-test',
    alumnoId: 'alumno-1',
    bloqueId: 'b-1',
    fechaProgramada: '2026-11-04',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    ejercicios: [
      {
        id: 'es-1',
        sesionId: 'sesion-test',
        ejercicioId: 'ej-1',
        orden: 1,
        ejercicio: {
          id: 'ej-1',
          nombre: 'Sentadilla',
          grupoMuscular: 'Piernas',
          activo: true,
          createdAtUtc: '2026-10-01T00:00:00.000Z',
        },
        series: [serieInicial],
      },
    ],
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  });

  const edicion = useEdicionSerie({
    sesion,
    setSesion,
    user: null,
    isDemoMode: true,
  });

  return (
    <FilaSerie
      sesion={sesion}
      ejercicioIndex={0}
      serieIndex={0}
      unidadPeso={unidadPeso}
      inputDrafts={edicion.inputDrafts}
      inputErrors={edicion.inputErrors}
      seriesEnCorreccion={new Set()}
      soloLectura={false}
      onCorregir={vi.fn()}
      onCambiar={(ejIdx, sIdx, campo, val) => {
        onGuardarCambio?.(campo, val);
        edicion.handleUpdateSerieValue(ejIdx, sIdx, campo, val);
      }}
      onPaso={edicion.handleStepSerieValue}
      onSalirPeso={edicion.handleBlurPeso}
      onSalirReps={edicion.handleBlurReps}
      onSalirRpe={edicion.handleBlurRpe}
      onMarcar={vi.fn()}
      onIniciar={vi.fn()}
    />
  );
}

function campoPeso(): HTMLInputElement {
  return screen.getByLabelText(/^Peso real/) as HTMLInputElement;
}

describe('FilaSerie · precarga del peso con el plan (interacción)', () => {
  it('serie pendiente pesoKg: null, pesoPrescritoKg: "60.00": muestra el plan en kg y tiene data-origen-peso="plan"', () => {
    render(<FilaSerieHarness serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: '60.00' }} />);
    const input = campoPeso();
    expect(input.value).toBe(formatearPesoDesdeKg('60.00', 'kg'));
    expect(input.getAttribute('data-origen-peso')).toBe('plan');
  });

  it('con unidad lb muestra el equivalente del plan convertido', () => {
    render(
      <FilaSerieHarness
        serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: '60.00' }}
        unidadPeso="lb"
      />
    );
    const input = campoPeso();
    expect(input.value).toBe(formatearPesoDesdeKg('60.00', 'lb'));
    expect(input.getAttribute('data-origen-peso')).toBe('plan');
  });

  it('tras escribir "62,5" el valor es "62,5" y no hay data-origen-peso', () => {
    render(<FilaSerieHarness serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: '60.00' }} />);
    const input = campoPeso();
    fireEvent.change(input, { target: { value: '62,5' } });
    expect(input.value).toBe('62,5');
    expect(input.getAttribute('data-origen-peso')).toBeNull();
  });

  it('tras vaciar el campo queda "", sin atributo, y la prop de guardado recibe "" (no null)', () => {
    const onGuardarCambio = vi.fn();
    render(
      <FilaSerieHarness
        serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: '60.00' }}
        onGuardarCambio={onGuardarCambio}
      />
    );
    const input = campoPeso();
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(input.getAttribute('data-origen-peso')).toBeNull();
    expect(onGuardarCambio).toHaveBeenCalledWith('pesoKg', '');
  });

  it('serie con pesoKg: "55.00" y plan distinto ("60.00") muestra "55" y sin atributo', () => {
    render(<FilaSerieHarness serieInicial={{ ...SERIE_BASE, pesoKg: '55.00', pesoPrescritoKg: '60.00' }} />);
    const input = campoPeso();
    expect(input.value).toBe('55');
    expect(input.getAttribute('data-origen-peso')).toBeNull();
  });

  it('serie sin plan (pesoPrescritoKg: null) muestra vacío y sin atributo', () => {
    render(<FilaSerieHarness serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: null }} />);
    const input = campoPeso();
    expect(input.value).toBe('');
    expect(input.getAttribute('data-origen-peso')).toBeNull();
  });

  it('"+" desde el valor del plan (60 kg) deja 62,5 (paso de 2,5 kg)', () => {
    render(<FilaSerieHarness serieInicial={{ ...SERIE_BASE, pesoKg: null, pesoPrescritoKg: '60.00' }} />);
    const input = campoPeso();
    const botonSumar = screen.getByRole('button', { name: /Sumar.*kg/ });
    fireEvent.click(botonSumar);
    expect(['62,5', '62.5']).toContain(input.value);
  });
});
