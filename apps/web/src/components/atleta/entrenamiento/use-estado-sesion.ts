import { useMemo, type MutableRefObject } from 'react';
import { capturarRpeSugerido } from '../../../lib/entrenamiento-prescripcion';
import {
  formatearRangoHorario,
  resolverRpeSugerido,
} from '../../../lib/entrenamiento-textos';
import { posicionEnFoco, type PosicionFoco } from '../../../lib/modo-foco';
import {
  EstadoSesion,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

interface OpcionesEstado {
  sesion: SesionEntrenamientoDetalleDTO | null;
  semanaProgreso: SemanaEntrenamientoProgresoDTO | null;
  selectedBloqueId: string | null;
  vistaEnCurso: 'foco' | 'lista';
  ejercicioPreferido: number | null;
  posicionFocoVigente: MutableRefObject<PosicionFoco | null>;
  serieDelCronometroVigente: MutableRefObject<{ ejercicioIndex: number; serieIndex: number } | null>;
  isRestTimerOpen: boolean;
  activeSerieKey: { ejercicioIndex: number; serieIndex: number } | null;
}

/**
 * Estado derivado de la sesión: flags de estado, bloque seleccionado, pendientes,
 * rango horario y mapa de RPE sugerido. Preserva la asignación de refs en render (H-3):
 * las respuestas asíncronas leen el foco y el cronómetro vigentes.
 */
export function useEstadoSesion({
  sesion,
  semanaProgreso,
  selectedBloqueId,
  vistaEnCurso,
  ejercicioPreferido,
  posicionFocoVigente,
  serieDelCronometroVigente,
  isRestTimerOpen,
  activeSerieKey,
}: OpcionesEstado) {
  // WU3b: la prescripción (RPE sugerido) se captura al cargar la sesión; editar el RPE real
  // durante el checklist no debe borrar la referencia prescrita en pantalla.
  const rpeSugeridoPorEjercicio = useMemo(
    () => capturarRpeSugerido(sesion?.ejercicios ?? []),
    [sesion?.id]
  );
  // Mapa listo para `VistaPreviaSesion`, `ModoFoco` y `ListaCompletaEjercicios`.
  const rpePorEjercicio: Record<string, string | null> = sesion
    ? Object.fromEntries(
        sesion.ejercicios.map((ej) => [
          ej.id,
          resolverRpeSugerido(ej, rpeSugeridoPorEjercicio[ej.id]),
        ])
      )
    : {};

  const isCompleted = sesion?.estado === EstadoSesion.COMPLETADA;
  const isInProgress = sesion?.estado === EstadoSesion.EN_PROGRESO;
  const isPlanned = sesion?.estado === EstadoSesion.PLANIFICADA;
  const isOmitted = sesion?.estado === EstadoSesion.OMITIDA;
  const isReadOnly = isCompleted || isPlanned || isOmitted;
  const selectedBloque =
    semanaProgreso?.bloques.find((b) => b.bloqueId === selectedBloqueId) ?? null;
  const pendientes =
    semanaProgreso?.bloques.filter(
      (b) => !b.completado && b.bloqueId !== selectedBloque?.bloqueId
    ) ?? [];
  const rangoHorarioSesion = sesion
    ? formatearRangoHorario(sesion.fechaInicioUtc, sesion.fechaFinUtc)
    : null;

  posicionFocoVigente.current =
    sesion && isInProgress && vistaEnCurso === 'foco'
      ? posicionEnFoco(sesion, ejercicioPreferido)
      : null;
  serieDelCronometroVigente.current = isRestTimerOpen ? activeSerieKey : null;

  return {
    rpeSugeridoPorEjercicio,
    rpePorEjercicio,
    isCompleted,
    isInProgress,
    isPlanned,
    isOmitted,
    isReadOnly,
    selectedBloque,
    pendientes,
    rangoHorarioSesion,
  };
}
