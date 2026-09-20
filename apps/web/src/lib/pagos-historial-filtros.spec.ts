import { describe, it, expect } from 'vitest';
import { EstadoConciliacion, Moneda, MetodoPago, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  normalizarEstadoTransaccion,
  etiquetaEstadoTransaccion,
  filtrarTransaccionesPorEstado,
  hayFiltroHistorialActivo,
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
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: '987654',
    fechaOperacion: '2026-09-02',
    estadoConciliacion: parcial.estadoConciliacion as any,
    fechaReporteUtc: '2026-09-02T10:00:00.000Z',
    createdAtUtc: '2026-09-02T10:00:00.000Z',
    updatedAtUtc: '2026-09-02T10:00:00.000Z',
  };
}

const HISTORIAL = [
  tx({ id: '1', estadoConciliacion: EstadoConciliacion.APROBADO }),
  tx({ id: '2', estadoConciliacion: EstadoConciliacion.RECHAZADO }),
  tx({ id: '3', estadoConciliacion: EstadoConciliacion.PENDIENTE }),
  tx({ id: '4', estadoConciliacion: undefined }),
];

describe('normalizarEstadoTransaccion / etiquetaEstadoTransaccion (WU20)', () => {
  it('mapea los estados reales del enum y su etiqueta visible', () => {
    expect(normalizarEstadoTransaccion(EstadoConciliacion.APROBADO)).toBe(
      EstadoConciliacion.APROBADO
    );
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.APROBADO)).toBe('Verificado');
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.RECHAZADO)).toBe('Rechazado');
    expect(etiquetaEstadoTransaccion(EstadoConciliacion.PENDIENTE)).toBe('En Revisión');
  });

  it('un estado ausente o desconocido cae a "En Revisión" (igual que la fila)', () => {
    expect(normalizarEstadoTransaccion(undefined)).toBe(EstadoConciliacion.PENDIENTE);
    expect(etiquetaEstadoTransaccion(null)).toBe('En Revisión');
    expect(etiquetaEstadoTransaccion('estado_raro')).toBe('En Revisión');
  });
});

describe('filtrarTransaccionesPorEstado (WU20)', () => {
  it('sin filtro devuelve una copia con el mismo orden', () => {
    const resultado = filtrarTransaccionesPorEstado(HISTORIAL);
    expect(resultado.map((t) => t.id)).toEqual(['1', '2', '3', '4']);
    expect(resultado).not.toBe(HISTORIAL);
  });

  it('cada chip devuelve solo su estado, incluyendo los desconocidos en En Revisión', () => {
    expect(
      filtrarTransaccionesPorEstado(HISTORIAL, EstadoConciliacion.APROBADO).map((t) => t.id)
    ).toEqual(['1']);
    expect(
      filtrarTransaccionesPorEstado(HISTORIAL, EstadoConciliacion.RECHAZADO).map((t) => t.id)
    ).toEqual(['2']);
    expect(
      filtrarTransaccionesPorEstado(HISTORIAL, EstadoConciliacion.PENDIENTE).map((t) => t.id)
    ).toEqual(['3', '4']);
  });

  it('un estado sin transacciones devuelve lista vacía', () => {
    expect(
      filtrarTransaccionesPorEstado([HISTORIAL[0]], EstadoConciliacion.RECHAZADO)
    ).toEqual([]);
  });
});

describe('hayFiltroHistorialActivo (WU20)', () => {
  it('solo es true con un chip distinto de todos', () => {
    expect(hayFiltroHistorialActivo()).toBe(false);
    expect(hayFiltroHistorialActivo('todos')).toBe(false);
    expect(hayFiltroHistorialActivo(EstadoConciliacion.RECHAZADO)).toBe(true);
  });
});
