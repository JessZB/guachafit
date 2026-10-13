/**
 * Hook de la serie completa de evolución corporal para el gráfico del tab Antropometría
 * (RF-004 RN-01).
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). Sin `controlesLimit`, el endpoint
 * devuelve la serie entera; solo se consulta al abrir el tab. Un fallo se declara y la
 * tabla paginada sigue disponible.
 */
import { useEffect, useState } from 'react';
import type { ControlAntropometricoDetalleDTO, EvolucionCorporalDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { crearEvolucionDemo } from '../../../lib/demo-evolucion';

export interface ParametrosSerieEvolucion {
  /** El tab activo de la ficha; solo se carga al abrir `antropometria`. */
  tabActivo: string;
  usuarioId: string | undefined;
  isDemoMode: boolean;
}

export function useSerieEvolucion({ tabActivo, usuarioId, isDemoMode }: ParametrosSerieEvolucion) {
  // RF-004: serie COMPLETA de controles aprobados para el gráfico del tab. La tabla pagina, pero
  // el gráfico necesita la serie entera para no dibujar una tendencia recortada en silencio.
  const [evaluacionesGrafico, setEvaluacionesGrafico] = useState<ControlAntropometricoDetalleDTO[]>([]);
  const [isCargandoGrafico, setIsCargandoGrafico] = useState(false);
  const [graficoErrorMsg, setGraficoErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tabActivo !== 'antropometria' || !usuarioId) return;
    let cancelado = false;

    const cargarSerieGrafico = async () => {
      setIsCargandoGrafico(true);
      setGraficoErrorMsg(null);
      try {
        const serie = isDemoMode
          ? crearEvolucionDemo(usuarioId).evaluaciones
          : (await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${usuarioId}`))
              .evaluaciones;
        if (!cancelado) setEvaluacionesGrafico(serie);
      } catch {
        if (!cancelado) {
          setEvaluacionesGrafico([]);
          setGraficoErrorMsg('No se pudo cargar la serie completa del gráfico.');
        }
      } finally {
        if (!cancelado) setIsCargandoGrafico(false);
      }
    };

    void cargarSerieGrafico();
    return () => {
      cancelado = true;
    };
  }, [tabActivo, usuarioId, isDemoMode]);

  return { evaluacionesGrafico, isCargandoGrafico, graficoErrorMsg };
}

export type RetornoSerieEvolucion = ReturnType<typeof useSerieEvolucion>;
