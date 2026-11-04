/**
 * Entrenamiento del día — contenedor orquestador (fase B, Prompt 52).
 *
 * Solo compone: conecta la fachada `use-entrenamiento` (14 hooks de datos) y las
 * secciones (`components/atleta/entrenamiento/`). Sin JSX de detalle (R1): semana,
 * sesión, lista, modales y estados viven en componentes extraídos. R5: roles, labels
 * y textos idénticos. §6 se conserva vía los componentes extraídos.
 */
import { AlertTriangle } from 'lucide-react';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { SyncQueuePanel } from '../../components/common/SyncQueuePanel';
import { RestTimer } from '../../components/common/RestTimer';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { VistaPreviaSesion } from '../../components/atleta/VistaPreviaSesion';
import { ModoFoco } from '../../components/atleta/ModoFoco';
import { IndicadorColaOffline } from '../../components/atleta/entrenamiento/IndicadorColaOffline';
import { BarraProgresoSemanal } from '../../components/atleta/entrenamiento/BarraProgresoSemanal';
import { ChipsBloquesSemana } from '../../components/atleta/entrenamiento/ChipsBloquesSemana';
import { EstadoOfflineSinCache } from '../../components/atleta/entrenamiento/EstadoOfflineSinCache';
import { EstadoSinSesion } from '../../components/atleta/entrenamiento/EstadoSinSesion';
import { EncabezadoSesion } from '../../components/atleta/entrenamiento/EncabezadoSesion';
import { ResumenMetricasSesion } from '../../components/atleta/entrenamiento/ResumenMetricasSesion';
import { AccionesSesion } from '../../components/atleta/entrenamiento/AccionesSesion';
import { CtaFinalizarSesion } from '../../components/atleta/entrenamiento/CtaFinalizarSesion';
import { ResumenSesionFinalizada } from '../../components/atleta/entrenamiento/ResumenSesionFinalizada';
import { ListaCompletaEjercicios } from '../../components/atleta/entrenamiento/ListaCompletaEjercicios';
import { ModalFinalizarSesion } from '../../components/atleta/entrenamiento/ModalFinalizarSesion';
import { ModalCierreVacio } from '../../components/atleta/entrenamiento/ModalCierreVacio';
import { ModalVideoTecnica } from '../../components/atleta/entrenamiento/ModalVideoTecnica';
import { useEntrenamiento } from '../../components/atleta/entrenamiento/use-entrenamiento';

// H-1 del inventario 41: `AtletaMenuPage` importa `buildDemoSemanaProgreso` desde esta
// página. La lógica vive en `lib/entrenamiento-demo.ts`; se re-exporta para no romperla (R6).
export { buildDemoSemanaProgreso } from '../../lib/entrenamiento-demo';

