import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import { formatearDocumento } from '../../lib/etiquetas-dominio';
import {
  aplicarTabEnQuery, parsearTabFichaAlumno, TABS_FICHA_ALUMNO, type TabFichaAlumno,
} from '../../lib/alumno-detalle-tab';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { SelectorPlantillaAsignacion } from '../../components/entrenador/SelectorPlantillaAsignacion';
import { PestanaNutricionAlumno } from '../../components/entrenador/alumno-detalle/PestanaNutricionAlumno';
import { DialogoConfirmacion } from '../../components/common/DialogoConfirmacion';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { calcularSemaforoPago } from '../../lib/alumno-detalle-metricas';
import type { ConfirmacionFicha } from '../../lib/alumno-detalle-textos';
import { CabeceraAlumnoDetalle } from '../../components/entrenador/alumno-detalle/CabeceraAlumnoDetalle';
import { PestanasFichaAlumno } from '../../components/entrenador/alumno-detalle/PestanasFichaAlumno';
import { PestanaResumenAlumno } from '../../components/entrenador/alumno-detalle/PestanaResumenAlumno';
import { useExpedienteAlumno } from '../../components/entrenador/alumno-detalle/use-expediente-alumno';
import { usePlanSuscripcionAlumno } from '../../components/entrenador/alumno-detalle/use-plan-suscripcion-alumno';
import { useHistorialTransacciones } from '../../components/entrenador/alumno-detalle/use-historial-transacciones';
import { useReversionPago } from '../../components/entrenador/alumno-detalle/use-reversion-pago';
import { useHistorialSesiones } from '../../components/entrenador/alumno-detalle/use-historial-sesiones';
import { PestanaEntrenamientoAlumno } from '../../components/entrenador/alumno-detalle/PestanaEntrenamientoAlumno';
import { useCobroSala } from '../../components/entrenador/alumno-detalle/use-cobro-sala';
import { useCheckinAntropometrico } from '../../components/entrenador/alumno-detalle/use-checkin-antropometrico';
import { useRutinaAlumno } from '../../components/entrenador/alumno-detalle/use-rutina-alumno';
import { ModalCobroSala } from '../../components/entrenador/alumno-detalle/ModalCobroSala';
import { ModalRutinaSemanal } from '../../components/entrenador/alumno-detalle/ModalRutinaSemanal';
import { PestanaFinanzasAlumno } from '../../components/entrenador/alumno-detalle/PestanaFinanzasAlumno';
import { useControlesAntropometricos } from '../../components/entrenador/alumno-detalle/use-controles-antropometricos';
import { useSerieEvolucion } from '../../components/entrenador/alumno-detalle/use-serie-evolucion';
import { useCalendarioAntropometrico } from '../../components/entrenador/alumno-detalle/use-calendario-antropometrico';
import { PestanaAntropometriaAlumno } from '../../components/entrenador/alumno-detalle/PestanaAntropometriaAlumno';
import { ModalControlAntropometrico } from '../../components/entrenador/alumno-detalle/ModalControlAntropometrico';
import { useGuardarExpediente } from '../../components/entrenador/alumno-detalle/use-guardar-expediente';
import { useCicloVidaAlumno } from '../../components/entrenador/alumno-detalle/use-ciclo-vida-alumno';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { ArrowLeft } from 'lucide-react';

/**
 * Ficha del alumno (contenedor orquestador, SL-8).
 *
 * Lee los parámetros de ruta, compone las pestañas y conecta los hooks de datos (R1).
 * Sin JSX de detalle: cada pestaña y modal vive en `components/entrenador/alumno-detalle/`.
 * Carga y mutaciones con el mecanismo actual (`apiClient` + estado local; R9).
 */
