/**
 * Módulo `monitor-adherencia` · hook de datos del modal "Actividad de {alumno}".
 *
 * Extraído verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:128-195`
 * (estado + `cargarHistorial` + `puedeVerMas`).
 *
 * - MISMO mecanismo que hoy (R9): `apiClient` contra
 *   `GET /sesiones/alumno/:alumnoId/historial?limit&offset`; en demo corta el fixture
 *   local con la misma aritmética. "Ver más" ACUMULA en pantalla hasta el `total` real.
 * - La sesión más reciente arranca expandida; después el acordeón queda libre.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  HistorialSesionesAlumnoDTO,
  MonitorAdherenciaSemanalDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { apiClient, ApiError } from '../../../lib/api-client';
import { rebanarPagina } from '../../../lib/paginacion';
import { sesionesDemoAlumno } from '../../../lib/demo-sesiones';

/**
 * WU25a: tamaño de página del historial del modal de actividad. El endpoint acepta `limit` hasta
 * 100 y ahora también `offset` + `total`, así que "Ver más" avanza por offset sin escalones.
 */
export const TAMANO_HISTORIAL_ACTIVIDAD = 10;

export function useHistorialActividad({
  alumno,
  isDemoMode,
}: {
  alumno: MonitorAdherenciaSemanalDTO;
  isDemoMode: boolean;
}) {
  const [sesiones, setSesiones] = useState<SesionEntrenamientoDetalleDTO[]>([]);
  const [totalHistorial, setTotalHistorial] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMas, setIsLoadingMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesionExpandidaId, setSesionExpandidaId] = useState<string | null>(null);

  /**
   * WU25a: el endpoint `historial` devuelve `{ items, total, limit, offset }`. `offset` avanza
   * por bloques de `TAMANO_HISTORIAL_ACTIVIDAD` y "Ver más" ACUMULA en pantalla hasta `total`;
   * en demo se corta el fixture local con la misma aritmética.
   */
  const cargarHistorial = useCallback(
    async (offset: number, acumular: boolean) => {
      if (acumular) {
        setIsLoadingMas(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      try {
        const pagina = Math.floor(offset / TAMANO_HISTORIAL_ACTIVIDAD) + 1;

        if (isDemoMode) {
          const fixture = sesionesDemoAlumno(alumno.alumnoId);
          const items = rebanarPagina(fixture, pagina, TAMANO_HISTORIAL_ACTIVIDAD);
          setSesiones((prev) => (acumular ? [...prev, ...items] : items));
          setTotalHistorial(fixture.length);
          return;
        }

        // El endpoint resuelve el perfil por `perfiles_alumno.id` o por `usuarioId`; se usa
        // `alumnoId` (usuarioId, siempre presente en el DTO) para no depender del opcional.
        const data = await apiClient<HistorialSesionesAlumnoDTO>(
          `/sesiones/alumno/${encodeURIComponent(alumno.alumnoId)}/historial?limit=${TAMANO_HISTORIAL_ACTIVIDAD}&offset=${offset}`
        );
        const items = Array.isArray(data?.items) ? data.items : [];
        setSesiones((prev) => (acumular ? [...prev, ...items] : items));
        setTotalHistorial(Number(data?.total ?? items.length));
      } catch (err) {
        const detalle =
          err instanceof ApiError
            ? err.problem?.detail || err.message
            : 'No pudimos cargar la actividad del alumno.';
        setError(detalle);
      } finally {
        setIsLoading(false);
        setIsLoadingMas(false);
      }
    },
    [alumno.alumnoId, isDemoMode]
  );

  useEffect(() => {
    void cargarHistorial(0, false);
  }, [cargarHistorial]);

  /** WU25a: hay más historial mientras la lista en pantalla no alcance el total real. */
  const puedeVerMas = sesiones.length < totalHistorial;

  // La sesión más reciente arranca expandida; después el acordeón queda libre.
  useEffect(() => {
    setSesionExpandidaId(sesiones[0]?.id ?? null);
  }, [sesiones]);

  return {
    sesiones,
    totalHistorial,
    isLoading,
    isLoadingMas,
    error,
    sesionExpandidaId,
    setSesionExpandidaId,
    cargarHistorial,
    puedeVerMas,
  };
}
