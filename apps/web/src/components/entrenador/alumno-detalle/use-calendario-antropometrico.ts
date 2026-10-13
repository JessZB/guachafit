/**
 * Hook del calendario antropométrico del alumno (RF-003 RN-01, WU RF-003b).
 *
 * Guarda periodicidad + ancla con un PATCH parcial a `/alumnos/:id` sin tocar el resto del
 * expediente. Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). La periodicidad y el inicio viven en el
 * expediente (se hidratan del perfil) y llegan por parámetros.
 */
import { useState } from 'react';
import type React from 'react';
import type { PerfilAlumnoDetalleDTO, PeriodicidadAntropometria } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';

export interface ParametrosCalendarioAntropometrico {
  alumnoId: string | undefined;
  isDemoMode: boolean;
  periodicidad: PeriodicidadAntropometria | '';
  inicio: string;
  setAlumno: React.Dispatch<React.SetStateAction<PerfilAlumnoDetalleDTO | null>>;
}

export function useCalendarioAntropometrico({
  alumnoId,
  isDemoMode,
  periodicidad,
  inicio,
  setAlumno,
}: ParametrosCalendarioAntropometrico) {
  const [isGuardandoCalendario, setIsGuardandoCalendario] = useState(false);
  const [calendarioError, setCalendarioError] = useState<string | null>(null);
  const [calendarioSuccess, setCalendarioSuccess] = useState<string | null>(null);

  /**
   * RF-003 RN-01 (WU RF-003b): guarda el calendario antropométrico del alumno con un PATCH parcial
   * a `/alumnos/:id` (no toca el resto del expediente). Validación local explícita: activar una
   * periodicidad sin ancla es un calendario inerte y la API lo rechaza con 400; aquí se avisa
   * antes de enviar. Solo se declara éxito con 2xx (o el cambio local en modo demo).
   */
  const guardarCalendario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoId) return;
    setCalendarioError(null);
    setCalendarioSuccess(null);

    const periodicidadEnvio = periodicidad === '' ? null : periodicidad;
    const inicioEnvio = inicio.trim() || null;

    if (periodicidadEnvio && !inicioEnvio) {
      setCalendarioError(
        'Para activar la periodicidad del check-in antropométrico debes indicar la fecha de inicio del calendario.'
      );
      return;
    }

    setIsGuardandoCalendario(true);
    try {
      if (isDemoMode) {
        setAlumno((prev) =>
          prev
            ? {
                ...prev,
                periodicidadAntropometria: periodicidadEnvio,
                antropometriaInicio: inicioEnvio,
              }
            : prev
        );
      } else {
        const res = await apiClient.patch<PerfilAlumnoDetalleDTO>(`/alumnos/${alumnoId}`, {
          periodicidadAntropometria: periodicidadEnvio,
          antropometriaInicio: inicioEnvio,
        });
        setAlumno((prev) => (prev ? { ...prev, ...res } : res));
      }
      setCalendarioSuccess(
        periodicidadEnvio
          ? 'Calendario antropométrico guardado: el alumno ya tiene fechas programadas.'
          : 'Periodicidad desactivada: el alumno queda sin ventana de check-in.'
      );
      setTimeout(() => setCalendarioSuccess(null), 3000);
    } catch (err: unknown) {
      // D5: el calendario solo cambia con respuesta OK; nunca éxito falso ni mutación local.
      setCalendarioError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el calendario antropométrico. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsGuardandoCalendario(false);
    }
  };

  return { isGuardandoCalendario, calendarioError, calendarioSuccess, guardarCalendario };
}

export type RetornoCalendarioAntropometrico = ReturnType<typeof useCalendarioAntropometrico>;
