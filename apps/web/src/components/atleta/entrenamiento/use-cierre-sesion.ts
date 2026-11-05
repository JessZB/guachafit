import { useState } from 'react';
import { ApiError, generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { triggerHaptic } from '../../../lib/haptics';
import { estimarCumpleRachaPorVolumen } from '../../../lib/racha';
import {
  construirEtiquetaDescanso,
  resumirDescansos,
} from '../../../lib/entrenamiento-descansos';
import {
  CODIGO_SESION_VACIA,
  EstadoSesion,
  type FinalizarSesionResponseDTO,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { ResultadoEnvio } from './use-envio-sesion';

export interface FeedbackCierre {
  cumpleRacha: boolean;
  nuevaRacha: number;
  duracionMinutos: number | null;
}

interface OpcionesCierre {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO | null) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
  semanaProgreso: SemanaEntrenamientoProgresoDTO | null;
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

/** Modales de fin, feedback de racha (RN-02) y cierre vacío (RF-001 E5). */
export function useCierreSesion(opciones: OpcionesCierre) {
  const {
    sesion,
    setSesion,
    isDemoMode,
    semanaProgreso,
    setActionError,
    setBloqueo,
    cacheSesion,
    refreshSemana,
    enviarOEncolar,
  } = opciones;

  // Modal de Finalización y Feedback al Entrenador
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [rpeSesion, setRpeSesion] = useState<number | null>(null);
  const [molestia, setMolestia] = useState('Ninguna 👍');
  const [notasCoachInput, setNotasCoachInput] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  // RF-001 Escenario 5: cierre de sesión vacía (descansado / incompleto)
  const [isEmptyCloseModalOpen, setIsEmptyCloseModalOpen] = useState(false);

  // RN-02: feedback real de la finalización (nunca afirmar racha sin respaldo de la API)
  const [finishFeedback, setFinishFeedback] = useState<FeedbackCierre | null>(null);
  const [pendienteSync, setPendienteSync] = useState(false);

  // Finish session handlers (Modal de Feedback)
  const handleOpenFinishModal = () => {
    if (!sesion) return;
    // RF-001 Escenario 5: sin ninguna serie completada se pide decisión explícita primero
    const seriesCompletadas = sesion.ejercicios.reduce(
      (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
      0
    );
    if (seriesCompletadas === 0) {
      setActionError(null);
      setIsEmptyCloseModalOpen(true);
      return;
    }
    setIsFinishModalOpen(true);
  };

  const confirmFinishSession = async () => {
    if (!sesion) return;
    setIsFinishing(true);

    // Cálculo comparativo de descansos (Prescrito vs. Real)
    const resumen = resumirDescansos(sesion.ejercicios);
    const descansoTag = resumen ? construirEtiquetaDescanso(resumen) : null;

    const notasCompletas = [
      rpeSesion !== null ? `[RPE: ${rpeSesion}/10]` : null,
      molestia !== 'Ninguna 👍' ? `[Molestia: ${molestia}]` : null,
      descansoTag,
      notasCoachInput.trim() ? notasCoachInput.trim() : null,
    ]
      .filter(Boolean)
      .join(' • ');

    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.COMPLETADA,
      fechaFinUtc: new Date().toISOString(),
      notasAlumno: notasCompletas,
    };
    setSesion(updated);

    const payload = {
      notasAlumno: notasCompletas,
      fechaFinUtc: new Date().toISOString(),
    };

    // Modo demo: cierre local sin llamadas reales ni cola offline.
    if (isDemoMode) {
      setFinishFeedback({
        cumpleRacha: estimarCumpleRachaPorVolumen(updated.ejercicios.flatMap((e) => e.series)),
        nuevaRacha: (semanaProgreso?.rachaDias ?? 0) + 1,
        duracionMinutos: null,
      });
      setPendienteSync(false);
      setIsFinishing(false);
      setIsFinishModalOpen(false);
      triggerHaptic('success');
      return;
    }

    let finalUpdated = updated;
    // WU4: idempotencia persistente también en la finalización (misma key en reintentos).
    // D1: si quedan series de esta sesión en la cola, la finalización se encola detrás de ellas.
    const resultado = await enviarOEncolar<FinalizarSesionResponseDTO>(
      sesion.id,
      `/sesiones/${sesion.id}/finalizar`,
      'POST',
      payload,
      'Finalizar entrenamiento',
      generateIdempotencyKey()
    );
    if (resultado.estado === 'enviado') {
      const res = resultado.respuesta;
      if (res?.sesion) {
        finalUpdated = res.sesion;
        setSesion(res.sesion);
      }
      if (res) {
        setFinishFeedback({
          cumpleRacha: res.cumpleRacha,
          nuevaRacha: res.nuevaRacha,
          duracionMinutos: res.duracionMinutos ?? res.sesion?.duracionMinutos ?? null,
        });
        setPendienteSync(false);
      }
    } else if (resultado.estado === 'encolado') {
      setPendienteSync(true);
      setFinishFeedback(null);
    } else {
      const err = resultado.error;
      // RF-012: bloqueo por ciclo de vida en pleno cierre → pantalla informativa, sin encolar.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        setIsFinishing(false);
        setIsFinishModalOpen(false);
        return;
      }
      setSesion(sesion); // revertir el estado optimista
      setIsFinishing(false);
      // Defensa (RF-001 Escenario 5): SOLO el 400 con código máquina estable `SESION_VACIA`
      // abre el modal de cierre vacío; cualquier otro rechazo es un error normal visible.
      if (err instanceof ApiError && err.status === 400 && err.problem?.code === CODIGO_SESION_VACIA) {
        setIsFinishModalOpen(false);
        setIsEmptyCloseModalOpen(true);
        return;
      }
      setActionError(
        err instanceof Error && err.message ? err.message : 'No pudimos finalizar tu entrenamiento.'
      );
      return;
    }

    if (sesion.id) {
      await cacheSesion(finalUpdated);
    }

    // Actualizar progreso semanal reactivo (incluye racha efectiva)
    await refreshSemana();

    setIsFinishing(false);
    setIsFinishModalOpen(false);
    triggerHaptic('success');
  };

  return {
    isFinishModalOpen,
    setIsFinishModalOpen,
    rpeSesion,
    setRpeSesion,
    molestia,
    setMolestia,
    notasCoachInput,
    setNotasCoachInput,
    isFinishing,
    setIsFinishing,
    isEmptyCloseModalOpen,
    setIsEmptyCloseModalOpen,
    finishFeedback,
    setFinishFeedback,
    pendienteSync,
    setPendienteSync,
    handleOpenFinishModal,
    confirmFinishSession,
  };
}
