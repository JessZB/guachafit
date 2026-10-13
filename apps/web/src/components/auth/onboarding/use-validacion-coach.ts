/**
 * Onboarding (WU-E RF-011): resolucion publica del codigo de coach con debounce.
 *
 * Hook de datos extraido de `OnboardingPage` sin cambiar el mecanismo (R9): el mismo
 * `useEffect` + `setTimeout(400)` + `apiClient` con `skipAuth`, con la misma bandera de
 * cancelacion. Los tipos de dominio vienen de `@guachafit/shared` (R4).
 */
import { useEffect, useState } from 'react';
import type { CoachPublicoDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  esFormatoCoachCodeValido,
  normalizarCoachCode,
} from '../../../lib/onboarding-links';

export type EstadoValidacionCoach = 'vacio' | 'validando' | 'valido' | 'invalido';

export interface ValidacionCoach {
  estado: EstadoValidacionCoach;
  coachInfo: CoachPublicoDTO | null;
}

/** Resuelve `coachCode` (tal cual lo escribe el usuario) contra `GET /alumnos/coach/:code`. */
export function useValidacionCoach(coachCode: string): ValidacionCoach {
  const [coachInfo, setCoachInfo] = useState<CoachPublicoDTO | null>(null);
  const [estado, setEstado] = useState<EstadoValidacionCoach>('vacio');

  useEffect(() => {
    const codigo = normalizarCoachCode(coachCode);

    if (codigo.length === 0) {
      setEstado('vacio');
      setCoachInfo(null);
      return;
    }

    if (!esFormatoCoachCodeValido(codigo)) {
      setEstado('invalido');
      setCoachInfo(null);
      return;
    }

    let cancelado = false;
    setEstado('validando');
    setCoachInfo(null);

    const timer = setTimeout(() => {
      apiClient<CoachPublicoDTO>(`/alumnos/coach/${encodeURIComponent(codigo)}`, {
        skipAuth: true,
      })
        .then((info) => {
          if (cancelado) return;
          setCoachInfo(info);
          setEstado('valido');
        })
        .catch(() => {
          if (cancelado) return;
          setCoachInfo(null);
          setEstado('invalido');
        });
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [coachCode]);

  return { estado, coachInfo };
}
