// @vitest-environment jsdom
/**
 * 07 · Ficha del alumno (L7 · cabecera) · franja de datos clave (en verde).
 *
 * Contrato L7.8: `FranjaDatosClaveAlumno` muestra cuatro botones con los nombres
 * accesibles exactos, llama a `onIrATab` con el tab correspondiente y respeta §6
 * (táctil `min-h-11`, retícula `grid-cols-2 sm:grid-cols-4`). Los valores vienen
 * del helper L7.7 (mismos fixtures).
 *
 * Nota para la implementación: los nombres accesibles deben coincidir exactos
 * (p. ej. con `aria-label`); el orden de los botones es Saldo, Próxima cuota,
 * Último entreno, Peso.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoSesion } from '@guachafit/shared';
import type {
  ResumenFinancieroAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { TabFichaAlumno } from '../../../lib/alumno-detalle-tab';
import type { ControlAntroFila } from '../../../lib/alumno-detalle-controles';
import { formatFechaLocal } from '../../../lib/date-format';
import { FranjaDatosClaveAlumno } from './FranjaDatosClaveAlumno';

afterEach(() => {
  cleanup();
});

const AHORA = new Date('2026-10-28T12:00:00-04:00');

function resumenConDatos(): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'c1111111-1111-4111-8111-111111111111',
    usuarioId: 'u1111111-1111-4111-8111-111111111111',
    saldoPendienteTotalUsd: '125.50',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '40.00',
    totalPagadoMesActualUsd: '40.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-11',
      montoTotalUsd: '40.00',
      montoPagadoUsd: '0.00',
      saldoPendienteUsd: '40.00',
      estado: 'pendiente',
      fechaVencimiento: '2026-11-05T23:59:59.000Z',
    },
    transaccionesTotal: 1,
    transacciones: [],
  };
}

function sesionHoy(): SesionEntrenamientoDetalleDTO {
  return {
    id: 's1111111-1111-4111-8111-111111111111',
    alumnoId: 'c1111111-1111-4111-8111-111111111111',
    fechaProgramada: '2026-10-28',
    fechaInicioUtc: '2026-10-28T09:30:00-04:00',
    fechaFinUtc: '2026-10-28T10:45:00-04:00',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    ejercicios: [],
    createdAtUtc: '2026-10-28T09:30:00.000Z',
    updatedAtUtc: '2026-10-28T10:45:00.000Z',
  };
}

function controlesConPeso(): ControlAntroFila[] {
  return [
    {
      id: 'antro-1',
      fecha: '2026-10-20',
      pesoKg: '78.50',
      grasaPorcentaje: null,
      cinturaCm: null,
      brazoCm: null,
      pechoCm: null,
      musloCm: null,
    },
  ];
}

function renderFranja(variante: 'con-datos' | 'sin-datos' = 'con-datos') {
  const onIrATab = vi.fn();
  const conDatos = variante === 'con-datos';
  render(
    <FranjaDatosClaveAlumno
      finanzas={conDatos ? resumenConDatos() : null}
      ultimaSesion={conDatos ? sesionHoy() : null}
      controles={conDatos ? controlesConPeso() : []}
      ahora={AHORA}
      onIrATab={onIrATab}
    />,
  );
  return { onIrATab };
}

describe('FranjaDatosClaveAlumno · L7.8 botones con valores', () => {
  it('muestra los cuatro botones con los nombres accesibles exactos y los valores formateados', () => {
    renderFranja();

    expect(
      screen.getByRole('button', { name: 'Saldo pendiente: $125.50. Ver Pagos' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: `Próxima cuota: ${formatFechaLocal('2026-11-05T23:59:59.000Z')}. Ver Pagos`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Último entreno: Entrenó hoy. Ver Entrenos' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Peso: 78.50 kg. Ver Medidas' }),
    ).toBeTruthy();
  });

  it('sin datos muestra los valores de vacío con los mismos destinos', () => {
    renderFranja('sin-datos');

    expect(
      screen.getByRole('button', { name: 'Saldo pendiente: —. Ver Pagos' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Próxima cuota: —. Ver Pagos' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Último entreno: Sin entrenos registrados. Ver Entrenos',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Peso: —. Ver Medidas' })).toBeTruthy();
  });
});

describe('FranjaDatosClaveAlumno · L7.8 navegación por tab', () => {
  it('cada botón llama a onIrATab con finanzas, finanzas, entrenamiento y antropometria', () => {
    const { onIrATab } = renderFranja();
    const llamadas = (onIrATab as ReturnType<typeof vi.fn>).mock.calls.map(
      (llamada) => llamada[0] as TabFichaAlumno,
    );
    expect(llamadas).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /Saldo pendiente:/ }));
    fireEvent.click(screen.getByRole('button', { name: /Próxima cuota:/ }));
    fireEvent.click(screen.getByRole('button', { name: /Último entreno:/ }));
    fireEvent.click(screen.getByRole('button', { name: /Peso:/ }));

    expect(
      (onIrATab as ReturnType<typeof vi.fn>).mock.calls.map((llamada) => llamada[0]),
    ).toEqual(['finanzas', 'finanzas', 'entrenamiento', 'antropometria']);
  });
});

describe('FranjaDatosClaveAlumno · L7.8 retícula y táctil (§6)', () => {
  it('los botones son min-h-11 y el contenedor es grid-cols-2 sm:grid-cols-4', () => {
    const { container } = render(
      <FranjaDatosClaveAlumno
        finanzas={resumenConDatos()}
        ultimaSesion={sesionHoy()}
        controles={controlesConPeso()}
        ahora={AHORA}
        onIrATab={vi.fn()}
      />,
    );

    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(4);
    for (const boton of botones) {
      expect(boton.className).toContain('min-h-11');
    }
    const franja = botones[0].parentElement;
    expect(franja).not.toBeNull();
    expect(franja!.className).toContain('grid-cols-2');
    expect(franja!.className).toContain('sm:grid-cols-4');
  });
});
