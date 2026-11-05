import { useCallback, useState } from 'react';
import { LIMITES_SERIE, type SerieRegistroDetalleDTO } from '@guachafit/shared';
import {
  convertirEntradaPesoAKg,
  guardarUnidadPesoPreferida,
  leerUnidadPesoPreferida,
  normalizarEntradaDecimal,
  pasoPesoEnKg,
  redondearDecimal,
  validarReps,
  validarRpe,
  type UnidadPeso,
} from '../../../lib/weight-unit';
import { clonarSesionParaEdicion } from '../../../lib/sesion-estado';
import { pesoEfectivoKg } from '../../../lib/entrenamiento-peso-plan';
import { marcarInicioSerieReal } from '../../../lib/sesion-tiempos';
import { triggerHaptic } from '../../../lib/haptics';
import { offlineDb } from '../../../lib/offline-db';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';

interface OpcionesEdicion {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
}

/**
 * WU3b (RN-01): borradores de texto en edición, errores inline por campo, unidad
 * kg/lb y edición con steppers de peso/reps/RPE + autoguardado.
 */
export function useEdicionSerie({ sesion, setSesion, user, isDemoMode }: OpcionesEdicion) {
  // WU3b (RN-01): unidad de peso preferida, borradores de texto en edición y errores inline por campo
  const [unidadPeso, setUnidadPeso] = useState<UnidadPeso>(() => leerUnidadPesoPreferida());
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});

  // WU3b: helpers de errores inline, unidad de peso y video demostrativo
  const marcarErrorInline = useCallback((clave: string, mensaje: string) => {
    setInputErrors((prev) => ({ ...prev, [clave]: mensaje }));
  }, []);

  const limpiarErrorInline = useCallback((clave: string) => {
    setInputErrors((prev) => {
      if (!prev[clave]) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  }, []);

  const limpiarBorrador = useCallback((clave: string) => {
    setInputDrafts((prev) => {
      if (!(clave in prev)) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  }, []);

  const resetBorradores = useCallback(() => {
    setInputDrafts({});
    setInputErrors({});
  }, []);

  // WU17: `timestampInicioUtc` marca cuándo el alumno EMPIEZA una serie (una sola vez,
  // solo en pendientes de una sesión en progreso). El descanso real se deriva luego:
  // inicio(serie N) − completada(serie N−1). Sin marca no se inventa medición (la UI muestra '—').

  /**
   * Fija el inicio real sobre la serie indicada (mutando el objeto serie que los handlers ya
   * clonaron en el estado optimista). Devuelve `true` solo si la marca cambió. No marca series
   * completadas ni sobrescribe una marca existente.
   */
  const marcarInicioEnSerie = useCallback(
    (serie: SerieRegistroDetalleDTO): boolean => {
      if (!sesion || sesion.estado !== EstadoSesion.EN_PROGRESO) return false;
      const conMarca = marcarInicioSerieReal(serie, new Date().toISOString());
      if (!conMarca) return false;
      serie.timestampInicioUtc = conMarca.timestampInicioUtc;
      return true;
    },
    [sesion]
  );

  /** RN-01: alterna kg/lb y persiste la preferencia; los textos se reformatean desde kg. */
  const handleCambiarUnidad = (unidad: UnidadPeso) => {
    if (unidad === unidadPeso) return;
    triggerHaptic('selection');
    setUnidadPeso(unidad);
    guardarUnidadPesoPreferida(unidad);
    setInputDrafts({});
    setInputErrors({});
  };

  /** Al salir del campo, el borrador válido se descarta y la UI muestra el valor canónico. */
  const handleBlurPeso = (serieId: string) => {
    const clave = `${serieId}:pesoKg`;
    if (inputErrors[clave]) return; // conserva el texto inválido visible para corregirlo
    limpiarBorrador(clave);
  };

  const handleBlurRpe = (serieId: string) => {
    const clave = `${serieId}:rpe`;
    if (inputErrors[clave]) return;
    limpiarBorrador(clave);
  };

  /** Repeticiones: un campo vaciado vuelve a mostrar el último valor guardado al salir. */
  const handleBlurReps = (serieId: string) => {
    const clave = `${serieId}:repsLogradas`;
    if (inputErrors[clave]) return;
    limpiarBorrador(clave);
  };

  // Update set values (weight, reps, rpe)
  const handleUpdateSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas' | 'rpe',
    value: string
  ) => {
    if (!sesion) return;
    const updated = clonarSesionParaEdicion(sesion);
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];

    // WU17: editar pesos/reps/RPE es interacción real => marca el inicio si aún no existe.
    marcarInicioEnSerie(serie);

    if (field === 'pesoKg') {
      // RN-01: el alumno escribe en su unidad; se valida y se persiste SIEMPRE en kg.
      const clave = `${serie.id}:pesoKg`;
      setInputDrafts((prev) => ({ ...prev, [clave]: value }));
      const resultado = convertirEntradaPesoAKg(value, unidadPeso);
      if (!resultado.ok) {
        marcarErrorInline(clave, resultado.error ?? 'Peso inválido');
        return; // nunca persistir ni encolar un peso inválido
      }
      limpiarErrorInline(clave);
      serie.pesoKg = resultado.kg; // '' = sin peso (válido: el peso es opcional, RN-01)
    } else if (field === 'rpe') {
      const clave = `${serie.id}:rpe`;
      setInputDrafts((prev) => ({ ...prev, [clave]: value }));
      const resultado = validarRpe(value);
      if (!resultado.ok) {
        marcarErrorInline(clave, resultado.error ?? 'Esfuerzo no válido');
        return;
      }
      limpiarErrorInline(clave);
      serie.rpe = resultado.rpe;
    } else {
      const clave = `${serie.id}:repsLogradas`;
      // Borrador: el campo puede quedar vacío mientras se escribe sin convertirse en 0.
      setInputDrafts((prev) => ({ ...prev, [clave]: value }));
      if (value === '') return;
      const numerico = Number(value);
      const errorReps = validarReps(numerico);
      if (errorReps) {
        marcarErrorInline(clave, errorReps);
        return;
      }
      limpiarErrorInline(clave);
      serie.repsLogradas = numerico;
    }

    setSesion(updated);

    // Modo demo: edición local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  // Step set value (+ / -) for weight and reps with haptic feedback
  const handleStepSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas',
    delta: number
  ) => {
    if (!sesion) return;
    triggerHaptic('light');
    const updated = clonarSesionParaEdicion(sesion);
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];

    // WU17: tocar los steppers de peso/reps es interacción real => marca el inicio si falta.
    marcarInicioEnSerie(serie);

    if (field === 'pesoKg') {
      // RN-01: el stepper avanza en la unidad visible (±2.5 kg / ±5 lb) sin deriva decimal.
      const clave = `${serie.id}:pesoKg`;
      const pasoKg = pasoPesoEnKg(unidadPeso) * (delta < 0 ? -1 : 1);
      // Parte del valor mostrado (el efectivo): sobre el plan, +2,5 kg o +5 lb; sin plan, desde 0.
      const pesoBase = pesoEfectivoKg(serie);
      const baseNumerica = pesoBase ? Number(normalizarEntradaDecimal(String(pesoBase))) : 0;
      const actualKg = Number.isFinite(baseNumerica) ? baseNumerica : 0;
      // Lote E3: el stepper tampoco pasa del tope compartido (999 kg).
      const siguienteKg = Math.min(LIMITES_SERIE.pesoKgMax, Math.max(0, actualKg + pasoKg));
      serie.pesoKg = siguienteKg > 0 ? redondearDecimal(siguienteKg, 2).toFixed(2) : '';
      limpiarBorrador(clave); // el valor canónico reemplaza cualquier texto en edición
      limpiarErrorInline(clave);
    } else if (field === 'repsLogradas') {
      const current = serie.repsLogradas ?? serie.repsObjetivo ?? 0;
      const next = Math.max(0, Math.min(LIMITES_SERIE.repsMax, current + delta));
      serie.repsLogradas = next;
      limpiarBorrador(`${serie.id}:repsLogradas`);
      limpiarErrorInline(`${serie.id}:repsLogradas`);
    }
    setSesion(updated);

    // Modo demo: edición local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  return {
    unidadPeso,
    inputDrafts,
    inputErrors,
    marcarErrorInline,
    limpiarErrorInline,
    limpiarBorrador,
    resetBorradores,
    marcarInicioEnSerie,
    handleCambiarUnidad,
    handleBlurPeso,
    handleBlurRpe,
    handleBlurReps,
    handleUpdateSerieValue,
    handleStepSerieValue,
  };
}
