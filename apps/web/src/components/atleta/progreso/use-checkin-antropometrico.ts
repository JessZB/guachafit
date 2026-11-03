/**
 * Hook de datos: envío del check-in antropométrico (SL4, fase B).
 *
 * De `ProgresoPage.tsx:81-82, 109-111, 126-135, 236-260, 298-391` (R9: mismo
 * mecanismo `apiClient` directo + POST, sin migrar a TanStack Query). Las
 * medidas viven en `use-medidas-checkin`; aquí: fotos, `claveFotos`, estados
 * de envío, apertura con guardas y `handleSubmitCheckin` con 403/bloqueo.
 * Sin JSX ni estilos. §6: sin UI.
 */
import { useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { construirPayloadCheckinAntropometrico } from '../../../lib/antropometria-checkin';
import { zonaPerfilEfectiva } from '../../../lib/nutricion-checkin';
import { fechaCalendarioEnZona } from '../../../lib/zona-horaria';
import type { EstadoVentanaCheckinCalculado } from '../../../lib/antropometria-ventana';
import {
  AuthUserDTO,
  ControlAntropometricoDetalleDTO,
  EvolucionCorporalDTO,
  type FotoAntropometriaInputDTO,
} from '@guachafit/shared';
import {
  useMedidasCheckin,
  type ClaveMedidaFormularioCheckin,
  type MedidasFormularioCheckin,
} from './use-medidas-checkin';

export interface OpcionesCheckinAntropometrico {
  user: AuthUserDTO | null;
  isDemoMode: boolean;
  evolucion: EvolucionCorporalDTO | null;
  esSoloLectura: boolean;
  estadoVentana: EstadoVentanaCheckinCalculado;
  /** Zona efectiva del contexto (sesión fresca); sin ella se usa la del usuario del login. */
  zonaPerfil?: string | null;
  onAbrirFormulario: () => void;
  onEvolucionActualizada: (evolucion: EvolucionCorporalDTO) => void;
  onBloqueo: (bloqueo: BloqueoAlumno) => void;
  onCheckinExitoso: () => void;
}

export function useCheckinAntropometrico({
  user,
  isDemoMode,
  evolucion,
  esSoloLectura,
  estadoVentana,
  zonaPerfil,
  onAbrirFormulario,
  onEvolucionActualizada,
  onBloqueo,
  onCheckinExitoso,
}: OpcionesCheckinAntropometrico) {
  const {
    medidas,
    actualizarMedida,
    erroresMedidas,
    intentoEnvio,
    setIntentoEnvio,
    precargarUltimaMedicion,
    hayCambiosMedidas,
    descartarMedidas,
  } = useMedidasCheckin(user?.id, isDemoMode);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // RF-003 RN-02: fotos del check-in (opcionales). `claveFotos` vuelve a montar el selector vacío.
  const [fotosCheckin, setFotosCheckin] = useState<{
    fotos: FotoAntropometriaInputDTO[];
    subiendo: boolean;
  }>({ fotos: [], subiendo: false });
  const [claveFotos, setClaveFotos] = useState(0);
  // Hay datos sin guardar si el alumno cambió alguna medida o adjuntó fotos.
  const hayCambiosSinGuardar = hayCambiosMedidas || fotosCheckin.fotos.length > 0;
  const [submitSuccess, setSubmitSuccess] = useState(false);
  // D5: fallo de envío visible; el check-in no se declara exitoso si el server no lo aceptó.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Mensaje real del 403 del servidor si la modalidad cambió y el formulario ya no es válido.
  const [accesoPresencialServidor, setAccesoPresencialServidor] = useState<string | null>(null);

  /**
   * Abre el formulario de check-in. En sesión real precarga la última medición real disponible
   * (sin pisar lo que el alumno ya haya escrito); sin evolución, los campos quedan vacíos.
   * Con la ventana cerrada o en solo lectura no se abre: el botón queda deshabilitado con motivo.
   */
  const abrirFormularioCheckin = () => {
    if (esSoloLectura || !estadoVentana.permiteRegistrar) return;
    precargarUltimaMedicion(evolucion);
    setIntentoEnvio(false);
    onAbrirFormulario();
  };

  /** Descarta medidas y fotos no guardadas, y remonta el selector de fotos vacío. */
  const descartarCheckin = () => {
    descartarMedidas();
    setFotosCheckin({ fotos: [], subiendo: false });
    setClaveFotos((clave) => clave + 1);
  };

  /** Limpia los errores de envío (al cambiar de escenario demo). */
  const reiniciarEstadoEnvio = () => {
    setSubmitError(null);
    setAccesoPresencialServidor(null);
  };

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setSubmitError('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
      return;
    }
    // D9: fuera de demo y sin conexión, el envío no se encola ni se procesa.
    if (typeof navigator !== 'undefined' && !navigator.onLine && !isDemoMode) {
      setSubmitError('Conéctate a internet para enviar tu evaluación.');
      return;
    }
    // Defensa en profundidad: la ventana y el solo lectura se validan antes de llamar a la API.
    if (esSoloLectura) {
      setSubmitError('Tus medidas las registra tu entrenador en sala: no puedes enviar el check-in.');
      return;
    }
    if (!estadoVentana.permiteRegistrar) {
      setSubmitError(
        estadoVentana.motivoBloqueo ??
          'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador.'
      );
      return;
    }
    if (fotosCheckin.subiendo) {
      setSubmitError('Espera a que terminen de subirse las fotos.');
      return;
    }
    setIntentoEnvio(true);
    if (Object.keys(erroresMedidas).length > 0) {
      setSubmitError('Revisa los campos marcados antes de enviar tu check-in.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Endpoint real (POST /antropometria/checkin, rol ALUMNO): exige `alumnoId` (usuarioId)
      // y `fechaEvaluacion` (YYYY-MM-DD local). El helper valida contra el contrato compartido
      // para que un valor fuera de rango nunca se traduzca en un 400 opaco del servidor.
      const payload = construirPayloadCheckinAntropometrico(user.id, {
        pesoKg: medidas.pesoKg,
        porcentajeGrasa: medidas.porcentajeGrasa,
        cinturaCm: medidas.cinturaCm,
        brazoRelajadoCm: medidas.brazoRelajadoCm,
        brazoContraidoCm: medidas.brazoContraidoCm,
        musloMedioCm: medidas.musloMedioCm,
        tricepsMm: medidas.tricepsMm,
        subescapularMm: medidas.subescapularMm,
        suprailiacoMm: medidas.suprailiacoMm,
        abdominalMm: medidas.abdominalMm,
      }, fechaCalendarioEnZona(zonaPerfilEfectiva(zonaPerfil ?? user.zonaHoraria)), fotosCheckin.fotos);
      // En la demostración el envío se simula en local (el payload igual se valida arriba).
      if (!isDemoMode) {
        await apiClient<ControlAntropometricoDetalleDTO>('/antropometria/checkin', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Refresco real (sin tirar el estado de éxito): el check-in remoto queda PENDIENTE de
        // aprobación, así que la curva de evolución puede no cambiar todavía; se re-consulta
        // igualmente para no mostrar datos obsoletos si el coach ya aprobó otros controles.
        const evolucionActualizada = await apiClient<EvolucionCorporalDTO>(
          `/antropometria/evolucion/${user.id}`
        ).catch(() => null);
        if (evolucionActualizada) onEvolucionActualizada(evolucionActualizada);
      }

      setClaveFotos((clave) => clave + 1);
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        onCheckinExitoso();
      }, 1800);
    } catch (err: any) {
      // RF-012: bloqueo de ciclo de vida (pausado) → panel informativo; el historial sigue visible.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        onBloqueo(bloqueoDetectado);
        setSubmitError(null);
        return;
      }
      // RN-03: si el perfil cambió a presencial después de cargar la página, el 403 del servidor
      // se muestra tal cual y la vista pasa al estado de solo lectura (nunca un error genérico).
      if (err?.status === 403) {
        setAccesoPresencialServidor(
          err?.message ||
            'Los alumnos en modalidad presencial no registran sus propias medidas: las toma tu entrenador y quedan verificadas.'
        );
        setSubmitError(null);
        return;
      }
      // D5: sin éxito falso; el check-in solo queda enviado si el servidor lo aceptó (2xx).
      setSubmitError(
        err?.message || 'No se pudo enviar tu check-in. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    medidas,
    actualizarMedida,
    erroresMedidas,
    intentoEnvio,
    isSubmitting,
    fotosCheckin,
    setFotosCheckin,
    claveFotos,
    submitSuccess,
    submitError,
    accesoPresencialServidor,
    abrirFormularioCheckin,
    handleSubmitCheckin,
    reiniciarEstadoEnvio,
    hayCambiosSinGuardar,
    descartarCheckin,
  };
}

export type { ClaveMedidaFormularioCheckin, MedidasFormularioCheckin };
