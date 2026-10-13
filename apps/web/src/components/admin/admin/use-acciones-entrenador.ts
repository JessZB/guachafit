/**
 * RF-010 RN-01 (WU Admin): acciones de cuenta y licencia con confirmación previa.
 *
 * Hook de datos extraído de `AdminPage` con el MISMO mecanismo que usa hoy (R9): la acción nunca
 * se ejecuta sin confirmar; en demo aplica el cambio al fixture de la sesión (sin red) con su
 * aviso; en real hace `PATCH estado/licencia` y solo anuncia éxito con un 2xx real, recargando
 * el listado. Cualquier fallo cae en `accionError`.
 */
import { useState } from 'react';
import {
  EstadoLicencia,
  type CambioEstadoEntrenadorResultadoDTO,
  type CambioLicenciaEntrenadorResultadoDTO,
  type EntrenadorAdminDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  endpointEstadoEntrenador,
  endpointLicenciaEntrenador,
  type CambioDemoEntrenador,
} from '../../../lib/admin-entrenadores';
import type { AccionEntrenador } from '../../../lib/admin-confirmacion';

export interface OpcionesAccionesEntrenador {
  isDemoMode: boolean;
  /** Aplica un cambio demo en el estado del contenedor (sesión actual, sin red). */
  onAplicarCambioDemo: (usuarioId: string, cambio: CambioDemoEntrenador) => void;
  /** Recarga el listado tras un 2xx real. */
  onRecargar: () => void;
}

export function useAccionesEntrenador({
  isDemoMode,
  onAplicarCambioDemo,
  onRecargar,
}: OpcionesAccionesEntrenador) {
  // Confirmación accesible y feedback honesto (solo se anuncia éxito con un 2xx real).
  const [confirmacion, setConfirmacion] = useState<AccionEntrenador | null>(null);
  const [procesandoUsuarioId, setProcesandoUsuarioId] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const solicitarCambioEstado = (entrenador: EntrenadorAdminDTO, activo: boolean) => {
    setAccionError(null);
    setAviso(null);
    setConfirmacion({ tipo: 'estado', entrenador, activo });
  };

  const solicitarCambioLicencia = (
    entrenador: EntrenadorAdminDTO,
    estadoLicencia: EstadoLicencia
  ) => {
    setAccionError(null);
    setAviso(null);
    setConfirmacion({ tipo: 'licencia', entrenador, estadoLicencia });
  };

  /**
   * Ejecuta la acción confirmada. El aviso de éxito SOLO se muestra cuando la API responde 2xx
   * (en demo, cuando el cambio se aplica al fixture local); cualquier fallo cae en `accionError`.
   */
  const confirmarAccion = async () => {
    if (!confirmacion) return;
    const { entrenador } = confirmacion;
    setProcesandoUsuarioId(entrenador.usuarioId);
    setAccionError(null);
    try {
      if (isDemoMode) {
        const cambio: CambioDemoEntrenador =
          confirmacion.tipo === 'estado'
            ? { activo: confirmacion.activo }
            : { estadoLicencia: confirmacion.estadoLicencia };
        onAplicarCambioDemo(entrenador.usuarioId, cambio);
        setAviso('Cambio aplicado en esta sesión de demostración (no se guardó en el servidor).');
        setConfirmacion(null);
        return;
      }

      if (confirmacion.tipo === 'estado') {
        const respuesta = await apiClient.patch<CambioEstadoEntrenadorResultadoDTO>(
          endpointEstadoEntrenador(entrenador.usuarioId),
          { activo: confirmacion.activo }
        );
        setAviso(respuesta.mensaje);
      } else {
        const respuesta = await apiClient.patch<CambioLicenciaEntrenadorResultadoDTO>(
          endpointLicenciaEntrenador(entrenador.usuarioId),
          { estadoLicencia: confirmacion.estadoLicencia }
        );
        setAviso(respuesta.mensaje);
      }
      setConfirmacion(null);
      onRecargar();
    } catch (err) {
      setAccionError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo aplicar el cambio. Intenta de nuevo.'
      );
    } finally {
      setProcesandoUsuarioId(null);
    }
  };

  return {
    confirmacion,
    setConfirmacion,
    procesandoUsuarioId,
    accionError,
    aviso,
    solicitarCambioEstado,
    solicitarCambioLicencia,
    confirmarAccion,
  };
}
