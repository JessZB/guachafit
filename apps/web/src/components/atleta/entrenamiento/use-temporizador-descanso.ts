import { useCallback, useEffect, useMemo } from 'react';
import { generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { clonarSesionParaEdicion } from '../../../lib/sesion-estado';
import {
  construirPayloadSerie,
  validarSerieParaEnviar,
} from '../../../lib/entrenamiento-series';
import { offlineDb } from '../../../lib/offline-db';
import { avisarFinDescanso, desbloquearAudio } from '../../../lib/aviso-descanso';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import type { ResultadoEnvio } from './use-envio-sesion';
import { useCronometroDescanso, type CronometroDescanso } from './use-cronometro-descanso';

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

export interface PosicionSerie {
  ejercicioIndex: number;
  serieIndex: number;
}

/** Índices actuales de una serie por su `id` (la persistencia usa ids, nunca índices). */
function posicionDeSerie(
  sesion: SesionEntrenamientoDetalleDTO | null,
  serieId: string | null
): PosicionSerie | null {
  if (!sesion || !serieId) return null;
  for (let ejercicioIndex = 0; ejercicioIndex < sesion.ejercicios.length; ejercicioIndex += 1) {
    const serieIndex = sesion.ejercicios[ejercicioIndex].series.findIndex((s) => s.id === serieId);
    if (serieIndex !== -1) return { ejercicioIndex, serieIndex };
  }
  return null;
}

/**
 * Cronómetro de descanso (`useCronometroDescanso`) conectado a la sesión: abre el descanso de una
 * serie o uno libre desde el botón flotante, avisa al terminar y guarda el cambio de duración que el
 * alumno hace sobre el descanso de una serie (viaja como batch de la serie).
 */
export function useTemporizadorDescanso(opciones: OpcionesTemporizador) {
  const { sesion, setSesion, user, isDemoMode, marcarErrorInline, setBloqueo, enviarOEncolar } =
    opciones;

  // Cambio de duración ya con debounce (1 s, valor final): el cronómetro libre nunca llega aquí.
  // La serie se resuelve a índices solo ahora; si ya no existe, no se envía nada.
  const guardarDescansoSerie = useCallback(
    async (serieId: string, newSeconds: number) => {
      if (!sesion) return;
      const posicion = posicionDeSerie(sesion, serieId);
      if (!posicion) return;
      const { ejercicioIndex, serieIndex } = posicion;
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
        null, // el peso efectivo (propio o del plan) lo deriva `construirPayloadSerie`
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
    [sesion, setSesion, user, isDemoMode, enviarOEncolar, marcarErrorInline, setBloqueo]
  );

  // Modo demo: el cronómetro funciona en memoria (`persistir=false`) y no envía nada.
  const cronometro = useCronometroDescanso({
    sesionId: sesion?.id ?? null,
    persistir: !isDemoMode,
    alTerminar: avisarFinDescanso,
    alCambiarDuracion: guardarDescansoSerie,
  });
  const { abierto, serieId, abrirParaSerie, abrirLibre, pausar, cerrar } = cronometro;

  // Con la sesión terminada (COMPLETADA u OMITIDA) no hay descanso que medir. Se cierra por
  // `cerrar()`, que además borra la clave: así cubre tanto el cierre en esta pantalla como la carga
  // de una sesión ya terminada con un descanso vigente persistido. (La regla de PLANIFICADA vive
  // en `useVistaSesion`; aquí no se duplica.)
  const estadoSesion = sesion?.estado;
  const sesionId = sesion?.id;
  useEffect(() => {
    if (estadoSesion === EstadoSesion.COMPLETADA || estadoSesion === EstadoSesion.OMITIDA) cerrar();
  }, [sesionId, estadoSesion, cerrar]);

  // Los gestos del alumno (marcar una serie, abrir el cronómetro) desbloquean el audio del aviso.
  const abrirCronometroParaSerie = useCallback(
    (idSerie: string, segundos: number) => {
      desbloquearAudio();
      abrirParaSerie(idSerie, segundos);
    },
    [abrirParaSerie]
  );
  // Botón flotante: abre el cronómetro libre (sin serie, nunca envía) y lo deja EN PAUSA para que
  // el alumno elija el tiempo; los presets arrancan al elegirse. Cerrarlo es la X del widget. La
  // composición es síncrona porque `pausar` lee el estado recién creado de `estadoRef`.
  const abrirCronometroEnPausa = useCallback(() => {
    desbloquearAudio();
    abrirLibre();
    pausar();
  }, [abrirLibre, pausar]);
  // Serie vigente del cronómetro, derivada de su `serieId` (la rama "no cerrar" del rechazo la lee).
  const activeSerieKey = useMemo(
    () => (abierto ? posicionDeSerie(sesion, serieId) : null),
    [abierto, sesion, serieId]
  );

  // Reanudar, reiniciar, ajustar y elegir preset también son gestos del alumno: desbloquean el audio.
  const cronometroUi: CronometroDescanso = {
    ...cronometro,
    reanudar: () => {
      desbloquearAudio();
      cronometro.reanudar();
    },
    reiniciar: () => {
      desbloquearAudio();
      cronometro.reiniciar();
    },
    elegirPreset: (segundos) => {
      desbloquearAudio();
      cronometro.elegirPreset(segundos);
    },
    ajustar: (deltaSegundos) => {
      desbloquearAudio();
      cronometro.ajustar(deltaSegundos);
    },
  };

  return {
    cronometro: cronometroUi,
    isRestTimerOpen: abierto,
    activeSerieKey,
    abrirCronometroParaSerie,
    abrirCronometroEnPausa,
    cerrarCronometro: cerrar,
  };
}
