/**
 * Hook del historial de sesiones de entrenamiento del alumno (WU25b, N4, WU5).
 *
 * Historial paginado manual con el MISMO mecanismo que hoy (`apiClient` + estado local;
 * R9: sin TanStack ni `usePaginacionServidor`). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-6).
 *
 * Real: `GET /sesiones/alumno/:id/historial?limit&offset` (envelope `{ items, total, … }`).
 * Demo: slice del fixture local con la misma aritmética. Si la consulta falla se conserva
 * lo ya cargado y el error queda visible; cuando el total real encoge por debajo de la
 * página activa, se ajusta a la última página válida.
 */
import { useState } from 'react';
import type {
  HistorialSesionesAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { calcularTotalPaginas, rebanarPagina } from '../../../lib/paginacion';
import { sesionesDemoAlumno } from '../../../lib/demo-sesiones';
import { TAMANO_PAGINA_FICHA } from '../../../lib/alumno-detalle-controles';

export interface ParametrosHistorialSesiones {
  alumnoId: string | undefined;
  isDemoMode: boolean;
}

export function useHistorialSesiones({ alumnoId, isDemoMode }: ParametrosHistorialSesiones) {
  const [ultimaSesion, setUltimaSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  // WU25b: historial paginado server-side (envelope `{ items, total, limit, offset }`); la
  // página se resuelve con limit/offset y el total real del alumno viene del servidor.
  const [historialSesiones, setHistorialSesiones] = useState<SesionEntrenamientoDetalleDTO[]>([]);
  const [historialTotal, setHistorialTotal] = useState(0);
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  const [tamanoHistorial, setTamanoHistorial] = useState(TAMANO_PAGINA_FICHA);
  const [isCargandoHistorial, setIsCargandoHistorial] = useState(false);
  // N4: fallo de carga visible (sin tragarse el fallo ni vaciar lo ya cargado).
  const [historialError, setHistorialError] = useState<string | null>(null);

  /**
   * WU25b: carga UNA página del historial de sesiones.
   *
   * - Real: `GET /sesiones/alumno/:id/historial?limit&offset` (envelope `{ items, total, … }`).
   * - Demo: corta el fixture local (`sesionesDemoAlumno`) con la misma aritmética.
   * N4: si la consulta falla se conserva lo ya cargado y el error queda visible; cuando el total
   * real encoge por debajo de la página activa, se ajusta a la última página válida.
   */
  const cargarHistorial = async (
    paginaSolicitada: number,
    tamanoSolicitado: number,
    reintento = false
  ) => {
    if (!alumnoId) return;
    setIsCargandoHistorial(true);
    setHistorialError(null);
    try {
      if (isDemoMode) {
        const fixture = sesionesDemoAlumno(alumnoId);
        setHistorialSesiones(rebanarPagina(fixture, paginaSolicitada, tamanoSolicitado));
        setHistorialTotal(fixture.length);
        return;
      }
      const offset = (Math.max(1, paginaSolicitada) - 1) * Math.max(1, tamanoSolicitado);
      const res = await apiClient<HistorialSesionesAlumnoDTO>(
        `/sesiones/alumno/${alumnoId}/historial?limit=${tamanoSolicitado}&offset=${offset}`
      );
      const items = Array.isArray(res?.items) ? res.items : [];
      const total = Number(res?.total ?? items.length);
      setHistorialSesiones(items);
      setHistorialTotal(total);
      const totalPaginas = calcularTotalPaginas(total, tamanoSolicitado);
      if (paginaSolicitada > totalPaginas && !reintento) {
        setPaginaHistorial(totalPaginas);
        void cargarHistorial(totalPaginas, tamanoSolicitado, true);
      }
    } catch (err: unknown) {
      setHistorialError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el historial. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoHistorial(false);
    }
  };

  const cambiarPaginaHistorial = (nuevaPagina: number) => {
    setPaginaHistorial(nuevaPagina);
    void cargarHistorial(nuevaPagina, tamanoHistorial);
  };

  const cambiarTamanoHistorial = (nuevoTamano: number) => {
    setTamanoHistorial(nuevoTamano);
    setPaginaHistorial(1);
    void cargarHistorial(1, nuevoTamano);
  };

  return {
    ultimaSesion,
    setUltimaSesion,
    historialSesiones,
    historialTotal,
    paginaHistorial,
    setPaginaHistorial,
    tamanoHistorial,
    isCargandoHistorial,
    historialError,
    cargarHistorial,
    cambiarPaginaHistorial,
    cambiarTamanoHistorial,
  };
}

export type RetornoHistorialSesiones = ReturnType<typeof useHistorialSesiones>;
