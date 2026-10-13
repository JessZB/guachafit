import { triggerHaptic } from '../../../lib/haptics';
import { offlineDb } from '../../../lib/offline-db';
import {
  EstadoSesion,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

interface OpcionesIniciar {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
  marcarInicioEnSerie: (serie: SerieRegistroDetalleDTO) => boolean;
}

/**
 * Afordancia explícita "Iniciar serie" (▶) para la serie pendiente que aún no tiene marca.
 * El envío viaja después dentro del MISMO batch de la serie (al completarla o ajustar el
 * temporizador): no se crean endpoints ni mutaciones parciales nuevas.
 */
export function useIniciarSerie({ sesion, setSesion, user, isDemoMode, marcarInicioEnSerie }: OpcionesIniciar) {
  const handleIniciarSerie = (ejercicioIndex: number, serieIndex: number) => {
    if (!sesion || sesion.estado !== EstadoSesion.EN_PROGRESO) return;
    const original = sesion.ejercicios[ejercicioIndex]?.series[serieIndex];
    if (!original) return;
    const serie = { ...original };
    if (!marcarInicioEnSerie(serie)) return;
    triggerHaptic('selection');

    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      ejercicios: sesion.ejercicios.map((ejercicio, indice) =>
        indice === ejercicioIndex
          ? {
              ...ejercicio,
              series: ejercicio.series.map((s, indiceSerie) =>
                indiceSerie === serieIndex ? serie : s
              ),
            }
          : ejercicio
      ),
    };
    setSesion(updated);

    // Modo demo: interacción local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    offlineDb.rutinaHoy
      .put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      })
      .catch(() => {});
  };

  return { handleIniciarSerie };
}
