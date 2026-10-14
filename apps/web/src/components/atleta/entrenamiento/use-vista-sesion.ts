import { useEffect, useRef, useState } from 'react';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { almacenDeSesion, leerEjercicioPreferido } from '../../../lib/sesion-estado';
import { posicionEnFoco, type PosicionFoco } from '../../../lib/modo-foco';

interface OpcionesVista {
  sesion: SesionEntrenamientoDetalleDTO | null;
  /** Lote E4 (H3): con la sesión planificada no hay descanso que medir. */
  onSesionPlanificada?: () => void;
}

/**
 * `vistaEnCurso` (foco/lista), ejercicio preferido de "Hacer ahora" y series en
 * corrección. Las respuestas asíncronas (rechazo de una serie) leen el foco y el
 * cronómetro vigentes, no los capturados al marcar.
 */
export function useVistaSesion({ sesion, onSesionPlanificada }: OpcionesVista) {
  // Lote E5: en curso se ve el modo foco; la lista completa se abre a demanda. "Hacer ahora"
  // fija el ejercicio preferido del foco (la máquina del siguiente puede estar ocupada).
  const [vistaEnCurso, setVistaEnCurso] = useState<'foco' | 'lista'>('foco');
  // Lote E7: el ejercicio de "Hacer ahora" sobrevive a una recarga de la misma sesión. Se deriva
  // en el render (estado en memoria de esta sesión o, si no, `sessionStorage`) para que el
  // primer render con la sesión cargada ya enfoque el ejercicio correcto, sin parpadeo.
  const [preferidoElegido, setPreferidoElegido] = useState<{
    sesionId: string;
    indice: number | null;
  } | null>(null);
  const ejercicioPreferido = !sesion
    ? null
    : preferidoElegido?.sesionId === sesion.id
    ? preferidoElegido.indice
    : leerEjercicioPreferido(almacenDeSesion(), sesion.id);
  // Lote E4: series completadas que el alumno abrió para corregir (el resto se ve compacto).
  const [seriesEnCorreccion, setSeriesEnCorreccion] = useState<Set<string>>(() => new Set());

  const posicionFocoVigente = useRef<PosicionFoco | null>(null);
  const serieDelCronometroVigente = useRef<{ ejercicioIndex: number; serieIndex: number } | null>(
    null
  );

  // Al cambiar de sesión la vista vuelve al foco. Se ajusta DURANTE el render (patrón de React
  // para derivar estado de una prop) y no en un efecto: un efecto se ejecuta en una tarea
  // posterior al commit, y un toque en "Ver entrenamiento completo" que cayera en ese hueco
  // quedaría pisado por el `'foco'` tardío (W-52-2).
  const [idSesionDeLaVista, setIdSesionDeLaVista] = useState(sesion?.id);
  if (sesion?.id !== idSesionDeLaVista) {
    setIdSesionDeLaVista(sesion?.id);
    setVistaEnCurso('foco');
  }
  const abrirCorreccionSerie = (serieId: string) =>
    setSeriesEnCorreccion((previas) => new Set(previas).add(serieId));
  useEffect(() => {
    if (sesion?.estado === EstadoSesion.PLANIFICADA) onSesionPlanificada?.();
  }, [sesion?.id, sesion?.estado, onSesionPlanificada]);
  const cerrarCorreccionSerie = (serieId: string) =>
    setSeriesEnCorreccion((previas) => {
      if (!previas.has(serieId)) return previas;
      const siguientes = new Set(previas);
      siguientes.delete(serieId);
      return siguientes;
    });

  return {
    vistaEnCurso,
    setVistaEnCurso,
    preferidoElegido,
    setPreferidoElegido,
    ejercicioPreferido,
    seriesEnCorreccion,
    abrirCorreccionSerie,
    cerrarCorreccionSerie,
    posicionFocoVigente,
    serieDelCronometroVigente,
  };
}
