/**
 * Lote E10 · módulo `asignacion-masiva-plantilla` (hook de datos).
 *
 * Detalle de la plantilla para el paso "Revisar y ajustar" de la asignación masiva. Se pide al
 * montar con `GET /plantillas/:id`; en modo demo sale de los datos locales sin llamada API
 * (mismo mecanismo que `selector-plantilla-asignacion/use-plantillas-selector`, R9). Si la demo
 * no tiene detalle de esa plantilla, `sinVistaPreviaDemo` lo indica y no es un error.
 */
import { useEffect, useRef, useState } from 'react';
import type { PlantillaRutinaDTO } from '@guachafit/shared';
import { apiClient, ErrorTiempoAgotado } from '../../../lib/api-client';
import { detallePlantillaDemo } from '../../../lib/demo-plantillas';
import { esMensajeAmigable } from '../../../lib/mensajes-error';

/** Límite de la lectura del detalle: al vencer, el paso 2 muestra el error con «Reintentar». */
const TIEMPO_LIMITE_DETALLE_MS = 15_000;
const MENSAJE_CARGA_DETALLE = 'No se pudo cargar el detalle de la plantilla.';

/**
 * Texto del error de carga: un mensaje del servidor amigable pasa tal cual y el técnico se cambia
 * por el genérico. Un tiempo agotado también usa el genérico, porque `ErrorTiempoAgotado` habla de
 * «no pudimos confirmar si se guardó», que no aplica a una lectura.
 */
function mensajeErrorCarga(err: unknown): string {
  if (err instanceof ErrorTiempoAgotado) return MENSAJE_CARGA_DETALLE;
  const mensaje = err instanceof Error ? err.message : undefined;
  return esMensajeAmigable(mensaje) ? mensaje.trim() : MENSAJE_CARGA_DETALLE;
}

export function useDetallePlantillaAsignacion({
  plantillaId,
  isDemoMode,
}: {
  plantillaId: string;
  isDemoMode: boolean;
}) {
  const [detalle, setDetalle] = useState<PlantillaRutinaDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinVistaPreviaDemo, setSinVistaPreviaDemo] = useState(false);
  const solicitudActual = useRef(0);

  const cargar = async () => {
    const idSolicitud = ++solicitudActual.current;
    setError(null);
    setSinVistaPreviaDemo(false);

    // MODO DEMO EXPLÍCITO (isDemoMode): el detalle sale del fixture local, sin llamada API.
    if (isDemoMode) {
      const demo = detallePlantillaDemo(plantillaId) ?? null;
      setDetalle(demo);
      setSinVistaPreviaDemo(demo === null);
      setCargando(false);
      return;
    }

    setCargando(true);
    try {
      const res = await apiClient<PlantillaRutinaDTO>(`/plantillas/${plantillaId}`, {
        tiempoLimiteMs: TIEMPO_LIMITE_DETALLE_MS,
      });
      // Una respuesta vieja (reintento ya lanzado) no pisa la actual.
      if (idSolicitud !== solicitudActual.current) return;
      setDetalle(res);
    } catch (err: unknown) {
      if (idSolicitud !== solicitudActual.current) return;
      setDetalle(null);
      setError(mensajeErrorCarga(err));
    } finally {
      if (idSolicitud === solicitudActual.current) setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillaId, isDemoMode]);

  return {
    detalle,
    cargando,
    error,
    sinVistaPreviaDemo,
    reintentar: () => void cargar(),
  };
}
