/**
 * Módulo `monitor-adherencia` · hook de datos del monitor semanal.
 *
 * Extraído verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:418-512`
 * (estado + `cargarPagina` + `usePaginacionServidor`).
 *
 * - MISMO mecanismo que usa hoy la vista (R9): `usePaginacionServidor` (TanStack Query)
 *   + `apiClient`; en demo filtra el fixture local con los mismos helpers puros.
 * - `q` y `semaforo` viajan al servidor ANTES del slice; el `resumen` de la respuesta
 *   sigue describiendo la cartera completa. Búsqueda/filtro/tamaño nuevos vuelven a la
 *   página 1. Solo la PRIMERA carga muestra esqueletos (`isLoading`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MonitorAdherenciaDTO,
  MonitorAdherenciaSemanalDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { obtenerTimezoneDispositivo } from '../../../lib/date-format';
import { crearMonitorAdherenciaDemo } from '../../../lib/demo-monitor-adherencia';
import { rebanarPagina } from '../../../lib/paginacion';
import {
  aParametroSemaforoMonitor,
  calcularResumenMonitorAdherencia,
  filtrarMonitorAlumnos,
  hayFiltroMonitorActivo,
  type FiltroSemaforoMonitor,
} from '../../../lib/monitor-filtros';
import { usePaginacionServidor } from '../../../lib/use-paginacion-servidor';
import { useValorDebounced } from '../../../lib/use-valor-debounced';

export type { FiltroSemaforoMonitor };

export function useMonitorAdherencia({ isDemoMode }: { isDemoMode: boolean }) {
  // WU25a: paginación numerada + filtros server-side (chips del semáforo + búsqueda con debounce).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [filtroSemaforo, setFiltroSemaforo] = useState<FiltroSemaforoMonitor>('todos');
  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useValorDebounced(busqueda);
  const [alumnoActivo, setAlumnoActivo] = useState<MonitorAdherenciaSemanalDTO | null>(null);

  const timezone = useMemo(() => obtenerTimezoneDispositivo(), []);

  /**
   * WU25a: carga de UNA página del monitor. `q` y `semaforo` viajan al servidor ANTES del slice
   * (el `resumen` de la respuesta sigue describiendo la cartera completa). En modo demo se filtra
   * el fixture local con los mismos helpers puros y se corta con `rebanarPagina`.
   */
  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<MonitorAdherenciaDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      const termino = busquedaDebounced.trim();
      const semaforoApi = aParametroSemaforoMonitor(filtroSemaforo);

      if (isDemoMode) {
        const cartera = crearMonitorAdherenciaDemo();
        const filtrados = filtrarMonitorAlumnos(cartera, {
          busqueda: termino,
          filtroSemaforo,
        });
        return {
          items: rebanarPagina(filtrados, paginaSolicitada, tamanoSolicitado),
          total: filtrados.length,
          limit: tamanoSolicitado,
          offset,
          // Los chips demo siempre describen la cartera completa, como el servidor.
          resumen: calcularResumenMonitorAdherencia(cartera),
        };
      }

      const parametros = new URLSearchParams({
        timezone,
        limit: String(tamanoSolicitado),
        offset: String(offset),
      });
      if (termino.length > 0) parametros.set('q', termino);
      if (semaforoApi) parametros.set('semaforo', semaforoApi);

      return apiClient<MonitorAdherenciaDTO>(
        `/entrenador/monitor-adherencia?${parametros.toString()}`,
        { signal }
      );
    },
    [isDemoMode, timezone, busquedaDebounced, filtroSemaforo]
  );

  const paginacion = usePaginacionServidor<MonitorAdherenciaSemanalDTO, MonitorAdherenciaDTO>({
    clave: ['monitor-adherencia', isDemoMode ? 'demo' : 'real', timezone, busquedaDebounced.trim(), filtroSemaforo],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: alumnos,
    total,
    cargando,
    error: errorCarga,
    recargar,
    respuesta,
  } = paginacion;
  const resumen = respuesta?.resumen ?? null;
  const totalCartera = resumen?.total ?? 0;
  // Solo la PRIMERA carga muestra esqueletos; el cambio de página conserva la lista anterior.
  const isLoading = cargando && !respuesta;
  const error = errorCarga?.message ?? null;

  // WU25a: búsqueda/filtro/tamaño nuevos vuelven a la página 1 (y el demo reinicia su página).
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced, filtroSemaforo, tamano, isDemoMode]);

  const filtroActivo = hayFiltroMonitorActivo({ busqueda, filtroSemaforo });
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroSemaforo('todos');
  };

  return {
    alumnos,
    total,
    totalCartera,
    resumen,
    cargando,
    isLoading,
    error,
    recargar,
    pagina,
    tamano,
    setPagina,
    setTamano,
    filtroSemaforo,
    setFiltroSemaforo,
    busqueda,
    setBusqueda,
    filtroActivo,
    limpiarFiltros,
    alumnoActivo,
    setAlumnoActivo,
  };
}
