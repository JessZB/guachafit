import { useCallback, useState, type ReactNode } from 'react';
import { useAuth } from '../../../context/auth-context';
import { type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { almacenDeSesion, guardarEjercicioPreferido } from '../../../lib/sesion-estado';
import {
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { useEnvioSesion } from './use-envio-sesion';
import { useSemanaEntrenamiento } from './use-semana-entrenamiento';
import { useEdicionSerie } from './use-edicion-serie';
import { useCierreSesion } from './use-cierre-sesion';
import { useCierreVacio } from './use-cierre-vacio';
import { useCargaSesion } from './use-carga-sesion';
import { useAccionesSesion } from './use-acciones-sesion';
import { useTemporizadorDescanso } from './use-temporizador-descanso';
import { useVistaSesion } from './use-vista-sesion';
import { useIniciarSerie } from './use-iniciar-serie';
import { useMarcadoSerie } from './use-marcado-serie';
import { useVideoTecnica } from './use-video-tecnica';
import { useColaOffline } from './use-cola-offline';
import { useEstadoSesion } from './use-estado-sesion';
import { FilaSerie } from './FilaSerie';

/**
 * Fachada del módulo: compone los hooks de `entrenamiento` en un orden que satisface
 * sus dependencias sin ciclos (envío → semana → edición → cierre → carga → acciones →
 * temporizador → vista → marcado → inicio → video → cola) y expone al contenedor solo
 * nombres planos, derivados calculados y el glue de series compartido.
 */
export function useEntrenamiento() {
  const { user, isDemoMode } = useAuth();
  // Estado núcleo: la sesión y los errores visibles globales.
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';

  const envio = useEnvioSesion({ user, isDemoMode });
  const semana = useSemanaEntrenamiento({
    isDemoMode,
    tz,
    userId: user?.id,
    onBloqueo: setBloqueo,
  });
  const { semanaProgreso, setSemanaProgreso, refreshSemana } = semana;
  const edicion = useEdicionSerie({ sesion, setSesion, user, isDemoMode });
  const cierre = useCierreSesion({
    sesion,
    setSesion,
    user,
    isDemoMode,
    semanaProgreso,
    setActionError,
    setBloqueo,
    cacheSesion: envio.cacheSesion,
    refreshSemana,
    enviarOEncolar: envio.enviarOEncolar,
  });
  const carga = useCargaSesion({
    user,
    isDemoMode,
    tz,
    setSesion,
    setBloqueo,
    setActionError,
    setSemanaProgreso,
    setFinishFeedback: cierre.setFinishFeedback,
    setPendienteSync: cierre.setPendienteSync,
    resetBorradores: edicion.resetBorradores,
    cacheSesion: envio.cacheSesion,
  });
  const acciones = useAccionesSesion({
    sesion,
    setSesion,
    user,
    isDemoMode,
    tz,
    setSelectedBloqueId: carga.setSelectedBloqueId,
    setIsSwitchingBloque: carga.setIsSwitchingBloque,
    setActionError,
    setBloqueo,
    setFinishFeedback: cierre.setFinishFeedback,
    setPendienteSync: cierre.setPendienteSync,
    resetBorradores: edicion.resetBorradores,
    cacheSesion: envio.cacheSesion,
    refreshSemana,
    enviarOEncolar: envio.enviarOEncolar,
  });
  const temporizador = useTemporizadorDescanso({
    sesion,
    setSesion,
    user,
    isDemoMode,
    marcarErrorInline: edicion.marcarErrorInline,
    setBloqueo,
    enviarOEncolar: envio.enviarOEncolar,
  });
  const { setIsRestTimerOpen } = temporizador;
  const cerrarCronometroAlPlanificar = useCallback(
    () => setIsRestTimerOpen(false),
    [setIsRestTimerOpen]
  );
  const vista = useVistaSesion({ sesion, onSesionPlanificada: cerrarCronometroAlPlanificar });
  const marcado = useMarcadoSerie({
    sesion,
    setSesion,
    user,
    isDemoMode,
    marcarErrorInline: edicion.marcarErrorInline,
    limpiarErrorInline: edicion.limpiarErrorInline,
    limpiarBorrador: edicion.limpiarBorrador,
    cerrarCorreccionSerie: vista.cerrarCorreccionSerie,
    setTimerSeconds: temporizador.setTimerSeconds,
    setActiveSerieKey: temporizador.setActiveSerieKey,
    setIsRestTimerOpen,
    setActionError,
    setBloqueo,
    cacheSesion: envio.cacheSesion,
    enviarOEncolar: envio.enviarOEncolar,
    posicionFocoVigente: vista.posicionFocoVigente,
    serieDelCronometroVigente: vista.serieDelCronometroVigente,
  });
  const inicio = useIniciarSerie({
    sesion,
    setSesion,
    user,
    isDemoMode,
    marcarInicioEnSerie: edicion.marcarInicioEnSerie,
  });
  const video = useVideoTecnica();
  const cola = useColaOffline();
  const estado = useEstadoSesion({
    sesion,
    semanaProgreso,
    selectedBloqueId: carga.selectedBloqueId,
    vistaEnCurso: vista.vistaEnCurso,
    ejercicioPreferido: vista.ejercicioPreferido,
    posicionFocoVigente: vista.posicionFocoVigente,
    serieDelCronometroVigente: vista.serieDelCronometroVigente,
    isRestTimerOpen: temporizador.isRestTimerOpen,
    activeSerieKey: temporizador.activeSerieKey,
  });
  const { isReadOnly } = estado;

  /** Lote E5/E7: "Hacer ahora" fija el ejercicio preferido del foco y lo persiste. */
  const handleHacerAhora = (ejercicioIndex: number) => {
    if (!sesion) return;
    vista.setPreferidoElegido({ sesionId: sesion.id, indice: ejercicioIndex });
    guardarEjercicioPreferido(almacenDeSesion(), sesion.id, ejercicioIndex);
    vista.setVistaEnCurso('foco');
  };

  /** Lote E5: fila de una serie, compartida por el modo foco y la lista completa. */
  const renderFilaSerie = (ejIdx: number, sIdx: number): ReactNode => {
    if (!sesion) return null;
    const serieId = sesion.ejercicios[ejIdx]?.series[sIdx]?.id ?? `${ejIdx}-${sIdx}`;
    return (
      <FilaSerie
        key={serieId}
        sesion={sesion}
        ejercicioIndex={ejIdx}
        serieIndex={sIdx}
        unidadPeso={edicion.unidadPeso}
        inputDrafts={edicion.inputDrafts}
        inputErrors={edicion.inputErrors}
        seriesEnCorreccion={vista.seriesEnCorreccion}
        soloLectura={isReadOnly}
        onCorregir={vista.abrirCorreccionSerie}
        onCambiar={edicion.handleUpdateSerieValue}
        onPaso={edicion.handleStepSerieValue}
        onSalirPeso={edicion.handleBlurPeso}
        onSalirReps={edicion.handleBlurReps}
        onSalirRpe={edicion.handleBlurRpe}
        onMarcar={marcado.handleToggleSet}
        onIniciar={inicio.handleIniciarSerie}
      />
    );
  };

  const cierreVacio = useCierreVacio({
    sesion,
    setSesion,
    isDemoMode,
    setIsFinishing: cierre.setIsFinishing,
    setIsEmptyCloseModalOpen: cierre.setIsEmptyCloseModalOpen,
    setFinishFeedback: cierre.setFinishFeedback,
    setPendienteSync: cierre.setPendienteSync,
    setActionError,
    setBloqueo,
    cacheSesion: envio.cacheSesion,
    refreshSemana,
    enviarOEncolar: envio.enviarOEncolar,
  });

  return {
    sesion, bloqueo, actionError, isDemoMode,
    semanaProgreso, selectedBloqueId: carga.selectedBloqueId,
    isLoading: carga.isLoading, isSwitchingBloque: carga.isSwitchingBloque,
    loadError: carga.loadError, isOffline: carga.isOffline,
    datosGuardadosEn: carga.datosGuardadosEn,
    ultimoGuardadoOtroDia: carga.ultimoGuardadoOtroDia,
    loadSessionAndProgress: carga.loadSessionAndProgress,
    handleSelectBloque: carga.handleSelectBloque,
    isStarting: acciones.isStarting,
    handleEntrenarBloqueHoy: acciones.handleEntrenarBloqueHoy,
    handleRepetirBloque: acciones.handleRepetirBloque,
    handleStartSession: acciones.handleStartSession,
    isRestTimerOpen: temporizador.isRestTimerOpen,
    setIsRestTimerOpen, timerSeconds: temporizador.timerSeconds,
    setActiveSerieKey: temporizador.setActiveSerieKey,
    handleRestDurationChange: temporizador.handleRestDurationChange,
    vistaEnCurso: vista.vistaEnCurso, setVistaEnCurso: vista.setVistaEnCurso,
    videoModal: video.videoModal, setVideoModal: video.setVideoModal,
    handleAbrirVideo: video.handleAbrirVideo, refModalVideo: video.refModalVideo,
    syncState: cola.syncState, isSyncPanelOpen: cola.isSyncPanelOpen,
    setIsSyncPanelOpen: cola.setIsSyncPanelOpen,
    syncRejected: cola.syncRejected, syncSummaryLabel: cola.syncSummaryLabel,
    isFinishModalOpen: cierre.isFinishModalOpen,
    setIsFinishModalOpen: cierre.setIsFinishModalOpen,
    rpeSesion: cierre.rpeSesion, setRpeSesion: cierre.setRpeSesion,
    molestia: cierre.molestia, setMolestia: cierre.setMolestia,
    notasCoachInput: cierre.notasCoachInput,
    setNotasCoachInput: cierre.setNotasCoachInput,
    isFinishing: cierre.isFinishing,
    isEmptyCloseModalOpen: cierre.isEmptyCloseModalOpen,
    setIsEmptyCloseModalOpen: cierre.setIsEmptyCloseModalOpen,
    finishFeedback: cierre.finishFeedback, pendienteSync: cierre.pendienteSync,
    handleOpenFinishModal: cierre.handleOpenFinishModal,
    confirmFinishSession: cierre.confirmFinishSession,
    refModalFinalizar: cierre.refModalFinalizar,
    refModalCierreVacio: cierre.refModalCierreVacio,
    confirmEmptyClose: cierreVacio.confirmEmptyClose,
    unidadPeso: edicion.unidadPeso, handleCambiarUnidad: edicion.handleCambiarUnidad,
    rpeSugeridoPorEjercicio: estado.rpeSugeridoPorEjercicio,
    rpePorEjercicio: estado.rpePorEjercicio,
    isCompleted: estado.isCompleted, isInProgress: estado.isInProgress,
    isPlanned: estado.isPlanned, isOmitted: estado.isOmitted,
    selectedBloque: estado.selectedBloque, pendientes: estado.pendientes,
    rangoHorarioSesion: estado.rangoHorarioSesion,
    posicionFocoVigente: vista.posicionFocoVigente,
    handleHacerAhora, renderFilaSerie,
  };
}
