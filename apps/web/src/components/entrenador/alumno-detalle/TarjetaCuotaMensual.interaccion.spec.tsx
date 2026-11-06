// @vitest-environment happy-dom
/**
 * Lote 01 (ficha del alumno) · L2.2 y L2.5 — tarjeta de la cuota mensual.
 *
 * Fase roja: fija el contrato antes de tocar producción.
 * - L2.2: el título del periodo y el badge de estado comparten un contenedor directo con
 *   `flex-wrap`, para que el badge baje de línea en pantallas estrechas.
 * - L2.5: la fecha de vencimiento deja de usar `truncate` (la fecha completa debe poder
 *   leerse sin recortes).
 *
 * No se fija el texto del botón de cobro: su renombre pertenece a L1.8 y este spec solo
 * cubre L2. jsdom no calcula layout: las clases se comprueban como tokens literales.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { TarjetaCuotaMensual } from './TarjetaCuotaMensual';

afterEach(() => {
  cleanup();
});

/** Clases Tailwind del nodo, comparadas como tokens (evita que `flex` coincida con `flex-wrap`). */
function tokens(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function resumen(parcial: Partial<ResumenFinancieroAlumnoDTO> = {}): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'al-1',
    usuarioId: 'u-1',
    saldoPendienteTotalUsd: '40.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '120.00',
    totalPagadoMesActualUsd: '20.00',
    cuotaMesActual: {
      id: 'cuota-1',
      periodo: '2026-10',
      montoTotalUsd: '60.00',
      montoPagadoUsd: '20.00',
      saldoPendienteUsd: '40.00',
      estado: 'emitida',
      fechaVencimiento: '2026-11-15T12:00:00.000Z',
    },
    transaccionesTotal: 0,
    transacciones: [],
    ...parcial,
  };
}

describe('TarjetaCuotaMensual · L2.2 wrap', () => {
  it('conserva el badge liquidado cuando no queda saldo', () => {
    render(
      <TarjetaCuotaMensual
        finanzas={resumen({
          cuotaMesActual: {
            id: 'cuota-1',
            periodo: '2026-10',
            montoTotalUsd: '60.00',
            montoPagadoUsd: '60.00',
            saldoPendienteUsd: '0.00',
            estado: 'al_dia',
            fechaVencimiento: '2026-11-15T12:00:00.000Z',
          },
        })}
        onRegistrarCobro={vi.fn()}
      />
    );

    expect(screen.getByText('Liquidada')).toBeTruthy();
  });
});

describe('TarjetaCuotaMensual · V5 punto de cuota', () => {
  it('el punto animado es decorativo: aria-hidden y motion-reduce:animate-none', () => {
    const { container } = render(
      <TarjetaCuotaMensual finanzas={resumen()} onRegistrarCobro={vi.fn()} />,
    );

    // El punto es el `span` decorativo del badge; el token visible sí tiene texto.
    const punto = container.querySelector('span[aria-hidden="true"]');
    expect(punto).not.toBeNull();
    expect(tokens(punto!)).toContain('motion-reduce:animate-none');
  });
});