export function AlumnoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  // WU16: el tab activo vive en `?tab=…`; ausente o inválido cae a `resumen`.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parsearTabFichaAlumno(searchParams.get('tab'));
  const cambiarTab = (nuevoTab: TabFichaAlumno) => {
    triggerHaptic('light');
    setSearchParams(aplicarTabEnQuery(searchParams, nuevoTab), { replace: true });
  };
  // C6: confirmación compartida de la ficha (ciclo de vida, quitar plan/override).
  const [confirmacionFicha, setConfirmacionFicha] = useState<ConfirmacionFicha | null>(null);
  const { isOnline: hayConexion } = useFrescuraOffline(null);
  const refSelectorPlan = useRef<HTMLSelectElement>(null);
  const [enfocarSelectorPlan, setEnfocarSelectorPlan] = useState(false);
  const [expandedSesionId, setExpandedSesionId] = useState<string | null>(null);
  const [isPlantillaModalOpen, setIsPlantillaModalOpen] = useState(false);
  // U3b: patrón APG de la barra de pestañas (`activar` sigue siendo la URL).
  const tabsFicha = useTabsAccesibles<TabFichaAlumno>({
    claves: TABS_FICHA_ALUMNO, activa: activeTab, onActivar: cambiarTab, idBase: 'ficha-alumno',
  });
  // M5-L1B: tras "Asignar plan" el foco va al selector de plan de Resumen.
  useEffect(() => {
    if (!enfocarSelectorPlan || activeTab !== 'resumen') return;
    const t = setTimeout(() => {
      refSelectorPlan.current?.focus();
      setEnfocarSelectorPlan(false);
    }, 0);
    return () => clearTimeout(t);
  }, [enfocarSelectorPlan, activeTab]);

  const plan = usePlanSuscripcionAlumno({ isDemoMode, solicitarConfirmacion: setConfirmacionFicha });
  const tx = useHistorialTransacciones({ alumnoId: id, isDemoMode });
  const reversion = useReversionPago({
    recargarTransacciones: () => tx.cargarTransacciones(tx.paginaTx, tx.tamanoTx),
  });
  const controles = useControlesAntropometricos({ isDemoMode });
  const sesiones = useHistorialSesiones({ alumnoId: id, isDemoMode });
  const rutina = useRutinaAlumno({ hayConexion });
  const expediente = useExpedienteAlumno({
    alumnoId: id, isDemoMode, tamanoHistorial: sesiones.tamanoHistorial, tamanoTx: tx.tamanoTx,
    tamanoControles: controles.tamanoControles, plan, transacciones: tx, sesiones, controles, rutina,
  });
  const serie = useSerieEvolucion({
    tabActivo: activeTab, usuarioId: expediente.alumno?.usuarioId, isDemoMode,
  });
  const calendario = useCalendarioAntropometrico({
    alumnoId: id, isDemoMode, periodicidad: expediente.periodicidadAntropometria,
    inicio: expediente.antropometriaInicio, setAlumno: expediente.setAlumno,
  });
  const guardar = useGuardarExpediente({
    alumnoId: id, isDemoMode, alumno: expediente.alumno, setAlumno: expediente.setAlumno,
    formulario: expediente.formulario, plan, planesCatalogo: expediente.planesCatalogo,
    notificarExito: plan.notificarExito, notificarError: plan.notificarError,
  });
  const ciclo = useCicloVidaAlumno({
    alumnoId: id, isDemoMode, alumno: expediente.alumno, setAlumno: expediente.setAlumno,
    solicitarConfirmacion: setConfirmacionFicha,
  });
  const checkin = useCheckinAntropometrico({
    isDemoMode, usuarioId: expediente.alumno?.usuarioId, controles,
  });
  const cobro = useCobroSala({
    alumnoId: id, isDemoMode, usuarioId: expediente.alumno?.usuarioId,
    onCobroConfirmado: () => expediente.recargarExpediente({ silencioso: true }),
    precioOverrideVigente: plan.overrideVigente?.precioAcordadoUsd ?? null,
    selectedPlanId: plan.selectedPlanId, planesCatalogo: expediente.planesCatalogo,
    planActivoId: expediente.alumno?.planActivoId ?? null,
  });
  // U3b: diálogo accesible (Escape, trampa de Tab, foco inicial y restore).
  const refModalCobro = useDialogoAccesible({
    abierto: cobro.isCobroModalOpen, onCerrar: () => cobro.setIsCobroModalOpen(false),
  });
  const refModalAntro = useDialogoAccesible({
    abierto: checkin.isAntroModalOpen, onCerrar: () => checkin.setIsAntroModalOpen(false),
  });
  const refModalRutina = useDialogoAccesible({
    abierto: rutina.isRutinaModalOpen, onCerrar: () => rutina.setIsRutinaModalOpen(false),
  });

  const alumno = expediente.alumno;
  if (expediente.isLoading) return <EstadoCarga texto="Cargando Expediente Deportivo 360°..." />;
  const error = expediente.error;
  if (error || !alumno) {
    return (
      <div className="space-y-4 max-w-lg mx-auto mt-10">
        <EstadoError
          titulo="Expediente no encontrado"
          mensaje={error || 'El alumno no existe o no tienes autorización para acceder a sus datos.'}
          onReintentar={() => expediente.recargarExpediente()}
        />
        <div className="flex items-center justify-center">
          <button
            onClick={() => navigate('/coach/alumnos')}
            className="min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
          >
            Volver al Directorio
          </button>
        </div>
      </div>
    );
  }

  // D2: sin resumen financiero real no se inventa un semáforo (nada de "moroso" por fallo de red).
  const semaforo = calcularSemaforoPago(alumno.semaforoPago, tx.finanzas);
  const isArchived = Boolean(alumno.deletedAtUtc);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      <div className="flex items-center justify-between">
        <Link
          to="/coach/alumnos"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a Mis Alumnos</span>
        </Link>
        {alumno.tipoDocumento && alumno.numeroDocumento ? (
          <span className="text-[11px] font-mono text-muted-foreground">
            Documento: {formatearDocumento(alumno.tipoDocumento, alumno.numeroDocumento)}
          </span>
        ) : null}
      </div>

      <CabeceraAlumnoDetalle
        alumno={alumno} semaforo={semaforo} archivado={isArchived}
        errorAccion={ciclo.headerActionError ?? plan.avisoCarga} exitoAccion={ciclo.headerActionSuccess}
        onCambiarEstado={ciclo.solicitarCambioEstado} onArchivar={ciclo.solicitarArchivo}
        onRestaurar={ciclo.restaurarAlumno} onVerFichaCompleta={() => cambiarTab('resumen')}
      />

      {/* C6: confirmación accesible de archivar / cambiar estado / quitar override */}
      <DialogoConfirmacion
        abierto={confirmacionFicha !== null} idTitulo="ficha-confirmacion-titulo"
        titulo={confirmacionFicha?.titulo ?? ''} detalle={confirmacionFicha?.detalle ?? ''}
        textoConfirmar={confirmacionFicha?.boton ?? ''} variante={confirmacionFicha?.variante}
        procesando={ciclo.confirmandoFicha} onCancelar={() => setConfirmacionFicha(null)}
        onConfirmar={() => void ciclo.ejecutarConfirmacionFicha(confirmacionFicha, () => setConfirmacionFicha(null))}
      />

      <PestanasFichaAlumno
        activa={activeTab} propsTablist={tabsFicha.propsTablist} propsTab={tabsFicha.propsTab}
        saldoDeudaUsd={tx.finanzas?.saldoPendienteTotalUsd ?? null}
      />

      {activeTab === 'resumen' && (
        <PestanaResumenAlumno
          propsPanel={tabsFicha.propsPanel('resumen')} onGuardar={guardar.guardarExpediente}
          formulario={expediente.formulario} plan={plan} planesCatalogo={expediente.planesCatalogo}
          zonaHoraria={expediente.alumno?.zonaHoraria}
          alumnoPerfilId={alumno.id} zonaHorariaAlumno={alumno.zonaHoraria} isDemoMode={isDemoMode}
          onZonaHorariaGuardada={(z) => expediente.actualizarZonaHoraria(alumno.id, z)}
          hayCambiosSinGuardar={expediente.hayCambiosSinGuardar}
          onQuitarPlan={() => plan.solicitarQuitarPlan(expediente.alumno)}
          onQuitarOverride={() => plan.solicitarQuitarOverride(expediente.alumno, expediente.setAlumno)}
          refSelectorPlan={refSelectorPlan}
          fichaSaludPrivada={expediente.formulario.fichaSaludPrivada}
          onCambiarFichaSalud={expediente.formulario.setFichaSaludPrivada}
          mensajeExito={plan.saveSuccessMsg} mensajeError={plan.saveErrorMsg}
          guardando={guardar.isSavingPerfil}
        />
      )}

      {activeTab === 'finanzas' && (
        <PestanaFinanzasAlumno
          propsPanel={tabsFicha.propsPanel('finanzas')} tx={tx} reversion={reversion}
          demo={isDemoMode}
          onRegistrarCobro={() => { triggerHaptic('medium'); cobro.abrirCobro(); }}
        />
      )}

      {activeTab === 'antropometria' && (
        <PestanaAntropometriaAlumno
          propsPanel={tabsFicha.propsPanel('antropometria')} alumno={alumno}
          onRegistrarControl={() => { triggerHaptic('medium'); checkin.abrirCheckin(); }}
          periodicidad={expediente.periodicidadAntropometria} inicio={expediente.antropometriaInicio}
          onCambiarPeriodicidad={expediente.setPeriodicidadAntropometria}
          onCambiarInicio={expediente.setAntropometriaInicio}
          calendario={calendario} controles={controles} serie={serie}
        />
      )}

      {activeTab === 'entrenamiento' && (
        <PestanaEntrenamientoAlumno
          propsPanel={tabsFicha.propsPanel('entrenamiento')} sesiones={sesiones}
          bloquesRutina={rutina.rutinaSemanal} errorRutina={rutina.errorRutina} expandidaId={expandedSesionId}
          onAlternarExpandida={setExpandedSesionId} archivado={isArchived}
          onCargarPlantilla={() => { triggerHaptic('light'); setIsPlantillaModalOpen(true); }}
          onEditarRutina={rutina.abrirModalPrescribirRutina} onReintentarRutina={() => void rutina.refrescarRutinaActiva(id)}
        />
      )}

      {cobro.isCobroModalOpen && (
        <ModalCobroSala
          cobro={cobro} refDialogo={refModalCobro}
          onAsignarPlan={() => {
            cobro.setIsCobroModalOpen(false);
            setEnfocarSelectorPlan(true);
            cambiarTab('resumen');
          }}
        />
      )}

      {checkin.isAntroModalOpen && (
        <ModalControlAntropometrico
          checkin={checkin} demo={isDemoMode} usuarioId={alumno?.usuarioId} refDialogo={refModalAntro}
        />
      )}

      {rutina.isRutinaModalOpen && (
        <ModalRutinaSemanal
          rutina={rutina} alumno={alumno} hayConexion={hayConexion} demo={isDemoMode}
          onCerrar={() => rutina.setIsRutinaModalOpen(false)}
          onCerrarYLiberarExito={() => {
            rutina.setIsRutinaModalOpen(false);
            rutina.setRutinaSuccessMsg(null);
          }}
          refDialogo={refModalRutina}
        />
      )}

      {activeTab === 'nutricion' && alumno && <PestanaNutricionAlumno propsPanel={tabsFicha.propsPanel('nutricion')} alumno={alumno} isDemoMode={isDemoMode} />}

      {isPlantillaModalOpen && alumno && (
        <SelectorPlantillaAsignacion
          alumnoId={alumno.id} alumnoNombre={`${alumno.nombres} ${alumno.apellidos}`}
          onCerrar={() => setIsPlantillaModalOpen(false)}
          onAsignada={() => { void rutina.refrescarRutinaActiva(id); }}
        />
      )}
    </div>
  );
}
