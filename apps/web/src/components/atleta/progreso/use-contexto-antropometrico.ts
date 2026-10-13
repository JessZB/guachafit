/**
 * Hook de datos: contexto antropométrico efectivo del alumno (SL1, fase B).
 *
 * Extraído verbatim de `ProgresoPage.tsx:105-110, 137-190` (R9: mismo mecanismo
 * `apiClient` + `useEffect`, sin migrar a TanStack Query). Sin JSX ni estilos:
 * solo sesión fresca `/auth/me`, escenario demo conmutable, modalidad, ventana
 * de check-in y motivo de bloqueo. §6: sin UI, no aplica superficie táctil.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { calcularEstadoVentanaCheckinAntropometrico } from '../../../lib/antropometria-ventana';
import {
  contextoDemoAntropometria,
  type EscenarioDemoAntropometria,
} from '../../../lib/demo-antropometria';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import { AuthUserDTO, Modalidad } from '@guachafit/shared';

export function useContextoAntropometrico(
  user: AuthUserDTO | null,
  isDemoMode: boolean
) {
  /**
   * RF-003 RN-03/RN-04 (WU RF-003b): sesión fresca de `/auth/me`. La modalidad y el calendario
   * antropométrico se re-resuelven del perfil para que un cambio del coach se refleje sin esperar
   * la rotación del token. Si la consulta falla se conserva el snapshot del login (dato real) y
   * sin calendario la ventana no aplica, igual que en el servidor.
   */
  const [sesionFresca, setSesionFresca] = useState<AuthUserDTO | null>(null);
  // Escenario demo conmutable (solo con isDemoMode): remoto en ventana / fuera / presencial.
  const [escenarioDemo, setEscenarioDemo] =
    useState<EscenarioDemoAntropometria>('remoto-ventana');

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setSesionFresca(null);
      return;
    }
    let cancelado = false;
    apiClient<{ usuario: AuthUserDTO }>('/auth/me')
      .then((respuesta) => {
        if (!cancelado) setSesionFresca(respuesta?.usuario ?? null);
      })
      .catch(() => {
        // Best-effort: el snapshot del login sigue siendo dato real y el servidor es la red de
        // seguridad (403 presencial / 400 de ventana). No se fabrica estado.
        if (!cancelado) setSesionFresca(null);
      });
    return () => {
      cancelado = true;
    };
  }, [isDemoMode, user?.id]);

  /**
   * Contexto antropométrico efectivo del alumno:
   * - Demo: lo define el escenario conmutable (fixture relativo a hoy).
   * - Real: `/auth/me` (perfil fresco) con el snapshot del login como respaldo.
   */
  const contextoAntropometrico = useMemo(() => {
    if (isDemoMode) return contextoDemoAntropometria(escenarioDemo);
    return {
      modalidad: sesionFresca?.modalidad ?? user?.modalidad ?? null,
      periodicidadAntropometria: sesionFresca?.periodicidadAntropometria ?? null,
      antropometriaInicio: sesionFresca?.antropometriaInicio ?? null,
    };
  }, [isDemoMode, escenarioDemo, sesionFresca, user?.modalidad]);

  /** RN-03: con modalidad presencial el alumno tiene solo lectura (el servidor responde 403). */
  const esSoloLectura = contextoAntropometrico.modalidad === Modalidad.PRESENCIAL;

  /** RN-04/§6: estado del calendario y de la ventana de check-in en el día local. */
  const estadoVentana = useMemo(
    () =>
      calcularEstadoVentanaCheckinAntropometrico({
        periodicidad: contextoAntropometrico.periodicidadAntropometria,
        antropometriaInicio: contextoAntropometrico.antropometriaInicio,
        hoyLocal: fechaCalendarioLocal(),
      }),
    [contextoAntropometrico]
  );

  /** Motivo por el que el registro remoto no está disponible ahora mismo (o null). */
  const motivoRegistroBloqueado = esSoloLectura
    ? 'Tus medidas las registra tu entrenador en sala.'
    : estadoVentana.permiteRegistrar
      ? null
      : estadoVentana.motivoBloqueo;

  return {
    esSoloLectura,
    estadoVentana,
    motivoRegistroBloqueado,
    escenarioDemo,
    setEscenarioDemo,
  };
}
