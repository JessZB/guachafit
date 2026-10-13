/**
 * Hook de datos de la cola de evaluaciones antropometricas pendientes.
 *
 * Encapsula el mecanismo vigente (R9): `usePaginacionServidor` (TanStack Query) con
 * `cargarPagina` (demo local via fixture + `rebanarPagina`, real via envelope del
 * servidor), el reset a la pagina 1 al cambiar tamano o modo demo, y el filtro
 * client-side por alumno sobre la pagina cargada (WU20 + WU25b).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ColaPendientesAntropometricosDTO,
  ControlAntropometricoDetalleDTO,
} from "@guachafit/shared";
import { apiClient } from "../../../lib/api-client";
import { useAuth } from "../../../context/auth-context";
import {
  filtrarPendientesAntropometria,
  hayBusquedaAntropometriaActiva,
} from "../../../lib/antropometria-filtros";
import { crearPendientesDemoAntropometria } from "../../../lib/demo-antropometria";
import { rebanarPagina } from "../../../lib/paginacion";
import { usePaginacionServidor } from "../../../lib/use-paginacion-servidor";

export function useColaAntropometria() {
  const { isDemoMode } = useAuth();
  // WU25b: paginación numerada server-side (envelope `{ items, total, limit, offset }`).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  // En demo la cola es local: los ids ya conciliados se excluyen del slice del fixture.
  const [idsResueltosDemo, setIdsResueltosDemo] = useState<string[]>([]);
  // WU20: búsqueda client-side por nombre. WU25b: con paginación server-side se aplica sobre la
  // PÁGINA cargada (el endpoint no acepta búsqueda); la UI muestra el conteo "en esta página".
  const [busqueda, setBusqueda] = useState("");

  /**
   * WU25b: carga de UNA página de la cola de pendientes. En demo se filtra la cola local (ids
   * ya conciliados) y se corta con `rebanarPagina`; en real se consulta el envelope del servidor.
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
    }): Promise<ColaPendientesAntropometricosDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        const cola = crearPendientesDemoAntropometria().filter(
          (ctrl) => !idsResueltosDemo.includes(ctrl.id),
        );
        return {
          items: rebanarPagina(cola, paginaSolicitada, tamanoSolicitado),
          total: cola.length,
          limit: tamanoSolicitado,
          offset,
        };
      }
      return apiClient<ColaPendientesAntropometricosDTO>(
        `/antropometria/pendientes?limit=${tamanoSolicitado}&offset=${offset}`,
        { signal },
      );
    },
    [isDemoMode, idsResueltosDemo],
  );

  const paginacion = usePaginacionServidor<
    ControlAntropometricoDetalleDTO,
    ColaPendientesAntropometricosDTO
  >({
    clave: [
      "antropometria-pendientes",
      isDemoMode ? `demo-${idsResueltosDemo.length}` : "real",
    ],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: pendientes,
    total,
    cargando,
    error: errorConsulta,
    recargar,
    respuesta,
  } = paginacion;
  // Solo la PRIMERA carga muestra el estado de carga; el cambio de página conserva la lista.
  const isLoading = cargando && !respuesta;
  const error = errorConsulta?.message ?? null;

  // WU25b: cambiar el tamaño de página (o entrar/salir del modo demo) vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [tamano, isDemoMode]);

  const visibles = useMemo(
    () => filtrarPendientesAntropometria(pendientes, busqueda),
    [pendientes, busqueda],
  );

  const hayBusquedaActiva = hayBusquedaAntropometriaActiva(busqueda);

  const limpiarBusqueda = () => setBusqueda("");

  /** En demo la conciliación vive en estado local: el id resuelto sale del slice. */
  const registrarResueltoDemo = (id: string) =>
    setIdsResueltosDemo((prev) => [...prev, id]);

  return {
    isDemoMode,
    pagina,
    setPagina,
    tamano,
    setTamano,
    pendientes,
    total,
    cargando,
    isLoading,
    error,
    recargar,
    busqueda,
    setBusqueda,
    visibles,
    hayBusquedaActiva,
    limpiarBusqueda,
    registrarResueltoDemo,
  };
}
