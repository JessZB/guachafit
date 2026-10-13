/**
 * Hook del historial financiero del alumno (RF-007, WU25b).
 *
 * Carga paginada manual con el MISMO mecanismo que hoy (`apiClient` + estado local;
 * R9: sin TanStack ni `usePaginacionServidor`). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-4).
 *
 * Real: `GET /finanzas/clientes/:id/historial?txLimit&txOffset` (el resumen completo más la
 * página; `transaccionesTotal` es el COUNT real). Demo: slice del fixture local sin red.
 */
import { useState } from 'react';
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { calcularTotalPaginas, rebanarPagina } from '../../../lib/paginacion';
import { TAMANO_PAGINA_FICHA } from '../../../lib/alumno-detalle-controles';
import { transaccionesDemoAlumno } from '../../../lib/alumno-detalle-demo';

export interface ParametrosHistorialTransacciones {
  alumnoId: string | undefined;
  isDemoMode: boolean;
}

export function useHistorialTransacciones({ alumnoId, isDemoMode }: ParametrosHistorialTransacciones) {
  const [finanzas, setFinanzas] = useState<ResumenFinancieroAlumnoDTO | null>(null);
  // WU25b: paginación server-side del historial de transacciones (`txLimit`/`txOffset` + total).
  const [paginaTx, setPaginaTx] = useState(1);
  const [tamanoTx, setTamanoTx] = useState(TAMANO_PAGINA_FICHA);
  const [isCargandoTx, setIsCargandoTx] = useState(false);
  const [transaccionesError, setTransaccionesError] = useState<string | null>(null);

  /**
   * WU25b: carga UNA página del historial de transacciones.
   *
   * - Real: `GET /finanzas/clientes/:id/historial?txLimit&txOffset`; la respuesta mantiene el
   *   resumen completo (saldos y cuota del periodo) y `transaccionesTotal` es el COUNT real.
   * - Demo: corta el fixture local (`transaccionesDemoAlumno`) sin tocar la red.
   * Nota de contrato: el endpoint no acepta filtro por estado; la ficha muestra la página tal
   * cual (el filtro por estado vive en PagosPage y también es client-side sobre la página).
   */
  const cargarTransacciones = async (
    paginaSolicitada: number,
    tamanoSolicitado: number,
    reintento = false
  ) => {
    if (!alumnoId) return;
    setIsCargandoTx(true);
    setTransaccionesError(null);
    try {
      if (isDemoMode) {
        const fixture = transaccionesDemoAlumno(alumnoId);
        setFinanzas((prev) =>
          prev
            ? {
                ...prev,
                transacciones: rebanarPagina(fixture, paginaSolicitada, tamanoSolicitado),
                transaccionesTotal: fixture.length,
              }
            : prev
        );
        return;
      }
      const offset = (Math.max(1, paginaSolicitada) - 1) * Math.max(1, tamanoSolicitado);
      const res = await apiClient<ResumenFinancieroAlumnoDTO>(
        `/finanzas/clientes/${alumnoId}/historial?txLimit=${tamanoSolicitado}&txOffset=${offset}`
      );
      setFinanzas(res);
      const total = Number(res?.transaccionesTotal ?? res?.transacciones?.length ?? 0);
      const totalPaginas = calcularTotalPaginas(total, tamanoSolicitado);
      if (paginaSolicitada > totalPaginas && !reintento) {
        setPaginaTx(totalPaginas);
        void cargarTransacciones(totalPaginas, tamanoSolicitado, true);
      }
    } catch (err: unknown) {
      setTransaccionesError(
        err instanceof Error ? err.message : 'No se pudieron cargar las transacciones. Inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoTx(false);
    }
  };

  const cambiarPaginaTx = (nuevaPagina: number) => {
    setPaginaTx(nuevaPagina);
    void cargarTransacciones(nuevaPagina, tamanoTx);
  };

  const cambiarTamanoTx = (nuevoTamano: number) => {
    setTamanoTx(nuevoTamano);
    setPaginaTx(1);
    void cargarTransacciones(1, nuevoTamano);
  };

  return {
    finanzas,
    setFinanzas,
    paginaTx,
    setPaginaTx,
    tamanoTx,
    setTamanoTx,
    isCargandoTx,
    transaccionesError,
    cargarTransacciones,
    cambiarPaginaTx,
    cambiarTamanoTx,
  };
}

export type RetornoHistorialTransacciones = ReturnType<typeof useHistorialTransacciones>;
