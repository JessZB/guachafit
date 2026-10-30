import { describe, it, expect } from 'vitest';
import { MetodoPago, Moneda, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  etiquetaMetodoPago,
  metodosPagoPresentes,
  filtrarTransaccionesConciliacion,
  hayFiltroConciliacionActivo,
} from './conciliacion-filtros';

function tx(parcial: {
  id: string;
  clienteNombre?: string;
  referenciaBancaria?: string | null;
  metodoPago: MetodoPago;
}): TransaccionPagoDetalleDTO {
  return {
    id: parcial.id,
    cuotaId: `cuota-${parcial.id}`,
    clienteId: `cli-${parcial.id}`,
    entrenadorId: 'coach-1',
    registradoPor: `cli-${parcial.id}`,
    montoOriginal: '100.00',
    monedaOriginal: Moneda.USD,
    tasaCambioFijada: '65.0000',
    montoEquivalenteUsd: '100.00',
    excedenteUsd: '0.00',
    metodoPago: parcial.metodoPago,
    referenciaBancaria: parcial.referenciaBancaria ?? null,
    fechaOperacion: '2026-09-10',
    estadoConciliacion: 'pendiente' as any,
    fechaReporteUtc: '2026-09-10T10:00:00.000Z',
    clienteNombre: parcial.clienteNombre,
    createdAtUtc: '2026-09-10T10:00:00.000Z',
    updatedAtUtc: '2026-09-10T10:00:00.000Z',
  };
}

const COLA = [
  tx({
    id: '1',
    clienteNombre: 'Carlos Mendoza',
    referenciaBancaria: '445566',
    metodoPago: MetodoPago.PAGO_MOVIL,
  }),
  tx({
    id: '2',
    clienteNombre: 'Mariana Pérez',
    referenciaBancaria: 'ZEL-998811',
    metodoPago: MetodoPago.ZELLE,
  }),
  tx({
    id: '3',
    clienteNombre: 'Andrés Silva',
    referenciaBancaria: 'TRF-1020',
    metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
  }),
];

describe('etiquetaMetodoPago (WU20)', () => {
  it('reemplaza todos los guiones bajos del enum', () => {
    expect(etiquetaMetodoPago(MetodoPago.PAGO_MOVIL)).toBe('Pago móvil');
    expect(etiquetaMetodoPago(MetodoPago.TRANSFERENCIA_BANCARIA)).toBe('Transferencia bancaria');
    expect(etiquetaMetodoPago(MetodoPago.BINANCE_USDT)).toBe('Binance (USDT)');
  });

  it('acepta el método como texto crudo del historial (`metodoPago: string`)', () => {
    expect(etiquetaMetodoPago('transferencia_bancaria')).toBe('Transferencia bancaria');
  });

  it('sin método no imprime un string vacío', () => {
    expect(etiquetaMetodoPago(null)).toBe('Sin dato');
    expect(etiquetaMetodoPago(undefined)).toBe('Sin dato');
    expect(etiquetaMetodoPago('')).toBe('Sin dato');
  });
});

describe('metodosPagoPresentes (WU20: chips solo con métodos reales de la cola)', () => {
  it('lista únicos en orden de primera aparición', () => {
    expect(metodosPagoPresentes(COLA)).toEqual([
      MetodoPago.PAGO_MOVIL,
      MetodoPago.ZELLE,
      MetodoPago.TRANSFERENCIA_BANCARIA,
    ]);
    expect(
      metodosPagoPresentes([
        ...COLA,
        tx({ id: '4', clienteNombre: 'Otro', metodoPago: MetodoPago.PAGO_MOVIL }),
      ])
    ).toEqual([MetodoPago.PAGO_MOVIL, MetodoPago.ZELLE, MetodoPago.TRANSFERENCIA_BANCARIA]);
  });

  it('una cola vacía no produce métodos', () => {
    expect(metodosPagoPresentes([])).toEqual([]);
  });
});

describe('filtrarTransaccionesConciliacion (WU20)', () => {
  it('sin filtros devuelve una copia en el mismo orden FIFO', () => {
    const resultado = filtrarTransaccionesConciliacion(COLA);
    expect(resultado.map((t) => t.id)).toEqual(['1', '2', '3']);
    expect(resultado).not.toBe(COLA);
  });

  it('busca por alumno sin distinguir mayúsculas ni acentos', () => {
    expect(
      filtrarTransaccionesConciliacion(COLA, { busqueda: 'mariana perez' }).map((t) => t.id)
    ).toEqual(['2']);
    expect(
      filtrarTransaccionesConciliacion(COLA, { busqueda: 'ANDRES' }).map((t) => t.id)
    ).toEqual(['3']);
  });

  it('busca también por referencia bancaria', () => {
    expect(
      filtrarTransaccionesConciliacion(COLA, { busqueda: '998811' }).map((t) => t.id)
    ).toEqual(['2']);
    expect(filtrarTransaccionesConciliacion(COLA, { busqueda: 'trf' }).map((t) => t.id)).toEqual([
      '3',
    ]);
  });

  it('combina chip de método y búsqueda', () => {
    expect(
      filtrarTransaccionesConciliacion(COLA, {
        metodoPago: MetodoPago.ZELLE,
        busqueda: '998811',
      }).map((t) => t.id)
    ).toEqual(['2']);
    expect(
      filtrarTransaccionesConciliacion(COLA, {
        metodoPago: MetodoPago.PAGO_MOVIL,
        busqueda: 'mariana',
      })
    ).toEqual([]);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filtrarTransaccionesConciliacion(COLA, { busqueda: 'zzz' })).toEqual([]);
    expect(
      filtrarTransaccionesConciliacion(COLA, { metodoPago: MetodoPago.EFECTIVO_USD })
    ).toEqual([]);
  });
});

describe('hayFiltroConciliacionActivo (WU20)', () => {
  it('solo es true con búsqueda con contenido o método distinto de todos', () => {
    expect(hayFiltroConciliacionActivo()).toBe(false);
    expect(hayFiltroConciliacionActivo({ busqueda: '  ', metodoPago: 'todos' })).toBe(false);
    expect(hayFiltroConciliacionActivo({ busqueda: 'zelle' })).toBe(true);
    expect(hayFiltroConciliacionActivo({ metodoPago: MetodoPago.ZELLE })).toBe(true);
  });
});
