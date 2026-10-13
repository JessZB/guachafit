/**
 * Carga de los reportes nutricionales del alumno (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: mismo mecanismo de datos
 * (R9: `apiClient` + `useState`, sin TanStack Query) con descarte de la
 * respuesta tardía al cambiar de alumno. El listado del endpoint no es
 * paginado server-side: se consulta la ventana declarada de 30 días.
 */
import { useCallback, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { sumarDiasCalendario } from '../../../lib/date-format';
import { checkinsNutricionalesDemo } from '../../../lib/demo-nutricion';
import type { CheckinNutricionalDetalleDTO } from '@guachafit/shared';

/** Ventana de consulta del calendario (días hacia atrás desde hoy, inclusive). */
export const DIAS_VENTANA_NUTRICION = 30;

export function useCheckinsNutricionAlumno({
  alumnoUsuarioId,
  isDemoMode,
  hoyLocal,
}: {
  alumnoUsuarioId: string;
  isDemoMode: boolean;
  hoyLocal: string;
}) {
  const [checkins, setCheckins] = useState<CheckinNutricionalDetalleDTO[]>([]);
  const [isCargandoCheckins, setIsCargandoCheckins] = useState(false);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);

  // Solo la carga más reciente escribe el estado: al cambiar de alumno con una carga en vuelo, la
  // respuesta tardía del anterior se descarta.
  const turnoCheckinsRef = useRef(0);

  const cargarCheckins = useCallback(async () => {
    const turno = ++turnoCheckinsRef.current;
    const vigente = () => turno === turnoCheckinsRef.current;
    if (isDemoMode) {
      setCheckins(checkinsNutricionalesDemo(alumnoUsuarioId));
      setCheckinsError(null);
      return;
    }
    setIsCargandoCheckins(true);
    setCheckinsError(null);
    try {
      const desde = sumarDiasCalendario(hoyLocal, -(DIAS_VENTANA_NUTRICION - 1));
      const data = await apiClient<CheckinNutricionalDetalleDTO[]>(
        `/nutricion/alumnos/${alumnoUsuarioId}/checkins?desde=${desde}&hasta=${hoyLocal}`
      );
      if (!vigente()) return;
      setCheckins(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (!vigente()) return;
      setCheckins([]);
      setCheckinsError(
        err?.message || 'No se pudieron cargar los reportes del alumno. Inténtalo de nuevo.'
      );
    } finally {
      if (vigente()) setIsCargandoCheckins(false);
    }
  }, [alumnoUsuarioId, isDemoMode, hoyLocal]);

  return { checkins, isCargandoCheckins, checkinsError, cargarCheckins };
}
