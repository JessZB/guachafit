// @vitest-environment jsdom
/**
 * 01 · Ficha del alumno (L1.8) · tarjeta del último entrenamiento.
 *
 * Contrato: el `<h3>` es "Último entrenamiento" y la fecha vive en una línea secundaria,
 * fuera del título (ya no entre paréntesis). Se conservan el chip de % cumplido y el botón
 * "Ver historial completo".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import type { EtiquetaVisual } from '../../../lib/adherencia';
import { formatFechaCalendario } from '../../../lib/date-format';
import { TarjetaUltimoEntrenamiento } from './TarjetaUltimoEntrenamiento';

afterEach(() => {
  cleanup();
});

const SESION: SesionEntrenamientoDetalleDTO = {
  id: 's1111111-1111-4111-8111-111111111111',
  alumnoId: 'a1111111-1111-4111-8111-111111111111',
  bloqueId: 'd1',
  fechaProgramada: '2026-10-20',
  fechaInicioUtc: '2026-10-20T14:00:00.000Z',
  fechaFinUtc: '2026-10-20T15:00:00.000Z',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.COMPLETADA,
  porcentajeCumplimiento: '85.00',
  volumenTotalKg: '1200.00',
  notasAlumno: null,
  ejercicios: [],
  duracionMinutos: 60,
  createdAtUtc: '2026-10-20T15:00:00.000Z',
  updatedAtUtc: '2026-10-20T15:00:00.000Z',
};

const ETIQUETA: EtiquetaVisual = { texto: 'Completada', tono: 'success' };

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('TarjetaUltimoEntrenamiento · L1.8 título y fecha', () => {
  it('titula "Último entrenamiento" y deja la fecha fuera del h3', () => {
    render(
      <TarjetaUltimoEntrenamiento
        sesion={SESION}
        etiqueta={ETIQUETA}
        onVerHistorial={vi.fn()}
      />
    );

    const titulo = screen.getByRole('heading', { level: 3, name: 'Último entrenamiento' });
    const fecha = formatFechaCalendario(SESION.fechaProgramada);
    expect(fecha).toBeTruthy();

    expect(titulo.textContent ?? '').not.toContain(fecha as string);
    expect(titulo.textContent ?? '').not.toContain('(');
    expect(screen.queryByRole('heading', { name: /Último Entrenamiento Realizado/i })).toBeNull();

    const aparicionesFecha = screen.getAllByText(new RegExp(escaparRegex(fecha as string)));
    expect(aparicionesFecha.some((nodo) => !titulo.contains(nodo))).toBe(true);
  });
});

describe('TarjetaUltimoEntrenamiento · comportamiento existente', () => {
  it('conserva el % cumplido y el acceso al historial completo', () => {
    const onVerHistorial = vi.fn();
    render(
      <TarjetaUltimoEntrenamiento
        sesion={SESION}
        etiqueta={ETIQUETA}
        onVerHistorial={onVerHistorial}
      />
    );

    expect(screen.getByText('85.00% cumplido')).toBeTruthy();
    const historial = screen.getByRole('button', { name: 'Ver historial completo' });
    fireEvent.click(historial);
    expect(onVerHistorial).toHaveBeenCalledTimes(1);
  });
});
