/**
 * Onboarding (WU-E RF-011): resolucion publica del codigo de coach.
 *
 * Hook de datos de `OnboardingPage`: el codigo llega solo de la URL (`?coach=`), sin campo
 * editable, asi que la consulta (`apiClient` con `skipAuth`) se lanza de inmediato dentro del
 * `useEffect`, con una bandera de cancelacion que evita aplicar respuestas obsoletas. Los tipos
 * de dominio vienen de `@guachafit/shared` (R4).
 *
 * D17: solo un 400/404 de la API (o un formato inválido) cuenta como enlace `invalido`; un
 * fallo de red, 5xx o 429 pasa a `error` y `reintentar()` vuelve a lanzar la consulta.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CoachPublicoDTO } from '@guachafit/shared';
import { ApiError, apiClient } from '../../../lib/api-client';
import {
  esFormatoCoachCodeValido,
  normalizarCoachCode,
} from '../../../lib/onboarding-links';

export type EstadoValidacionCoach = 'vacio' | 'validando' | 'valido' | 'invalido' | 'error';

export interface ValidacionCoach {
  estado: EstadoValidacionCoach;
  coachInfo: CoachPublicoDTO | null;
  /** Vuelve a consultar el código (útil tras un `error` de red o de servidor). */
  reintentar: () => void;
}

/**
 * Estado del primer render, derivado del código: evita un parpadeo de «sin código» (o de
 * «enlace no válido») antes de que el efecto lance la consulta.
 */
function estadoInicial(coachCode: string): EstadoValidacionCoach {
  const codigo = normalizarCoachCode(coachCode);
  if (codigo.length === 0) return 'vacio';
  return esFormatoCoachCodeValido(codigo) ? 'validando' : 'invalido';
}

/** El código no existe o su formato no es el esperado: el enlace no sirve. */
function esRechazoDeCodigo(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 400 || err.status === 404);
}

/** Resuelve `coachCode` (tomado de los parámetros de la URL, `?coach=`) contra `GET /alumnos/coach/:code`. */
export function useValidacionCoach(coachCode: string): ValidacionCoach {
  const [coachInfo, setCoachInfo] = useState<CoachPublicoDTO | null>(null);
  const [estado, setEstado] = useState<EstadoValidacionCoach>(() =>
    estadoInicial(coachCode)
  );
  const [intento, setIntento] = useState(0);

  const reintentar = useCallback(() => setIntento((actual) => actual + 1), []);

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

    apiClient<CoachPublicoDTO>(`/alumnos/coach/${encodeURIComponent(codigo)}`, {
      skipAuth: true,
    })
      .then((info) => {
        if (cancelado) return;
        setCoachInfo(info);
        setEstado('valido');
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setCoachInfo(null);
        setEstado(esRechazoDeCodigo(err) ? 'invalido' : 'error');
      });

    return () => {
      cancelado = true;
    };
  }, [coachCode, intento]);

  return { estado, coachInfo, reintentar };
}
