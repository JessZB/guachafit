/**
 * Tray filter state: free-text search plus payment-method chip, applied over the
 * loaded page (the endpoint accepts no filters, so the UI declares the scope).
 */
import { useEffect, useMemo, useState } from 'react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  filtrarTransaccionesConciliacion,
  hayFiltroConciliacionActivo,
  metodosPagoPresentes,
  type FiltroMetodoPago,
} from '../../../lib/conciliacion-filtros';

export interface ResultadoFiltrosConciliacion {
  busqueda: string;
  fijarBusqueda: (valor: string) => void;
  filtroMetodo: FiltroMetodoPago;
  fijarFiltroMetodo: (metodo: FiltroMetodoPago) => void;
  visibles: TransaccionPagoDetalleDTO[];
  metodosPresentes: ReturnType<typeof metodosPagoPresentes>;
  hayFiltroActivo: boolean;
  limpiarFiltros: () => void;
}

export function useFiltrosConciliacion(
  transacciones: TransaccionPagoDetalleDTO[]
): ResultadoFiltrosConciliacion {
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<FiltroMetodoPago>('todos');

  const visibles = useMemo(
    () => filtrarTransaccionesConciliacion(transacciones, { busqueda, metodoPago: filtroMetodo }),
    [transacciones, busqueda, filtroMetodo]
  );

  const metodosPresentes = useMemo(() => metodosPagoPresentes(transacciones), [transacciones]);

  const hayFiltroActivo = hayFiltroConciliacionActivo({ busqueda, metodoPago: filtroMetodo });

  // When the filtered method leaves the queue (e.g. its only transaction was just
  // approved), the active chip would no longer exist: fall back to "Todos" so no
  // ghost filter stays on.
  useEffect(() => {
    if (filtroMetodo !== 'todos' && !metodosPresentes.includes(filtroMetodo)) {
      setFiltroMetodo('todos');
    }
  }, [metodosPresentes, filtroMetodo]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroMetodo('todos');
  };

  return {
    busqueda,
    fijarBusqueda: setBusqueda,
    filtroMetodo,
    fijarFiltroMetodo: setFiltroMetodo,
    visibles,
    metodosPresentes,
    hayFiltroActivo,
    limpiarFiltros,
  };
}
