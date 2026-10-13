import { useCallback } from 'react';
import { generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { clonarSesionParaEdicion } from '../../../lib/sesion-estado';
import { triggerHaptic } from '../../../lib/haptics';
import { offlineDb } from '../../../lib/offline-db';
import { estimarCumpleRachaPorVolumen } from '../../../lib/racha';
import { normalizarKgParaContrato } from '../../../lib/weight-unit';
import {
  construirPayloadSerie,
  revertirSerieRechazada,
  validarSerieParaEnviar,
} from '../../../lib/entrenamiento-series';
import {
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { MutableRefObject } from 'react';
import type { PosicionFoco } from '../../../lib/modo-foco';
import type { EnviarOEncolarFn } from './use-envio-sesion';

interface OpcionesMarcado {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (
    sesion:
      | SesionEntrenamientoDetalleDTO
      | null
      | ((actual: SesionEntrenamientoDetalleDTO | null) => SesionEntrenamientoDetalleDTO | null)
  ) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
  marcarErrorInline: (clave: string, mensaje: string) => void;
  limpiarErrorInline: (clave: string) => void;
  limpiarBorrador: (clave: string) => void;
  cerrarCorreccionSerie: (serieId: string) => void;
  setTimerSeconds: (segundos: number) => void;
  setActiveSerieKey: (clave: { ejercicioIndex: number; serieIndex: number } | null) => void;
  setIsRestTimerOpen: (abierto: boolean) => void;
  setActionError: (mensaje: string | null) => void;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  cacheSesion: (data: SesionEntrenamientoDetalleDTO) => Promise<void>;
  enviarOEncolar: EnviarOEncolarFn;
  posicionFocoVigente: MutableRefObject<PosicionFoco | null>;
  serieDelCronometroVigente: MutableRefObject<{ ejercicioIndex: number; serieIndex: number } | null>;
}

/** Marcar/desmarcar serie con reversión ante rechazo del servidor (D6). */
export function useMarcadoSerie(opciones: OpcionesMarcado) {
  const {
    sesion,
    setSesion,
    user,
    isDemoMode,
    marcarErrorInline,
    limpiarErrorInline,
    limpiarBorrador,
    cerrarCorreccionSerie,
    setTimerSeconds,
    setActiveSerieKey,
    setIsRestTimerOpen,
    setActionError,
    setBloqueo,
    cacheSesion,
    enviarOEncolar,
    posicionFocoVigente,
    serieDelCronometroVigente,
  } = opciones;

  // Toggle set completion and trigger rest timer
  const handleToggleSet = useCallback(
    async (ejercicioIndex: number, serieIndex: number) => {
      if (!sesion) return;
      const updated = clonarSesionParaEdicion(sesion);
      const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
      const willBeCompleted = !serie.completada;
      // D6: copia previa para revertir si el servidor rechaza la serie (4xx con conexión).
      const serieAntes: SerieRegistroDetalleDTO = { ...serie };
      const porcentajeAntes = sesion.porcentajeCumplimiento;
      const rachaAntes = sesion.cumpleReglaRacha;
      limpiarErrorInline(`${serie.id}:envio`);

      // WU3b: sin valores válidos no se marca ni se envía/encola nada (error inline visible).
      const errorSerie = validarSerieParaEnviar(serie);
      if (errorSerie) {
        marcarErrorInline(`${serie.id}:${errorSerie.campo}`, errorSerie.mensaje);
        triggerHaptic('warning');
        return;
      }
      const pesoNormalizado = normalizarKgParaContrato(serie.pesoKg);

      serie.completada = willBeCompleted;
      if (willBeCompleted) {
        cerrarCorreccionSerie(serie.id); // al volver a completarla se compacta de nuevo
        serie.timestampCompletadaUtc = new Date().toISOString();
        triggerHaptic('success');

        // Pre-rellenado inteligente: si la siguiente serie del ejercicio no tiene peso asignado,
        // hereda automáticamente el peso y repeticiones de la serie que se acaba de completar
        const seriesDelEjercicio = updated.ejercicios[ejercicioIndex].series;
        const nextSerie = seriesDelEjercicio[serieIndex + 1];
        if (
          nextSerie &&
          !nextSerie.completada &&
          (!nextSerie.pesoKg || nextSerie.pesoKg === '0.00' || nextSerie.pesoKg === '')
        ) {
          if (serie.pesoKg && serie.pesoKg !== '0.00') {
            nextSerie.pesoKg = serie.pesoKg;
          }
          if (serie.repsLogradas !== null && serie.repsLogradas !== undefined) {
            nextSerie.repsLogradas = serie.repsLogradas;
          }
        }

        // Descanso prescrito para este ejercicio (o 90s por defecto)
        const prescrito = updated.ejercicios[ejercicioIndex].descansoPrescritoSegundos || 90;
        serie.descansoSegundos = serie.descansoSegundos ?? prescrito;

        // Iniciar el temporizador con el tiempo del ejercicio
        setTimerSeconds(serie.descansoSegundos);
        setActiveSerieKey({ ejercicioIndex, serieIndex });
        setIsRestTimerOpen(true);
      } else {
        triggerHaptic('light');
      }

      // Recompute compliance percentage
      let totalSeries = 0;
      let completedSeries = 0;
      updated.ejercicios.forEach((e) => {
        e.series.forEach((s) => {
          totalSeries++;
          if (s.completada) completedSeries++;
        });
      });
      const pct = totalSeries > 0 ? ((completedSeries / totalSeries) * 100).toFixed(2) : '0.00';
      updated.porcentajeCumplimiento = pct;
      // D8 (RN-02): la estimación local usa la MISMA regla que el servidor (volumen ponderado
      // con fallback a series), no un simple % de series; el servidor sigue siendo la autoridad.
      updated.cumpleReglaRacha = estimarCumpleRachaPorVolumen(
        updated.ejercicios.flatMap((e) => e.series)
      );

      setSesion(updated);

      // WU3b: al marcar la serie, el texto en edición se reemplaza por el valor canónico persistido.
      limpiarBorrador(`${serie.id}:pesoKg`);
      limpiarBorrador(`${serie.id}:rpe`);
      limpiarBorrador(`${serie.id}:repsLogradas`);

      // Modo demo: interacción local sin cache ni mutaciones reales.
      if (isDemoMode) return;

      // Save to IndexedDB
      await offlineDb.rutinaHoy.put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      });

      // Sync or queue outbox batch
      const payload = construirPayloadSerie(
        serie,
        pesoNormalizado,
        serie.descansoSegundos ?? null,
        willBeCompleted
      );

      // WU4: misma key para el intento directo y un eventual encolado (defensa de idempotencia).
      const nombreEjercicio =
        updated.ejercicios[ejercicioIndex].ejercicio?.nombre || `ejercicio ${ejercicioIndex + 1}`;
      const resultado = await enviarOEncolar(
        sesion.id,
        `/sesiones/${sesion.id}/series`,
        'PUT',
        payload,
        `Serie ${serie.numeroSerie} de ${nombreEjercicio}`,
        generateIdempotencyKey()
      );

      if (resultado.estado !== 'rechazado') return;

      // RF-012: un bloqueo no se encola; se muestra la pantalla informativa.
      const bloqueoDetectado = resolverBloqueoAlumno(resultado.error);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        return;
      }

      // D6: rechazo de datos con conexión → la serie vuelve a como estaba y el error se ve junto a ella.
      // Solo se revierte lo que tocó el marcado: el peso, las reps o el RPE editados mientras el
      // envío estaba en vuelo se conservan (revisión E7, W1).
      setSesion((actual) => {
        if (!actual || actual.id !== updated.id) return actual;
        const revertida = revertirSerieRechazada(actual, {
          ejercicioIndex,
          serieIndex,
          serieAntes,
          porcentajeAntes,
          rachaAntes,
        });
        void cacheSesion(revertida);
        return revertida;
      });
      const cronometro = serieDelCronometroVigente.current;
      if (
        willBeCompleted &&
        cronometro?.ejercicioIndex === ejercicioIndex &&
        cronometro?.serieIndex === serieIndex
      ) {
        setIsRestTimerOpen(false);
        setActiveSerieKey(null);
      }
      triggerHaptic('warning');
      const mensajeRechazo =
        resultado.error instanceof Error && resultado.error.message
          ? resultado.error.message
          : 'No pudimos guardar esta serie. Inténtalo de nuevo.';
      marcarErrorInline(`${serie.id}:envio`, mensajeRechazo);
      // Lote E5: en modo foco solo se ve una serie; si la rechazada es otra, el aviso sube al
      // banner para que no quede sin superficie (el error inline sigue en su fila).
      const foco = posicionFocoVigente.current;
      if (foco && (foco.ejercicioIndex !== ejercicioIndex || foco.serieIndex !== serieIndex)) {
        setActionError(`${nombreEjercicio}, serie ${serie.numeroSerie}: ${mensajeRechazo}`);
      }
    },
    [
      sesion,
      setSesion,
      user,
      isDemoMode,
      marcarErrorInline,
      limpiarErrorInline,
      limpiarBorrador,
      cerrarCorreccionSerie,
      setTimerSeconds,
      setActiveSerieKey,
      setIsRestTimerOpen,
      setActionError,
      setBloqueo,
      cacheSesion,
      enviarOEncolar,
      posicionFocoVigente,
      serieDelCronometroVigente,
    ]
  );

  return { handleToggleSet };
}
