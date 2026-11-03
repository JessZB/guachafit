// @vitest-environment jsdom
/**
 * Lote 01 (ficha del alumno) · L2.2 y L2.3 — fila de transacción del historial financiero.
 *
 * Fase roja: fija el contrato de `FilaTransaccion` antes de tocar producción.
 * - L2.2: método, referencia y estado comparten un contenedor directo con `flex-wrap`,
 *   para que el badge de estado baje de línea en pantallas estrechas.
 * - L2.3: el estado se muestra con el badge compartido (`inline-flex` + `rounded-full` +
 *   `uppercase`, rasgos de `ui/BadgeEstado`) y el monto NO se presenta como ingreso cuando
 *   la transacción fue rechazada o revertida (sin prefijo "+" ni `text-success`); una
 *   aprobada conserva ambos.
 *
 * jsdom no calcula layout: las clases se comprueban como tokens literales del `className`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EstadoConciliacion, type ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { FilaTransaccion } from './FilaTransaccion';

type TransaccionFila = ResumenFinancieroAlumnoDTO['transacciones'][number];

afterEach(() => {
  cleanup();
});

/** Clases Tailwind del nodo, comparadas como tokens (evita que `flex` coincida con `flex-wrap`). */
function tokens(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

function transaccion(parcial: Partial<TransaccionFila> = {}): TransaccionFila {
  return {
    id: 'tx-1',
    cuotaId: 'cuota-1',
    montoUsd: '40.00',
    montoBs: '4000.00',
    metodoPago: 'pago_movil',
    referencia: 'TX-1',
    estado: EstadoConciliacion.APROBADO,
    motivoReversion: null,
    createdAtUtc: '2026-10-01T14:00:00.000Z',
    ...parcial,
  };
}

function renderFila(parcial: Partial<TransaccionFila> = {}) {
  return render(
    <FilaTransaccion tx={transaccion(parcial)} demo onSolicitarReversion={vi.fn()} />
  );
}

describe('FilaTransaccion · L2.2 wrap', () => {
  it('método, referencia y estado comparten un contenedor directo con flex-wrap', () => {
    renderFila({ estado: EstadoConciliacion.RECHAZADO });

    const metodo = screen.getByText('Pago móvil');
    const contenedor = metodo.parentElement;

    expect(contenedor).not.toBeNull();
    expect(tokens(contenedor!)).toContain('flex-wrap');
    expect(contenedor!.textContent).toContain('Ref: TX-1');
    expect(contenedor!.textContent).toContain('Rechazado');
  });
});

describe('FilaTransaccion · L2.3 estado y monto', () => {
  it('muestra el estado con el badge compartido', () => {
    renderFila({ estado: EstadoConciliacion.RECHAZADO });

    const estado = screen.getByText('Rechazado');
    const clases = tokens(estado);

    // Rasgos distintivos de `ui/BadgeEstado` (hoy el estado es un span plano sin badge).
    expect(clases).toContain('inline-flex');
    expect(clases).toContain('rounded-full');
    expect(clases).toContain('uppercase');
  });

  it.each([EstadoConciliacion.RECHAZADO, EstadoConciliacion.REVERTIDO])(
    'el monto de una transacción %s no se presenta como ingreso',
    (estado) => {
      renderFila({ estado, montoUsd: '30.00' });

      const monto = screen.getByText(/\$\s*30\.00/);

      expect(monto.textContent).not.toContain('+');
      expect(tokens(monto)).not.toContain('text-success');
    }
  );

  it('el monto aprobado conserva el prefijo + y el color de ingreso', () => {
    renderFila({ estado: EstadoConciliacion.APROBADO, montoUsd: '40.00' });

    const monto = screen.getByText(/\$\s*40\.00/);

    expect(monto.textContent).toContain('+');
    expect(tokens(monto)).toContain('text-success');
  });

  it('V2 · el monto pendiente conserva el prefijo + y text-success (desviación F1)', () => {
    renderFila({ estado: EstadoConciliacion.PENDIENTE, montoUsd: '25.00' });

    const monto = screen.getByText(/\$\s*25\.00/);

    expect(monto.textContent).toContain('+');
    expect(tokens(monto)).toContain('text-success');
  });

  it('conserva la etiqueta de estado de cada conciliación', () => {
    const casos = [
      [EstadoConciliacion.APROBADO, 'Verificado'],
      [EstadoConciliacion.PENDIENTE, 'En revisión'],
      [EstadoConciliacion.RECHAZADO, 'Rechazado'],
      [EstadoConciliacion.REVERTIDO, 'Revertido'],
    ] as const;

    for (const [estado, texto] of casos) {
      const { unmount } = renderFila({ estado });
      expect(screen.getByText(texto)).toBeTruthy();
      unmount();
    }
  });
});
