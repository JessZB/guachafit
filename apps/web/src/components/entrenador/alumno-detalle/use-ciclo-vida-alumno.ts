/**
 * Hook del ciclo de vida del alumno (RF-012): pausar / reactivar / suspender por pago,
 * archivar (baja lógica) y restaurar.
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). Las confirmaciones viajan por
 * `solicitarConfirmacion` del contenedor (diálogo compartido de la ficha).
 */
import { useState } from 'react';
import type React from 'react';
import {
  EstadoAlumno,
  type PerfilAlumnoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  CONFIRMACION_CAMBIO_ESTADO,
  MENSAJE_EXITO_ESTADO,
  TEXTO_BOTON_CAMBIO_ESTADO,
  separarPreguntaYDetalle,
  type ConfirmacionFicha,
} from '../../../lib/alumno-detalle-textos';

export interface ParametrosCicloVida {
  alumnoId: string | undefined;
  isDemoMode: boolean;
  alumno: PerfilAlumnoDetalleDTO | null;
  setAlumno: React.Dispatch<React.SetStateAction<PerfilAlumnoDetalleDTO | null>>;
  solicitarConfirmacion: (confirmacion: ConfirmacionFicha) => void;
}

export function useCicloVidaAlumno({
  alumnoId,
  isDemoMode,
  alumno,
  setAlumno,
  solicitarConfirmacion,
}: ParametrosCicloVida) {
  const [confirmandoFicha, setConfirmandoFicha] = useState(false);
  const [headerActionError, setHeaderActionError] = useState<string | null>(null);
  // WU-D (RF-012): confirmación honesta de las acciones del ciclo de vida (pausar/suspender/reactivar).
  const [headerActionSuccess, setHeaderActionSuccess] = useState<string | null>(null);

  // Cambio de Estado de Activación (Pausar / Reactivar / Suspender por pago) — RF-012
  const solicitarCambioEstado = async (nuevoEstado: EstadoAlumno) => {
    if (!alumnoId || !alumno) return;
    const nombre = `${alumno.nombres} ${alumno.apellidos}`.trim();
    solicitarConfirmacion({
      ...separarPreguntaYDetalle(CONFIRMACION_CAMBIO_ESTADO[nuevoEstado](nombre)),
      boton: TEXTO_BOTON_CAMBIO_ESTADO[nuevoEstado],
      accion: () => cambiarEstadoConfirmado(nuevoEstado),
    });
  };

  const cambiarEstadoConfirmado = async (nuevoEstado: EstadoAlumno) => {
    if (!alumnoId || !alumno) return;
    setHeaderActionError(null);
    setHeaderActionSuccess(null);

    // MODO DEMO EXPLÍCITO: el cambio vive en estado local, sin llamada real ni éxito fabricado
    // desde el servidor (el badge demo lo declara).
    if (isDemoMode) {
      setAlumno((prev) => (prev ? { ...prev, estadoActivacion: nuevoEstado } : null));
      setHeaderActionSuccess(MENSAJE_EXITO_ESTADO[nuevoEstado]);
      setTimeout(() => setHeaderActionSuccess(null), 3000);
      return;
    }

    try {
      await apiClient.patch(`/alumnos/${alumnoId}/estado`, { nuevoEstado });
      // D5: el estado solo cambia con la respuesta 2xx del servidor; nunca éxito falso.
      setAlumno((prev) => (prev ? { ...prev, estadoActivacion: nuevoEstado } : null));
      setHeaderActionSuccess(MENSAJE_EXITO_ESTADO[nuevoEstado]);
      setTimeout(() => setHeaderActionSuccess(null), 3000);
    } catch (err: unknown) {
      setHeaderActionError(
        err instanceof Error ? err.message : 'No se pudo cambiar el estado del alumno. Inténtalo de nuevo.'
      );
    }
  };

  // Archivar alumno (baja lógica: los datos se conservan y se puede restaurar)
  const solicitarArchivo = () => {
    if (!alumnoId || !alumno) return;
    solicitarConfirmacion({
      titulo: `¿Archivar a ${alumno.nombres} ${alumno.apellidos}?`,
      detalle:
        'Dejará de tener acceso a la app. Su historial de entrenamiento, medidas y pagos se conserva y podrás restaurarlo cuando regrese.',
      boton: 'Archivar alumno',
      variante: 'peligro',
      accion: archivarConfirmado,
    });
  };

  const archivarConfirmado = async () => {
    if (!alumnoId || !alumno) return;
    setHeaderActionError(null);

    try {
      await apiClient.delete(`/alumnos/${alumnoId}`);
    } catch (err: unknown) {
      setHeaderActionError(
        err instanceof Error ? err.message : 'No se pudo archivar al alumno. Inténtalo de nuevo.'
      );
      return;
    }

    // A13: la ficha se vuelve a leer del servidor (fuente de verdad) en lugar de inventar el
    // estado archivado en local.
    try {
      const perfil = await apiClient<PerfilAlumnoDetalleDTO>(`/alumnos/${alumnoId}`);
      if (perfil) setAlumno(perfil);
    } catch {
      setHeaderActionError(
        'El alumno se archivó, pero no pudimos actualizar su ficha. Recarga la página para verla al día.'
      );
    }
  };

  // Restaurar Alumno Archivado
  const restaurarAlumno = async () => {
    if (!alumnoId || !alumno) return;
    setHeaderActionError(null);

    try {
      await apiClient.patch(`/alumnos/${alumnoId}/restaurar`, {});
      setAlumno((prev) =>
        prev ? { ...prev, deletedAtUtc: null, estadoActivacion: EstadoAlumno.ACTIVO } : null
      );
    } catch (err: unknown) {
      setHeaderActionError(
        err instanceof Error ? err.message : 'No se pudo restaurar al alumno. Inténtalo de nuevo.'
      );
    }
  };

  /** Ejecuta la confirmación pendiente de la ficha (diálogo compartido del contenedor). */
  const ejecutarConfirmacionFicha = async (
    confirmacion: ConfirmacionFicha | null,
    alTerminar: () => void
  ) => {
    if (!confirmacion) return;
    setConfirmandoFicha(true);
    try {
      await confirmacion.accion();
    } finally {
      setConfirmandoFicha(false);
      alTerminar();
    }
  };

  return {
    confirmandoFicha,
    headerActionError,
    headerActionSuccess,
    solicitarCambioEstado,
    solicitarArchivo,
    restaurarAlumno,
    ejecutarConfirmacionFicha,
  };
}

export type RetornoCicloVida = ReturnType<typeof useCicloVidaAlumno>;
