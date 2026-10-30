// @vitest-environment jsdom
/**
 * Lote UX-07a · Contrato B: TarjetaTransaccionConciliacion (COB-09, COB-10).
 *
 * Requisitos:
 * - B1: Nombre largo con line-clamp-2, break-words, sin truncate; contenedor con flex-wrap y min-w-0.
 * - B2: Método con whitespace-nowrap y shrink-0 (BadgeEstado).
 * - B3: Referencia con break-all.
 * - B4: Acciones con nombre propio ("Aprobar pago de <alumno>", "Rechazar pago de <alumno>") y sin nombres antiguos.
 * - B5: Área táctil de 44px (min-h-11) y type="button" en Aprobar, Rechazar y Ver Comprobante.
 * - B6: Contenedor de Aprobar y Rechazar con flex-col sm:flex-row para apilado táctil móvil.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoConciliacion,
  MetodoPago,
  Moneda,
  type TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  TarjetaTransaccionConciliacion,
  type TarjetaTransaccionConciliacionProps,
} from './TarjetaTransaccionConciliacion';

const TX_LARGA: TransaccionPagoDetalleDTO = {
  id: 'tx-larga',
  cuotaId: 'cuota-1',
  clienteId: 'cli-1',
  entrenadorId: 'coach-1',
  registradoPor: 'cli-1',
  montoOriginal: '50.00',
  monedaOriginal: Moneda.USD,
  tasaCambioFijada: '1.0000',
  montoEquivalenteUsd: '50.00',
  excedenteUsd: '0.00',
  metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  referenciaBancaria: '0102000123456789012345',
  fechaOperacion: '2026-10-09',
  comprobanteStorageKey: 'comprobantes/tx-larga.png',
  comprobanteUrl: 'https://example.com/comprobante.png',
  estadoConciliacion: EstadoConciliacion.PENDIENTE,
  fechaReporteUtc: '2026-10-09T12:00:00.000Z',
  createdAtUtc: '2026-10-09T12:00:00.000Z',
  updatedAtUtc: '2026-10-09T12:00:00.000Z',
  clienteNombre: 'María Fernanda de los Ángeles Rodríguez Pérez',
  saldoPendienteCuotaUsd: '60.00',
};

afterEach(() => {
  cleanup();
});

function montarTarjeta(propsParciales: Partial<TarjetaTransaccionConciliacionProps> = {}) {
  const onVerComprobante = vi.fn();
  const onRechazar = vi.fn();
  const onAprobar = vi.fn();

  render(
    <TarjetaTransaccionConciliacion
      tx={TX_LARGA}
      onVerComprobante={onVerComprobante}
      onRechazar={onRechazar}
      onAprobar={onAprobar}
      {...propsParciales}
    />
  );

  return { onVerComprobante, onRechazar, onAprobar };
}

describe('TarjetaTransaccionConciliacion · Contrato B (COB-09, COB-10)', () => {
  it('B1 · nombre largo incluye line-clamp-2 y break-words (sin truncate), y su contenedor incluye flex-wrap y min-w-0', () => {
    montarTarjeta();

    const encabezadoNombre = screen.getByText('María Fernanda de los Ángeles Rodríguez Pérez');
    const clasesNombre = encabezadoNombre.getAttribute('class') ?? '';
    expect(clasesNombre).toContain('line-clamp-2');
    expect(clasesNombre).toContain('break-words');
    expect(clasesNombre).not.toContain('truncate');

    const contenedor = encabezadoNombre.parentElement;
    expect(contenedor).not.toBeNull();
    const clasesContenedor = contenedor?.getAttribute('class') ?? '';
    expect(clasesContenedor).toContain('flex-wrap');
    expect(clasesContenedor).toContain('min-w-0');
  });

  it('B2 · etiqueta del método está en un elemento con whitespace-nowrap y shrink-0', () => {
    montarTarjeta();

    const etiquetaMetodo = screen.getByText(/transferencia bancaria/i);
    const clasesMetodo = etiquetaMetodo.getAttribute('class') ?? '';
    expect(clasesMetodo).toContain('whitespace-nowrap');
    expect(clasesMetodo).toContain('shrink-0');
  });

  it('B3 · referencia bancaria incluye break-all', () => {
    montarTarjeta();

    const elementoRef = screen.getByText('0102000123456789012345');
    const clasesRef = elementoRef.getAttribute('class') ?? '';
    expect(clasesRef).toContain('break-all');
  });

  it('B4 · acciones tienen nombre propio accesible ("Aprobar pago de <alumno>" y "Rechazar pago de <alumno>") y eliminan nombres antiguos', () => {
    const { onAprobar, onRechazar } = montarTarjeta();

    const nombreAlumno = 'María Fernanda de los Ángeles Rodríguez Pérez';
    const botonAprobar = screen.getByRole('button', {
      name: `Aprobar pago de ${nombreAlumno}`,
    });
    expect(botonAprobar.textContent?.trim()).toBe('Aprobar');

    const botonRechazar = screen.getByRole('button', {
      name: `Rechazar pago de ${nombreAlumno}`,
    });
    expect(botonRechazar.textContent?.trim()).toBe('Rechazar');

    fireEvent.click(botonAprobar);
    expect(onAprobar).toHaveBeenCalledWith(TX_LARGA);

    fireEvent.click(botonRechazar);
    expect(onRechazar).toHaveBeenCalledWith(TX_LARGA);

    expect(screen.queryByRole('button', { name: /Aprobar y Descontar Saldo/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rechazar con Motivo/i })).toBeNull();
  });

  it('B5 · "Aprobar", "Rechazar" y "Ver Comprobante" tienen type="button" e incluyen min-h-11', () => {
    montarTarjeta();

    const nombreAlumno = 'María Fernanda de los Ángeles Rodríguez Pérez';
    const botonAprobar =
      screen.queryByRole('button', { name: `Aprobar pago de ${nombreAlumno}` }) ??
      screen.getByRole('button', { name: /Aprobar/i });
    const botonRechazar =
      screen.queryByRole('button', { name: `Rechazar pago de ${nombreAlumno}` }) ??
      screen.getByRole('button', { name: /Rechazar/i });
    const botonVer = screen.getByRole('button', { name: /^Ver comprobante/ });

    for (const boton of [botonAprobar, botonRechazar, botonVer]) {
      expect(boton.getAttribute('type')).toBe('button');
      expect(boton.getAttribute('class')).toContain('min-h-11');
    }

    const clasesRechazar = botonRechazar.getAttribute('class') ?? '';
    expect(clasesRechazar).toContain('text-destructive');
    expect(clasesRechazar).not.toContain('text-foreground');
  });

  it('B6 · contenedor de Aprobar y Rechazar incluye flex-col y sm:flex-row', () => {
    montarTarjeta();

    const nombreAlumno = 'María Fernanda de los Ángeles Rodríguez Pérez';
    const botonAprobar =
      screen.queryByRole('button', { name: `Aprobar pago de ${nombreAlumno}` }) ??
      screen.getByRole('button', { name: /Aprobar/i });
    const contenedorAcciones = botonAprobar.parentElement;
    expect(contenedorAcciones).not.toBeNull();

    const clases = contenedorAcciones?.getAttribute('class') ?? '';
    expect(clases).toContain('flex-col');
    expect(clases).toContain('sm:flex-row');
  });
});
