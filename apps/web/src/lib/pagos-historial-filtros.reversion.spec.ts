/**
 * RF-007 (lote web): estado `revertido` en los filtros del historial de pagos.
 *
 * Fija el contrato: `normalizarEstadoTransaccion` reconoce `REVERTIDO` → "Revertido" y los demás
 * estados (incluidos los desconocidos) mantienen su normalización; el filtro por estado separa las
 * revertidas de las aprobadas.
 *
 * Spec puro (sin DOM): misma convención que `pagos-historial-filtros.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { EstadoConciliacion, Moneda, MetodoPago, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  etiquetaEstadoTransaccion,
  filtrarTransaccionesPorEstado,
  normalizarEstadoTransaccion,
} from './pagos-historial-filtros';

function tx(parcial: {
  id: string;
  estadoConciliacion: string | null | undefined;
}): TransaccionPagoDetalleDTO {
  return {
    id: parcial.id,
    cuotaId: `cuota-${parcial.id}`,
    clienteId: 'alumno-1',
    entrenadorId: 'coach-1',
    registradoPor: 'alumno-1',
    montoOriginal: '1300.00',
    monedaOriginal: Moneda.VES,
    tasaCambioFijada: '65.0000',
    montoEquivalenteUsd: '20.00',
    excedenteUsd: '0.00',
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: '987654',
    fechaOperacion: '2026-10-01',
    estadoConciliacion: parcial.estadoConciliacion as any,
    fechaReporteUtc: '2026-10-01T10:00:00.000Z',
    createdAtUtc: '2026-10-01T10:00:00.000Z',
    updatedAtUtc: '2026-10-01T10:00:00.000Z',
  };
}

const HISTORIAL = [
  tx({ id: 'rev-1', estadoConciliacion: EstadoConciliacion.REVERTIDO }),
  tx({ id: 'ap-1', estadoConciliacion: EstadoConciliacion.APROBADO }),
  tx({ id: 'pe-1', estadoConciliacion: EstadoConciliacion.PENDIENTE }),
];

describe('RF-007 · contrato 1: normalización y etiqueta de "revertido"', () => {
  it('1a · "revertido" se normaliza a REVERTIDO y su etiqueta visible es "Revertido"', () => {
    expect(normalizarEstadoTransaccion(EstadoConciliacion.REVERTIDO)).toBe(
      EstadoConciliacion.REVERTIDO
    );
    expect(normalizarEstadoTransaccion('revertido')).toBe(EstadoConciliacion.REVERTIDO);
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.REVERTIDO)).toBe('Revertido');
    expect(etiquetaEstadoTransaccion('revertido')).toBe('Revertido');
  });

  it('1b · los demás estados no cambian (aprobado, rechazado, pendiente y desconocidos)', () => {
    expect(normalizarEstadoTransaccion(EstadoConciliacion.APROBADO)).toBe(
      EstadoConciliacion.APROBADO
    );
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.APROBADO)).toBe('Verificado');
    expect(normalizarEstadoTransaccion(EstadoConciliacion.RECHAZADO)).toBe(
      EstadoConciliacion.RECHAZADO
    );
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.RECHAZADO)).toBe('Rechazado');
    expect(normalizarEstadoTransaccion(EstadoConciliacion.PENDIENTE)).toBe(
      EstadoConciliacion.PENDIENTE
    );
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.PENDIENTE)).toBe('En Revisión');
    expect(normalizarEstadoTransaccion(undefined)).toBe(EstadoConciliacion.PENDIENTE);
    expect(etiquetaEstadoTransaccion(null)).toBe('En Revisión');
    expect(etiquetaEstadoTransaccion('estado_raro')).toBe('En Revisión');
  });
});

describe('RF-007 · contrato 2: filtro por estado con pagos revertidos', () => {
  it('2a · el filtro REVERTIDO devuelve solo las transacciones revertidas', () => {
    expect(
      filtrarTransaccionesPorEstado(HISTORIAL, EstadoConciliacion.REVERTIDO).map((t) => t.id)
    ).toEqual(['rev-1']);
  });

  it('2b · el filtro APROBADO ya no incluye las revertidas', () => {
    expect(
      filtrarTransaccionesPorEstado(HISTORIAL, EstadoConciliacion.APROBADO).map((t) => t.id)
    ).toEqual(['ap-1']);
  });
});
