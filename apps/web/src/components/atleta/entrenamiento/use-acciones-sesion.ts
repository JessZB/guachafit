import { useState } from 'react';
import { ApiError, apiClient, generateIdempotencyKey } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { triggerHaptic } from '../../../lib/haptics';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { buildDemoSesion } from '../../../lib/entrenamiento-demo';
import type { ResultadoEnvio } from './use-envio-sesion';

interface OpcionesAcciones {
  sesion: SesionEntrenamientoDetalleDTO | null;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO | null) => void;
  user: { id?: string } | null;
  isDemoMode: boolean;
  tz: string;
  setSelectedBloqueId: (bloqueId: string | null) => void;
  setIsSwitchingBloque: (valor: boolean) => void;
  setActionError: (mensaje: string | null) => void;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  setFinishFeedback: (
    feedback: { cumpleRacha: boolean; nuevaRacha: number; duracionMinutos: number | null } | null
  ) => void;
  setPendienteSync: (pendiente: boolean) => void;
  resetBorradores: () => void;
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

/** Iniciar/repetir sesión y acción explícita "Entrenar este bloque hoy" (RN-04). */
export function useAccionesSesion(opciones: OpcionesAcciones) {
  const {
    sesion,
    setSesion,
    user,
    isDemoMode,
    tz,
    setSelectedBloqueId,
    setIsSwitchingBloque,
    setActionError,
    setBloqueo,
    setFinishFeedback,
    setPendienteSync,
    resetBorradores,
    cacheSesion,
    refreshSemana,
    enviarOEncolar,
  } = opciones;
  // C9/D4: "Comenzar" deshabilitado con indicador mientras se guarda y envía.
  const [isStarting, setIsStarting] = useState(false);

  // Acción EXPLÍCITA: "Entrenar este bloque hoy" (RN-04). Única vía para instanciar/cambiar sesión.
  const handleEntrenarBloqueHoy = async (bloqueId: string, iniciarInmediato = false) => {
    if (!bloqueId) return;
    setActionError(null);
    setIsSwitchingBloque(true);
    triggerHaptic('selection');
    // Los borradores de edición pertenecen a la sesión anterior
    resetBorradores();

    // Modo demo: cambio local, sin API ni cola offline.
    if (isDemoMode) {
      const demo = buildDemoSesion(bloqueId, user?.id);
      setSesion(
        iniciarInmediato
          ? {
              ...demo,
              id: `sesion-demo-${bloqueId}-${Date.now()}`,
              estado: EstadoSesion.EN_PROGRESO,
              fechaInicioUtc: new Date().toISOString(),
            }
          : demo
      );
      setSelectedBloqueId(bloqueId);
      setFinishFeedback(null);
      setPendienteSync(false);
      setIsSwitchingBloque(false);
      return;
    }

    try {
      const nueva = await apiClient<SesionEntrenamientoDetalleDTO>(
        `/alumnos/me/sesiones/bloques/${encodeURIComponent(bloqueId)}/entrenar-hoy`,
        {
          method: 'POST',
          body: JSON.stringify({ timezoneCliente: tz, iniciarInmediato }),
        }
      );
      setSesion(nueva);
      setSelectedBloqueId(nueva.bloqueId || bloqueId);
      setFinishFeedback(null);
      setPendienteSync(false);
      await cacheSesion(nueva);
      await refreshSemana();
    } catch (err) {
      // RF-012: si el estado cambió en medio de la sesión, el bloqueo sustituye al error genérico.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
      } else {
        setActionError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos empezar este entrenamiento. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } finally {
      setIsSwitchingBloque(false);
    }
  };

  // "Repetir entrenamiento": nueva sesión en progreso del bloque ya completado (historial intacto)
  const handleRepetirBloque = async () => {
    if (!sesion?.bloqueId) return;
    await handleEntrenarBloqueHoy(sesion.bloqueId, true);
  };

  // Start workout session
  const handleStartSession = async () => {
    if (!sesion || isStarting) return;
    const nowUtc = new Date().toISOString();
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.EN_PROGRESO,
      fechaInicioUtc: nowUtc,
    };
    setSesion(updated);
    setActionError(null);

    // Modo demo: transición local sin llamadas reales ni cola offline.
    if (isDemoMode) return;

    setIsStarting(true);
    try {
      // D4: el estado "en progreso" se guarda ANTES de enviar/encolar: si el teléfono se recarga,
      // la sesión ya aparece iniciada y no se puede pulsar "Comenzar" otra vez.
      await cacheSesion(updated);

      const initPayload = { timezoneCliente: tz, fechaInicioUtc: nowUtc };
      // WU4: una sola key por mutación lógica; se reutiliza si el intento directo cae y se encola.
      const resultado = await enviarOEncolar(
        sesion.id,
        `/sesiones/${sesion.id}/iniciar`,
        'POST',
        initPayload,
        'Comenzar entrenamiento',
        generateIdempotencyKey()
      );

      if (resultado.estado === 'rechazado') {
        // RF-012: un bloqueo nunca se encola offline (reintentaría contra un 403 para siempre).
        const bloqueoDetectado = resolverBloqueoAlumno(resultado.error);
        setSesion(sesion);
        await cacheSesion(sesion);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          return;
        }
        setActionError(
          resultado.error instanceof Error && resultado.error.message
            ? resultado.error.message
            : 'No pudimos comenzar tu entrenamiento. Inténtalo de nuevo.'
        );
      }
    } finally {
      setIsStarting(false);
    }
  };

  return { isStarting, handleEntrenarBloqueHoy, handleRepetirBloque, handleStartSession };
}
