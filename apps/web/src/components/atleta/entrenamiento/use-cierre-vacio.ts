import { generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { triggerHaptic } from '../../../lib/haptics';
import {
  EstadoSesion,
  MotivoOmision,
  TipoCierreSesion,
  type FinalizarSesionResponseDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { ResultadoEnvio } from './use-envio-sesion';
import type { FeedbackCierre } from './use-cierre-sesion';

interface OpcionesCierreVacio {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO | null) => void;
  isDemoMode: boolean;
  setIsFinishing: (valor: boolean) => void;
  setIsEmptyCloseModalOpen: (abierto: boolean) => void;
  setFinishFeedback: (feedback: FeedbackCierre | null) => void;
  setPendienteSync: (pendiente: boolean) => void;
  setActionError: (mensaje: string | null) => void;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  cacheSesion: (data: SesionEntrenamientoDetalleDTO) => Promise<void>;
  refreshSemana: () => Promise<void>;
  enviarOEncolar: <T>(
    sesionId: string,
    endpoint: string,
    method: 'POST' | 'PUT',
    payload: unknown,
    descripcion: string,
    idempotencyKey: string
  ) => Promise<ResultadoEnvio<T>>;
}

/**
 * RF-001 Escenario 5: cierre explícito de una sesión sin series completadas.
 * DESCANSADA/INCOMPLETA marcan la sesión como OMITIDA (sin racha) y conservan el historial.
 */
export function useCierreVacio(opciones: OpcionesCierreVacio) {
  const {
    sesion,
    setSesion,
    isDemoMode,
    setIsFinishing,
    setIsEmptyCloseModalOpen,
    setFinishFeedback,
    setPendienteSync,
    setActionError,
    setBloqueo,
    cacheSesion,
    refreshSemana,
    enviarOEncolar,
  } = opciones;

  const confirmEmptyClose = async (tipoCierre: TipoCierreSesion) => {
    if (!sesion) return;
    setIsFinishing(true);

    const fechaFinUtc = new Date().toISOString();
    const motivoOmision =
      tipoCierre === TipoCierreSesion.DESCANSADA ? MotivoOmision.DESCANSO : MotivoOmision.INCOMPLETO;
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.OMITIDA,
      motivoOmision,
      fechaFinUtc,
      porcentajeCumplimiento: '0.00',
    };
    setSesion(updated);
    setFinishFeedback(null);
    setPendienteSync(false);

    // Modo demo: cierre local sin llamadas reales.
    if (isDemoMode) {
      setIsFinishing(false);
      setIsEmptyCloseModalOpen(false);
      triggerHaptic('success');
      return;
    }

    const payload = { tipoCierre, fechaFinUtc };
    const descripcion =
      tipoCierre === TipoCierreSesion.DESCANSADA ? 'Registrar día descansado' : 'Registrar día incompleto';
    let finalUpdated = updated;
    // WU4: idempotencia persistente también en el cierre vacío (descansado/incompleto).
    const resultado = await enviarOEncolar<FinalizarSesionResponseDTO>(
      sesion.id,
      `/sesiones/${sesion.id}/finalizar`,
      'POST',
      payload,
      descripcion,
      generateIdempotencyKey()
    );
    if (resultado.estado === 'enviado') {
      if (resultado.respuesta?.sesion) {
        finalUpdated = resultado.respuesta.sesion;
        setSesion(resultado.respuesta.sesion);
      }
    } else if (resultado.estado === 'encolado') {
      setPendienteSync(true);
    } else {
      // RF-012: bloqueo por ciclo de vida en pleno cierre → pantalla informativa, sin encolar.
      const bloqueoDetectado = resolverBloqueoAlumno(resultado.error);
      setSesion(sesion); // revertir
      setIsFinishing(false);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        setIsEmptyCloseModalOpen(false);
        return;
      }
      setActionError(
        resultado.error instanceof Error && resultado.error.message
          ? resultado.error.message
          : 'No pudimos registrar el día. Inténtalo de nuevo.'
      );
      return;
    }

    await cacheSesion(finalUpdated);
    await refreshSemana();

    setIsFinishing(false);
    setIsEmptyCloseModalOpen(false);
    triggerHaptic('success');
  };

  return { confirmEmptyClose };
}