export function EntrenamientoPage() {
  const entrenamiento = useEntrenamiento();
  // Carga y estados globales.
  const { sesion, isDemoMode, isLoading, semanaProgreso, bloqueo, loadSessionAndProgress,
    loadError, isOffline, actionError, isPlanned, datosGuardadosEn } = entrenamiento;
  // Semana.
  const { selectedBloqueId, isSwitchingBloque, selectedBloque, pendientes,
    handleSelectBloque, ultimoGuardadoOtroDia } = entrenamiento;
  // Sesión en curso.
  const { isCompleted, isInProgress, isOmitted, rangoHorarioSesion, unidadPeso,
    cronometro, cronometroVisible, abrirCronometroEnPausa, handleCambiarUnidad, vistaEnCurso, setVistaEnCurso,
    posicionFocoVigente, renderFilaSerie, handleHacerAhora } = entrenamiento;
  // Cierre y modales.
  const { handleOpenFinishModal, pendienteSync, finishFeedback, handleRepetirBloque,
    isFinishModalOpen, setIsFinishModalOpen, confirmFinishSession, refModalFinalizar,
    rpeSesion, setRpeSesion, molestia, setMolestia, notasCoachInput, setNotasCoachInput,
    isFinishing, isEmptyCloseModalOpen, setIsEmptyCloseModalOpen, confirmEmptyClose,
    refModalCierreVacio, videoModal, setVideoModal, refModalVideo } = entrenamiento;
  // Acciones, cola offline y mapas.
  const { handleEntrenarBloqueHoy, handleStartSession, isStarting, handleAbrirVideo,
    syncSummaryLabel, syncRejected, syncState, setIsSyncPanelOpen, isSyncPanelOpen,
    rpePorEjercicio } = entrenamiento;

  if (isLoading && !sesion && !semanaProgreso) {
    // §M2 de la consolidación: el spinner vive en `ui/EstadoCarga` (con `role="status"`, H-8).
    return <EstadoCarga claseContenedor="min-h-[50vh]" />;
  }

  // RF-012: pantalla de bloqueo informativa (pausado / suspendido por pago / archivado) en la
  // pantalla principal de entrenamiento. En modo demo jamás se bloquea: los fixtures no
  // representan estados de ciclo de vida reales.
  if (bloqueo && !isDemoMode) {
    return (
      <BloqueoAlumnoPanel bloqueo={bloqueo} onReintentar={() => loadSessionAndProgress()} />
    );
  }

  return (
    <div className={`space-y-6 ${cronometroVisible ? 'pb-20' : ''}`}>
      {/* Lote E4 (H7): anuncia el cambio de estado al iniciar, cuando la vista previa desaparece. */}
      <p className="sr-only" role="status" aria-live="polite">
        {sesion && isInProgress ? 'Entrenamiento en curso' : ''}
      </p>
      {/* Errores de acciones explícitas (conflictos, red): visibles y accionables. Antes de
          iniciar, el error del inicio se muestra junto al botón de la vista previa (lote E4). */}
      {actionError && !(sesion && isPlanned) && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* WU4: indicador discreto de la cola offline; ausente cuando todo está sincronizado */}
      {syncSummaryLabel && (
        <IndicadorColaOffline
          resumen={syncSummaryLabel}
          rechazados={syncRejected}
          sincronizando={syncState.isSyncing}
          onVerDetalles={() => setIsSyncPanelOpen(true)}
        />
      )}

      {/* D2: lo que se ve viene de lo guardado en el teléfono (sin conexión o sin respuesta) */}
      {datosGuardadosEn !== null && (
        <AvisoDatosOffline actualizadoEn={datosGuardadosEn} mostrarConConexion />
      )}

      {/* Barra de Progreso Semanal Interactiva */}
      {semanaProgreso && semanaProgreso.totalBloques > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-md space-y-3.5">
          <BarraProgresoSemanal semanaProgreso={semanaProgreso} />

          {/* Chips de Bloques de la Semana */}
          <ChipsBloquesSemana
            semanaProgreso={semanaProgreso}
            bloqueActivoId={sesion?.bloqueId}
            deshabilitado={isSwitchingBloque}
            onSelect={handleSelectBloque}
          />
        </div>
      )}

      {/* Error real de red/servidor: estado explícito con retry (nunca datos demo) */}
      {/* §M2 de la consolidación: el error con reintento vive en `ui/EstadoError`. */}
      {!sesion && loadError && (
        <EstadoError
          titulo="No pudimos cargar tu entrenamiento"
          mensaje="Revisa tu conexión e inténtalo de nuevo. Tu historial no se ha perdido."
          onReintentar={() => loadSessionAndProgress(selectedBloqueId ?? undefined)}
        />
      )}

      {/* Offline sin cache: estado vacío honesto (nunca datos demo) */}
      {!sesion && !loadError && isOffline && (
        <EstadoOfflineSinCache
          ultimoGuardadoOtroDia={ultimoGuardadoOtroDia}
          onReintentar={() => loadSessionAndProgress(selectedBloqueId ?? undefined)}
        />
      )}

      {/* Sin sesión activa: sin rutina, día de descanso o bloque pendiente de instanciar */}
      {!sesion && !loadError && !isOffline && (
        <EstadoSinSesion
          semanaProgreso={semanaProgreso}
          selectedBloque={selectedBloque}
          pendientes={pendientes}
          isSwitchingBloque={isSwitchingBloque}
          onEntrenarBloque={(bloqueId) => handleEntrenarBloqueHoy(bloqueId, true)}
        />
      )}

      {/* Si HAY sesión cargada */}
      {sesion && (
        <>
          {/* Session Hero Banner */}
          <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
              <EncabezadoSesion
                sesion={sesion}
                rangoHorario={rangoHorarioSesion}
                completada={isCompleted}
                enProgreso={isInProgress}
                omitida={isOmitted}
              />

          {/* Compliance & Streak Badge */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ResumenMetricasSesion sesion={sesion} unidadPeso={unidadPeso} omitida={isOmitted} />

            <AccionesSesion unidadPeso={unidadPeso} onCambiarUnidad={handleCambiarUnidad} />
          </div>
        </div>

        {/* Finalizar: el inicio vive en la vista previa (VistaPreviaSesion). */}
        {isInProgress && <CtaFinalizarSesion onAbrir={handleOpenFinishModal} />}

        {(isCompleted || isOmitted) && (
          <ResumenSesionFinalizada
            sesion={sesion}
            omitida={isOmitted}
            pendienteSync={pendienteSync}
            finishFeedback={finishFeedback}
            rangoHorario={rangoHorarioSesion}
            deshabilitadoRepetir={isSwitchingBloque}
            puedeRepetir={Boolean(sesion.bloqueId)}
            onRepetir={handleRepetirBloque}
          />
        )}
      </div>

      {/* Lote E4: antes de iniciar, vista previa sin inputs; después, las tarjetas de registro. */}
      {isPlanned ? (
        <VistaPreviaSesion
          sesion={sesion}
          unidadPeso={unidadPeso}
          rpeSugeridoPorEjercicio={rpePorEjercicio}
          onIniciar={handleStartSession}
          iniciando={isStarting}
          error={actionError}
          onVerTecnica={handleAbrirVideo}
        />
      ) : isInProgress && vistaEnCurso === 'foco' ? (
        <ModoFoco
          sesion={sesion}
          posicion={posicionFocoVigente.current}
          unidadPeso={unidadPeso}
          rpeSugeridoPorEjercicio={rpePorEjercicio}
          renderSerie={renderFilaSerie}
          onVerListaCompleta={() => setVistaEnCurso('lista')}
          onVerTecnica={handleAbrirVideo}
        />
      ) : (
        <ListaCompletaEjercicios
          sesion={sesion}
          enProgreso={isInProgress}
          unidadPeso={unidadPeso}
          rpeSugeridoPorEjercicio={rpePorEjercicio}
          mostrarVolverAlEnfoque={isInProgress}
          onVolverAlEnfoque={() => setVistaEnCurso('foco')}
          onHacerAhora={handleHacerAhora}
          onVerTecnica={handleAbrirVideo}
          renderSerie={renderFilaSerie}
          onFinalizar={handleOpenFinishModal}
        />
      )}

      {/* Modal de Finalización y Feedback al Entrenador */}
      {isFinishModalOpen && (
        <ModalFinalizarSesion
          sesion={sesion}
          rpeSesion={rpeSesion}
          onRpeChange={setRpeSesion}
          molestia={molestia}
          onMolestiaChange={setMolestia}
          notasCoachInput={notasCoachInput}
          onNotasChange={setNotasCoachInput}
          isFinishing={isFinishing}
          onClose={() => setIsFinishModalOpen(false)}
          onConfirm={confirmFinishSession}
          dialogRef={refModalFinalizar}
        />
      )}
      </>
      )}

      {/* Modal RF-001 Escenario 5: cierre de sesión sin series completadas */}
      {isEmptyCloseModalOpen && (
        <ModalCierreVacio
          isFinishing={isFinishing}
          onClose={() => setIsEmptyCloseModalOpen(false)}
          onConfirm={confirmEmptyClose}
          dialogRef={refModalCierreVacio}
        />
      )}

      {/* WU3b (Escenario 1): modal de video demostrativo con cierre por Escape y foco accesible */}
      {videoModal && (
        <ModalVideoTecnica
          video={videoModal}
          onClose={() => setVideoModal(null)}
          dialogRef={refModalVideo}
        />
      )}

      {/* WU4: panel compartido de la cola offline (reintentar / descartar rechazadas) */}
      <SyncQueuePanel open={isSyncPanelOpen} onClose={() => setIsSyncPanelOpen(false)} />

      {/* Cronómetro de descanso: botón flotante, píldora y panel (presentacional; el estado vive en
          `cronometro`). Se oculta con un modal abierto, sin cerrar el cronómetro. */}
      <RestTimer
        cronometro={cronometro}
        visible={cronometroVisible}
        onAbrirEnPausa={abrirCronometroEnPausa}
      />
    </div>
  );
}
