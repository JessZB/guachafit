/**
 * Carga de las metas nutricionales del alumno (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: mismo mecanismo de datos
 * (R9: `apiClient` + `useState`, sin TanStack Query) con descarte de la
 * respuesta tardía al cambiar de alumno. El 204 (aún sin metas) se resuelve
 * como null: estado "Sin metas configuradas", nunca un 0 fabricado.
 */
import { useCallback, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { crearMetasNutricionalesDemo } from '../../../lib/demo-nutricion';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';

export function useMetasNutricionAlumno({
  alumnoUsuarioId,
  isDemoMode,
}: {
  alumnoUsuarioId: string;
  isDemoMode: boolean;
}) {
  const [metas, setMetas] = useState<MetasNutricionalesDetalleDTO | null>(null);
  /** `true` tras una carga exitosa (incluido "sin metas"): sin ella no se conoce qué PDFs hay. */
  const [isMetasCargadas, setIsMetasCargadas] = useState(false);
  const [isCargandoMetas, setIsCargandoMetas] = useState(false);
  const [metasError, setMetasError] = useState<string | null>(null);

  // Solo la carga más reciente escribe el estado: al cambiar de alumno con una carga en vuelo, la
  // respuesta tardía del anterior se descarta.
  const turnoMetasRef = useRef(0);

  const cargarMetas = useCallback(async () => {
    const turno = ++turnoMetasRef.current;
    const vigente = () => turno === turnoMetasRef.current;
    if (isDemoMode) {
      setMetas(crearMetasNutricionalesDemo(alumnoUsuarioId));
      setMetasError(null);
      setIsMetasCargadas(true);
      return;
    }
    setIsCargandoMetas(true);
    setMetasError(null);
    try {
      // 204 (aún sin metas) se resuelve como null: estado "Sin metas configuradas".
      const data = await apiClient<MetasNutricionalesDetalleDTO | null>(
        `/nutricion/alumnos/${alumnoUsuarioId}/metas`
      );
      if (!vigente()) return;
      setMetas(data ?? null);
      setIsMetasCargadas(true);
    } catch (err: any) {
      if (!vigente()) return;
      setMetas(null);
      setIsMetasCargadas(false);
      setMetasError(
        err?.message || 'No se pudieron cargar las metas del alumno. Inténtalo de nuevo.'
      );
    } finally {
      if (vigente()) setIsCargandoMetas(false);
    }
  }, [alumnoUsuarioId, isDemoMode]);

  /** Tras un PUT exitoso el editor entrega lo guardado: reemplaza lo cargado sin error. */
  const aplicarMetasGuardadas = (guardadas: MetasNutricionalesDetalleDTO) => {
    setMetas(guardadas);
    setMetasError(null);
  };

  return {
    metas,
    isMetasCargadas,
    isCargandoMetas,
    metasError,
    cargarMetas,
    aplicarMetasGuardadas,
  };
}
