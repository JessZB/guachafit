/**
 * RF-015 (Ola 3): data hook of the notification-preferences matrix.
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:98-243`
 * (states, `cargar`, `guardar` and their handlers). Data hook (R1): it keeps
 * the EXACT mechanism the view uses today (R9) — `useState`/`useEffect`/
 * `useCallback` plus `apiClient` plus `useAuth`, with the explicit demo-mode
 * branch. No TanStack Query: the specs mount without `QueryClientProvider`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Rol,
  type CanalPreferenciaNotificacion,
  type CategoriaPreferenciasDTO,
  type PreferenciasNotificacionDTO,
} from '@guachafit/shared';
import { ApiError, apiClient, ErrorTiempoAgotado } from '../../../lib/api-client';
import { OPCIONES_GUARDADO_AJUSTES } from '../../../lib/mi-perfil';
import { useAuth } from '../../../context/auth-context';
import { triggerHaptic } from '../../../lib/haptics';
import { buildDemoPreferenciasNotificacion } from '../../../lib/demo-notificaciones';
import {
  CAMPO_CONFIRMACION_FINANZAS,
  aplicarCambioCanal,
  construirPayloadPreferencias,
  esErrorConfirmacionFinanzas,
  hayCambiosPreferencias,
  requiereConfirmacionFinanzas,
  type MatrizPreferenciasNotificacion,
  type ProblemaPreferenciasNotificacion,
} from '../../../lib/preferencias-notificacion';
import { clonarMatriz } from '../../../lib/matriz-preferencias-notificacion-clon';

export interface EstadoMatrizPreferencias {
  cargando: boolean;
  errorCarga: string | null;
  matriz: MatrizPreferenciasNotificacion | null;
  hayCambios: boolean;
  guardando: boolean;
  mensajeExito: string | null;
  errorGuardado: string | null;
  confirmacionFinanzasAbierta: boolean;
  cambiarCanal: (
    fila: CategoriaPreferenciasDTO,
    canal: CanalPreferenciaNotificacion,
    valor: boolean
  ) => void;
  guardar: () => void;
  confirmarDesactivacionFinanzas: () => void;
  cerrarConfirmacionFinanzas: () => void;
  recargar: () => void;
}

export function useMatrizPreferencias(): EstadoMatrizPreferencias {
  const { user, isDemoMode } = useAuth();
  const rol = user?.rol ?? Rol.ALUMNO;

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [original, setOriginal] = useState<MatrizPreferenciasNotificacion | null>(null);
  const [matriz, setMatriz] = useState<MatrizPreferenciasNotificacion | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [confirmacionFinanzasAbierta, setConfirmacionFinanzasAbierta] = useState(false);
  // Una vez confirmada la advertencia RN-02 en la sesión, un guardado posterior no vuelve a
  // interrumpir; el flag se reinicia si el usuario toca la fila de Finanzas.
  const [finanzasConfirmadas, setFinanzasConfirmadas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);

    // MODO DEMO EXPLÍCITO: matriz de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      const demo = buildDemoPreferenciasNotificacion(rol);
      setOriginal(clonarMatriz(demo.matriz));
      setMatriz(clonarMatriz(demo.matriz));
      setCargando(false);
      return;
    }

    try {
      const data = await apiClient<PreferenciasNotificacionDTO>('/notificaciones/preferencias');
      setOriginal(clonarMatriz(data.matriz));
      setMatriz(clonarMatriz(data.matriz));
    } catch (error) {
      setOriginal(null);
      setMatriz(null);
      setErrorCarga(
        error instanceof ApiError
          ? error.problem?.detail || error.problem?.message || error.message
          : 'No se pudieron cargar tus preferencias de notificación. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setCargando(false);
    }
  }, [isDemoMode, rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hayCambios = !!original && !!matriz && hayCambiosPreferencias(original, matriz);

  const cambiarCanal = (
    fila: CategoriaPreferenciasDTO,
    canal: CanalPreferenciaNotificacion,
    valor: boolean
  ) => {
    triggerHaptic('selection');
    setMatriz((previa) => (previa ? aplicarCambioCanal(previa, fila.id, canal, valor) : previa));
    setMensajeExito(null);
    setErrorGuardado(null);
    if (fila.id === 'FINANZAS' || fila.id === 'COBRANZAS') setFinanzasConfirmadas(false);
  };

  const guardar = async () => {
    if (!matriz || !original) return;
    setGuardando(true);
    setMensajeExito(null);
    setErrorGuardado(null);

    const requiereConfirmacion = requiereConfirmacionFinanzas(rol, matriz);

    try {
      if (isDemoMode) {
        // Demo: la matriz se aplica a la sesión; no se finge una persistencia que no existe.
        setOriginal(clonarMatriz(matriz));
        setFinanzasConfirmadas(requiereConfirmacion);
        setConfirmacionFinanzasAbierta(false);
        setMensajeExito('Preferencias guardadas en esta sesión de demostración.');
        triggerHaptic('success');
        return;
      }

      const payload = construirPayloadPreferencias(rol, matriz);
      const cuerpo = requiereConfirmacion
        ? { ...payload, [CAMPO_CONFIRMACION_FINANZAS]: true }
        : payload;

      const res = await apiClient<PreferenciasNotificacionDTO>('/notificaciones/preferencias', {
        ...OPCIONES_GUARDADO_AJUSTES,
        method: 'PUT',
        body: JSON.stringify(cuerpo),
      });

      setOriginal(clonarMatriz(res.matriz));
      setMatriz(clonarMatriz(res.matriz));
      setFinanzasConfirmadas(requiereConfirmacion);
      setConfirmacionFinanzasAbierta(false);
      setMensajeExito('Preferencias guardadas. Se aplicarán a tus próximas notificaciones.');
      triggerHaptic('success');
    } catch (error) {
      const problema =
        error instanceof ApiError
          ? (error.problem as ProblemaPreferenciasNotificacion | undefined)
          : undefined;

      if (esErrorConfirmacionFinanzas(problema)) {
        // Red de seguridad del servidor: el flujo normal ya pregunta antes de enviar.
        setConfirmacionFinanzasAbierta(true);
      } else {
        setErrorGuardado(
          error instanceof ErrorTiempoAgotado
            ? error.message
            : error instanceof ApiError
              ? error.problem?.detail ||
                error.problem?.message ||
                error.message ||
                'No se pudieron guardar tus preferencias. Inténtalo de nuevo.'
              : 'No se pudieron guardar tus preferencias. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = () => {
    if (!matriz || !hayCambios || guardando) return;
    if (requiereConfirmacionFinanzas(rol, matriz) && !finanzasConfirmadas) {
      setConfirmacionFinanzasAbierta(true);
      return;
    }
    void guardar();
  };

  const confirmarDesactivacionFinanzas = () => {
    triggerHaptic('warning');
    setFinanzasConfirmadas(true);
    setConfirmacionFinanzasAbierta(false);
    void guardar();
  };

  return {
    cargando,
    errorCarga,
    matriz,
    hayCambios,
    guardando,
    mensajeExito,
    errorGuardado,
    confirmacionFinanzasAbierta,
    cambiarCanal,
    guardar: handleGuardar,
    confirmarDesactivacionFinanzas,
    cerrarConfirmacionFinanzas: () => setConfirmacionFinanzasAbierta(false),
    recargar: () => void cargar(),
  };
}
