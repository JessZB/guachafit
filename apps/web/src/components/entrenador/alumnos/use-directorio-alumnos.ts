/**
 * Módulo `alumnos` (fase B, prompt 53) · hook de datos del directorio.
 *
 * Extraído verbatim de `pages/entrenador/AlumnosPage.tsx:106-117, 181-268, 367-390`
 * (ver inventario 42 §3, `use-directorio-alumnos` ~140 líneas).
 *
 * - Encapsula `cargarPagina` + `usePaginacionServidor` + restauración + `actionError`
 *   con el MISMO mecanismo que usa hoy la vista (R9: sin TanStack nuevo, sin
 *   `usePaginacionServidor` distinto; el hook YA lo usaba la página).
 * - Los parámetros del `GET /alumnos` se construyen con la lógica pura de
 *   `lib/alumnos-directorio-filtros` (misma semántica, sin duplicar).
 * - R5: `handleRestaurarAlumno` recarga la página actual desde el servidor en lugar
 *   de mutar la fila en memoria; el fallo queda visible en `role="alert"`.
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type {
  DirectorioAlumnosDTO,
  PerfilAlumnoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  calcularResumenDirectorio,
  filtrarDirectorioDemo,
  ROSTER_DEMO_DIRECTORIO,
  type FiltroEstadoDirectorio,
  type FiltroModalidadDirectorio,
} from '../../../lib/directorio-alumnos';
import { usePaginacionServidor } from '../../../lib/use-paginacion-servidor';
import { useValorDebounced } from '../../../lib/use-valor-debounced';
import { rebanarPagina } from '../../../lib/paginacion';
import {
  construirParametrosDirectorioAlumnos,
  hayFiltrosDirectorioActivos,
  TAMANO_PAGINA_POR_DEFECTO,
} from '../../../lib/alumnos-directorio-filtros';

export function useDirectorioAlumnos({ isDemoMode }: { isDemoMode: boolean }) {
  // WU25a: estado de la paginación numerada + filtros server-side.
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA_POR_DEFECTO);
  const [search, setSearch] = useState('');
  const qDebounced = useValorDebounced(search);
  const [filterEstado, setFilterEstado] = useState<FiltroEstadoDirectorio>('todos');
  const [filterModalidad, setFilterModalidad] = useState<FiltroModalidadDirectorio>('todas');
  // D5: fallo de mutación visible; nunca éxito falso ni alumno fantasma.
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * WU25a: carga de UNA página del directorio. Los filtros viajan al servidor (`q`, `estado`,
   * `modalidad`, `soloArchivados`/`incluirArchivados`, `semaforoPago`) y el `resumen` sigue
   * llegando completo en cada respuesta para los KPIs. En modo demo se filtra y se corta el
   * roster local con la MISMA semántica, sin llamadas API.
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
    }): Promise<DirectorioAlumnosDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;

      if (isDemoMode) {
        const filtrados = filtrarDirectorioDemo(ROSTER_DEMO_DIRECTORIO, {
          q: qDebounced,
          estado: filterEstado,
          modalidad: filterModalidad,
        });
        return {
          items: rebanarPagina(filtrados, paginaSolicitada, tamanoSolicitado),
          total: filtrados.length,
          limit: tamanoSolicitado,
          offset,
          // Los KPIs demo siempre describen la cartera completa, como el servidor.
          resumen: calcularResumenDirectorio(ROSTER_DEMO_DIRECTORIO),
        };
      }

      const parametros = construirParametrosDirectorioAlumnos({
        tamano: tamanoSolicitado,
        pagina: paginaSolicitada,
        q: qDebounced,
        estado: filterEstado,
        modalidad: filterModalidad,
      });

      return apiClient<DirectorioAlumnosDTO>(`/alumnos?${parametros.toString()}`, { signal });
    },
    [isDemoMode, qDebounced, filterEstado, filterModalidad]
  );

  const paginacion = usePaginacionServidor<PerfilAlumnoDetalleDTO, DirectorioAlumnosDTO>({
    // La clave incluye los filtros activos: cada combinación tiene su propia caché y su página.
    clave: [
      'directorio-alumnos',
      isDemoMode ? 'demo' : 'real',
      qDebounced.trim(),
      filterEstado,
      filterModalidad,
    ],
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
  // Solo la PRIMERA carga (sin datos en pantalla) muestra esqueletos; los cambios de página
  // conservan la lista anterior gracias a `keepPreviousData`.
  const isLoading = cargando && !respuesta;
  const error = errorCarga?.message ?? null;

  // WU25a: cualquier cambio de búsqueda/filtro/tamaño vuelve a la página 1 (el offset anterior
  // ya no aplica). El modo demo también reinicia para no arrastrar páginas del roster real.
  useEffect(() => {
    setPagina(1);
    setActionError(null);
  }, [qDebounced, filterEstado, filterModalidad, tamano, isDemoMode]);

  const handleRestaurarAlumno = async (alumnoId: string, e: MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await apiClient.patch(`/alumnos/${alumnoId}/restaurar`, {});
      // WU25a: la restauración mueve al alumno de pestaña; se recarga la página actual desde el
      // servidor en lugar de mutar la fila en memoria.
      recargar();
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : null;
      setActionError(mensaje || 'No se pudo restaurar al alumno. Inténtalo de nuevo.');
    }
  };

  // WU25a: KPIs reales de la cartera. Vienen del `resumen` del servidor (COUNT real, cartera
  // completa, independiente de la página y de los filtros); en demo se derivan del roster local
  // y sirven de respaldo si una respuesta no trae resumen.
  const kpis = useMemo(
    () => resumen ?? calcularResumenDirectorio(alumnos),
    [resumen, alumnos]
  );

  // WU25a: con paginación server-side la lista ya llega filtrada y recortada a la página actual.
  const hayFiltrosActivos = hayFiltrosDirectorioActivos(search, filterEstado, filterModalidad);

  const limpiarFiltros = useCallback(() => {
    setSearch('');
    setFilterEstado('todos');
    setFilterModalidad('todas');
  }, []);

  return {
    pagina,
    setPagina,
    tamano,
    setTamano,
    search,
    setSearch,
    filterEstado,
    setFilterEstado,
    filterModalidad,
    setFilterModalidad,
    alumnos,
    total,
    cargando,
    isLoading,
    error,
    recargar,
    resumen,
    kpis,
    hayFiltrosActivos,
    limpiarFiltros,
    actionError,
    handleRestaurarAlumno,
  };
}

export type DirectorioAlumnos = ReturnType<typeof useDirectorioAlumnos>;
