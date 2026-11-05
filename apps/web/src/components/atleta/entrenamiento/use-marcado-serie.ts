import { useCallback, useRef } from 'react';
import { generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { clonarSesionParaEdicion, recalcularCumplimiento } from '../../../lib/sesion-estado';
import { triggerHaptic } from '../../../lib/haptics';
import { offlineDb } from '../../../lib/offline-db';
import { pesoEfectivoKg, pesoVieneDelPlan } from '../../../lib/entrenamiento-peso-plan';
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
  /** Abre el cronómetro con el descanso de la serie (por `id`, nunca por índices). */
  abrirCronometroParaSerie: (serieId: string, segundos: number) => void;
  cerrarCronometro: () => void;
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
    abrirCronometroParaSerie,
    cerrarCronometro,
    setActionError,
    setBloqueo,
    cacheSesion,
    enviarOEncolar,
    posicionFocoVigente,
    serieDelCronometroVigente,
  } = opciones;
  // Lote E9 (guarda G): última operación de marcado emitida por serie. Un rechazo tardío solo
  // revierte la serie si su operación sigue siendo la última; si se volvió a tocar, manda la
  // intención más nueva.
  const ultimaOperacionPorSerie = useRef(new Map<string, number>());

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
      const operacion = (ultimaOperacionPorSerie.current.get(serie.id) ?? 0) + 1;
      ultimaOperacionPorSerie.current.set(serie.id, operacion);

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

        // Precarga con el plan: la herencia de arriba mira el peso REAL (`pesoKg`) y por eso gana
        // sobre el plan de la siguiente. Después, un peso que viajó desde el plan pasa a ser el
        // peso real de esta serie, para que la fila compacta y el reenvío muestren lo enviado.
        if (pesoVieneDelPlan(serie)) serie.pesoKg = pesoEfectivoKg(serie);

        // Descanso prescrito para este ejercicio (o 90s por defecto)
        const prescrito = updated.ejercicios[ejercicioIndex].descansoPrescritoSegundos || 90;
        serie.descansoSegundos = serie.descansoSegundos ?? prescrito;

        // Iniciar el temporizador con el tiempo del ejercicio
        abrirCronometroParaSerie(serie.id, serie.descansoSegundos);
      } else {
        triggerHaptic('light');
      }

      // Porcentaje y racha estimada (D8, RN-02) desde las series ya actualizadas.
      Object.assign(updated, recalcularCumplimiento(updated));

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
        null, // el peso efectivo (propio o del plan) lo deriva `construirPayloadSerie`
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
      // E9 (guarda G): si la serie se volvió a marcar o desmarcar después, no se revierte; y el
      // porcentaje y la racha se recalculan desde el estado ACTUAL, no desde la instantánea.
      const sigueVigente = ultimaOperacionPorSerie.current.get(serie.id) === operacion;
      if (sigueVigente) {
        setSesion((actual) => {
          if (!actual || actual.id !== updated.id) return actual;
          const base = revertirSerieRechazada(actual, {
            ejercicioIndex,
            serieIndex,
            serieAntes,
            porcentajeAntes,
            rachaAntes,
          });
          const revertida = { ...base, ...recalcularCumplimiento(base) };
          void cacheSesion(revertida);
          return revertida;
        });
      }
      const cronometro = serieDelCronometroVigente.current;
      if (
        sigueVigente &&
        willBeCompleted &&
        cronometro?.ejercicioIndex === ejercicioIndex &&
        cronometro?.serieIndex === serieIndex
      ) {
        cerrarCronometro();
      }
      // E9 (decisión del dueño, opción A): el rechazo de un toque ya superado por otro posterior
      // no se avisa; lo que el alumno quiere es el último toque, que sigue su curso.
      if (!sigueVigente) return;
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
      abrirCronometroParaSerie,
      cerrarCronometro,
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
