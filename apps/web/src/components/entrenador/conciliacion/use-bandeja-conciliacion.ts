/**
 * Tray data hook: loads ONE page of the queue behind the current mechanism.
 *
 * Encapsulates exactly what the page does today (R9): numbered server-side
 * pagination through `usePaginacionServidor`, the server envelope in real mode,
 * and the local demo-queue slice in demo mode. No behavior change.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  BandejaConciliacionDTO,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { rebanarPagina } from '../../../lib/paginacion';
import { usePaginacionServidor } from '../../../lib/use-paginacion-servidor';
import { crearColaDemo } from '../../../lib/conciliacion-demo';

export interface ResultadoBandejaConciliacion {
  pagina: number;
  tamano: number;
  fijarPagina: (pagina: number) => void;
  fijarTamano: (tamano: number) => void;
  transacciones: TransaccionPagoDetalleDTO[];
  total: number;
  cargando: boolean;
  /** First load shows the loading state; page changes keep the list. */
  enCargaInicial: boolean;
  /** `true` cuando ya hay una respuesta del servidor (aunque la recarga actual falle). */
  tieneDatos: boolean;
  error: string | null;
  recargar: () => void;
  /** Marks one transaction resolved: local slice in demo, server reload otherwise. */
  marcarResuelta: (txId: string) => void;
}

export function useBandejaConciliacion(isDemoMode: boolean): ResultadoBandejaConciliacion {
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  // In demo the queue is local: already-resolved ids drop out of the fixture slice.
  const [idsResueltosDemo, setIdsResueltosDemo] = useState<string[]>([]);

  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<BandejaConciliacionDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        const cola = crearColaDemo().filter((tx) => !idsResueltosDemo.includes(tx.id));
        return {
          items: rebanarPagina(cola, paginaSolicitada, tamanoSolicitado),
          total: cola.length,
          limit: tamanoSolicitado,
          offset,
        };
      }
      return apiClient<BandejaConciliacionDTO>(
        `/finanzas/conciliacion/bandeja?limit=${tamanoSolicitado}&offset=${offset}`,
        { signal }
      );
    },
    [isDemoMode, idsResueltosDemo]
  );

  const paginacion = usePaginacionServidor<TransaccionPagoDetalleDTO, BandejaConciliacionDTO>({
    clave: ['conciliacion-bandeja', isDemoMode ? `demo-${idsResueltosDemo.length}` : 'real'],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: transacciones,
    total,
    cargando,
    error: errorConsulta,
    recargar,
    respuesta,
  } = paginacion;
  const enCargaInicial = cargando && !respuesta;
  const tieneDatos = respuesta !== undefined;
  const error = errorConsulta?.message ?? null;

  // Changing the page size (or entering/leaving demo mode) goes back to page 1.
  useEffect(() => {
    setPagina(1);
  }, [tamano, isDemoMode]);

  const marcarResuelta = (txId: string) => {
    if (isDemoMode) setIdsResueltosDemo((prev) => [...prev, txId]);
    else recargar();
  };

  return {
    pagina,
    tamano,
    fijarPagina: setPagina,
    fijarTamano: setTamano,
    transacciones,
    total,
    cargando,
    enCargaInicial,
    tieneDatos,
    error,
    recargar,
    marcarResuelta,
  };
}
