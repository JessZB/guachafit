// @vitest-environment happy-dom
/**
 * Lote 01 (ficha del alumno) · L2.2 — cabecera del historial de transacciones.
 *
 * Fase roja: fija el contrato antes de tocar producción. El título del historial y el
 * contador de operaciones comparten un contenedor directo con `flex-wrap`, para que el
 * contador baje de línea en pantallas estrechas.
 *
 * Se conservan también los estados honestos ya existentes (`role="alert"` en el error,
 * `role="status"` en la confirmación de reversión y el vacío sin filas).
 *
 * jsdom no calcula layout: las clases se comprueban como tokens literales.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { HistorialTransaccionesAlumno } from './HistorialTransaccionesAlumno';

afterEach(() => {
  cleanup();
});

function resumen(parcial: Partial<ResumenFinancieroAlumnoDTO> = {}): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'al-1',
    usuarioId: 'u-1',
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '120.00',
    totalPagadoMesActualUsd: '20.00',
    cuotaMesActual: null,
    transaccionesTotal: 2,
    transacciones: [
      {
        id: 'tx-1',
        cuotaId: 'cuota-1',
        montoUsd: '20.00',
        metodoPago: 'pago_movil',
        referencia: 'TX-1',
        estado: 'aprobado',
        motivoReversion: null,
        createdAtUtc: '2026-10-01T14:00:00.000Z',
      },
      {
        id: 'tx-2',
        cuotaId: 'cuota-1',
        montoUsd: '20.00',
        metodoPago: 'efectivo_usd',
        referencia: 'TX-2',
        estado: 'pendiente',
        motivoReversion: null,
        createdAtUtc: '2026-10-02T14:00:00.000Z',
      },
    ],
    ...parcial,
  };
}

function props(parcial: Partial<Parameters<typeof HistorialTransaccionesAlumno>[0]> = {}) {
  return {
    finanzas: resumen(),
    errorCarga: null,
    mensajeReversion: null,
    demo: true,
    pagina: 1,
    tamano: 10,
    cargando: false,
    onCambiarPagina: vi.fn(),
    onCambiarTamano: vi.fn(),
    onSolicitarReversion: vi.fn(),
    ...parcial,
  };
}

describe('HistorialTransaccionesAlumno · estados honestos', () => {
  it('conserva el error de carga como alert', () => {
    render(
      <HistorialTransaccionesAlumno
        {...props({ errorCarga: 'No se pudo cargar el historial financiero.' })}
      />
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'No se pudo cargar el historial financiero.'
    );
  });

  it('conserva la confirmación de reversión como status', () => {
    render(
      <HistorialTransaccionesAlumno {...props({ mensajeReversion: 'Pago revertido.' })} />
    );

    const mensaje = screen.getByText('Pago revertido.');
    expect(mensaje.getAttribute('role')).toBe('status');
  });

  it('conserva el vacío cuando no hay historial cargado', () => {
    render(<HistorialTransaccionesAlumno {...props({ finanzas: null })} />);

    expect(
      screen.getByText('No se han registrado pagos o abonos para este alumno.')
    ).toBeTruthy();
  });
});
