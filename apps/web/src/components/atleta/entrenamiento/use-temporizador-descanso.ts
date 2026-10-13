import { useCallback, useState } from 'react';
import { generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { clonarSesionParaEdicion } from '../../../lib/sesion-estado';
import { normalizarKgParaContrato } from '../../../lib/weight-unit';
import {
  construirPayloadSerie,
  validarSerieParaEnviar,
} from '../../../lib/entrenamiento-series';
import { offlineDb } from '../../../lib/offline-db';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import type { ResultadoEnvio } from './use-envio-sesion';

interface OpcionesTemporizador {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
  marcarErrorInline: (clave: string, mensaje: string) => void;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  enviarOEncolar: <T>(
    sesionId: string,
    endpoint: string,
    method: 'POST' | 'PUT',
    payload: unknown,
    descripcion: string,
    idempotencyKey: string
  ) => Promise<ResultadoEnvio<T>>;
}

/** Cronómetro de descanso y cambio de duración (viaja como batch de la serie). */
export function useTemporizadorDescanso(opciones: OpcionesTemporizador) {
  const { sesion, setSesion, user, isDemoMode, marcarErrorInline, setBloqueo, enviarOEncolar } =
    opciones;
  const [isRestTimerOpen, setIsRestTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [activeSerieKey, setActiveSerieKey] = useState<{
    ejercicioIndex: number;
    serieIndex: number;
  } | null>(null);

  // Notificación de cambio de duración en el temporizador (Alumno ajusta descanso)
  const handleRestDurationChange = useCallback(
    async (newSeconds: number) => {
      setTimerSeconds(newSeconds);
      if (!activeSerieKey || !sesion) return;
      const { ejercicioIndex, serieIndex } = activeSerieKey;
      const ejercicio = sesion.ejercicios[ejercicioIndex];
      if (!ejercicio) return;
      const serie = ejercicio.series[serieIndex];
      if (!serie) return;

      if (serie.descansoSegundos === newSeconds) return;

      const updated = clonarSesionParaEdicion(sesion);
      updated.ejercicios[ejercicioIndex].series[serieIndex].descansoSegundos = newSeconds;
      setSesion(updated);

      // Modo demo: interacción local sin cache ni mutaciones reales.
      if (isDemoMode) return;

      offlineDb.rutinaHoy.put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      }).catch(() => {});

      // WU3b: un valor inválido jamás se envía a la API (validación contra el contrato).
      const errorSerie = validarSerieParaEnviar(serie);
      if (errorSerie) {
        marcarErrorInline(`${serie.id}:${errorSerie.campo}`, errorSerie.mensaje);
        return;
      }

      // D5: el cambio de descanso viaja (o se encola sin conexión) como cualquier serie.
      const payload = construirPayloadSerie(
        serie,
        normalizarKgParaContrato(serie.pesoKg),
        newSeconds,
        serie.completada
      );
      const nombreEjercicio = ejercicio.ejercicio?.nombre || `ejercicio ${ejercicioIndex + 1}`;
      const resultado = await enviarOEncolar(
        sesion.id,
        `/sesiones/${sesion.id}/series`,
        'PUT',
        payload,
        `Descanso de la serie ${serie.numeroSerie} de ${nombreEjercicio}`,
        generateIdempotencyKey()
      );
      if (resultado.estado === 'rechazado') {
        const bloqueoDetectado = resolverBloqueoAlumno(resultado.error);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          return;
        }
        marcarErrorInline(
          `${serie.id}:envio`,
          resultado.error instanceof Error && resultado.error.message
            ? resultado.error.message
            : 'No pudimos guardar el descanso de esta serie.'
        );
      }
    },
    [activeSerieKey, sesion, setSesion, user, isDemoMode, enviarOEncolar, marcarErrorInline, setBloqueo]
  );

  return {
    isRestTimerOpen,
    setIsRestTimerOpen,
    timerSeconds,
    setTimerSeconds,
    activeSerieKey,
    setActiveSerieKey,
    handleRestDurationChange,
  };
}
