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
 * - Mis alumnos (2026-10-19): el orden es parte del estado y de la clave de caché; en demo se
 *   ordena con `ordenarAlumnosDirectorio` antes de paginar.
 */

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import {
  OrdenDirectorioAlumnos,
  type AlumnoDirectorioItemDTO,
  type DirectorioAlumnosDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  calcularResumenDirectorio,
  filtrarDirectorioDemo,
  ROSTER_DEMO_DIRECTORIO,
  type FiltroEstadoDirectorio,
  type FiltroModalidadDirectorio,
} from '../../../lib/directorio-alumnos';
import { ordenarAlumnosDirectorio } from '../../../lib/alumnos-directorio-actividad';
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
  // Mis alumnos (2026-10-19): la vista arranca en "Vigentes" (sin bajas lógicas), modalidad
  // "Todas" y orden "Alta más reciente".
  const [filterEstado, setFilterEstado] = useState<FiltroEstadoDirectorio>('vigentes');
  const [filterModalidad, setFilterModalidad] = useState<FiltroModalidadDirectorio>('todas');
  const [orden, setOrden] = useState<OrdenDirectorioAlumnos>(OrdenDirectorioAlumnos.ALTA_RECIENTE);
  // D5: fallo de mutación visible; nunca éxito falso ni alumno fantasma.
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * WU25a: carga de UNA página del directorio. Los filtros viajan al servidor (`q`, `estado`,
   * `modalidad`, `soloArchivados`, `semaforoPago`) junto con el `orden`, y el `resumen` sigue
   * llegando completo en cada respuesta para los chips. En modo demo se filtra, se ordena y se
   * corta el roster local con la MISMA semántica, sin llamadas API.
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
        const ordenados = ordenarAlumnosDirectorio(filtrados, orden, new Date());
        return {
          items: rebanarPagina(ordenados, paginaSolicitada, tamanoSolicitado),
          total: ordenados.length,
          limit: tamanoSolicitado,
          offset,
          // El resumen demo siempre describe la cartera completa, como el servidor.
          resumen: calcularResumenDirectorio(ROSTER_DEMO_DIRECTORIO),
        };
      }

      const parametros = construirParametrosDirectorioAlumnos({
        tamano: tamanoSolicitado,
        pagina: paginaSolicitada,
        q: qDebounced,
        estado: filterEstado,
        modalidad: filterModalidad,
        orden,
      });

      return apiClient<DirectorioAlumnosDTO>(`/alumnos?${parametros.toString()}`, { signal });
    },
    [isDemoMode, qDebounced, filterEstado, filterModalidad, orden]
  );

  const paginacion = usePaginacionServidor<AlumnoDirectorioItemDTO, DirectorioAlumnosDTO>({
    // La clave incluye los filtros y el orden: cada combinación tiene su propia caché y su página.
    clave: [
      'directorio-alumnos',
      isDemoMode ? 'demo' : 'real',
      qDebounced.trim(),
      filterEstado,
      filterModalidad,
      orden,
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
  // Sin respuesta todavía el resumen es null: los chips no muestran conteo (nunca un "0" falso).
  const resumen = respuesta?.resumen ?? null;
  // Solo la PRIMERA carga (sin datos en pantalla) muestra esqueletos; los cambios de página
  // conservan la lista anterior gracias a `keepPreviousData`.
  const isLoading = cargando && !respuesta;
  const error = errorCarga?.message ?? null;

  // WU25a: cualquier cambio de búsqueda/filtro/orden/tamaño vuelve a la página 1 (el offset
  // anterior ya no aplica). El modo demo también reinicia para no arrastrar páginas del roster real.
  useEffect(() => {
    setPagina(1);
    setActionError(null);
  }, [qDebounced, filterEstado, filterModalidad, orden, tamano, isDemoMode]);

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

  // WU25a: con paginación server-side la lista ya llega filtrada y recortada a la página actual.
  const hayFiltrosActivos = hayFiltrosDirectorioActivos(search, filterEstado, filterModalidad);

  // Mis alumnos (2026-10-19): limpiar restaura búsqueda, "Vigentes" y "Todas"; el orden se conserva.
  const limpiarFiltros = useCallback(() => {
    setSearch('');
    setFilterEstado('vigentes');
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
    orden,
    setOrden,
    alumnos,
    total,
    cargando,
    isLoading,
    error,
    // F3: con datos ya en pantalla, un error de la consulta no sustituye la lista.
    hayDatos: respuesta !== undefined,
    recargar,
    resumen,
    hayFiltrosActivos,
    limpiarFiltros,
    actionError,
    handleRestaurarAlumno,
  };
}

export type DirectorioAlumnos = ReturnType<typeof useDirectorioAlumnos>;
