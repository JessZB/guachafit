/**
 * Onboarding (WU-E RF-011, C7/C8): mutacion del registro publico.
 *
 * Hook de datos extraido de `OnboardingPage` sin cambiar el mecanismo (R9): el mismo
 * `apiClient` con `skipAuth`, las mismas validaciones locales previas al POST y la misma
 * redireccion a `/login` a los 2500ms, cancelada si la pantalla se desmonta antes.
 * La logica pura del cuerpo vive en `lib/onboarding-registro.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import {
  esErrorCorreoYaRegistrado,
  MENSAJE_COACH_NO_DISPONIBLE,
} from '../../../lib/onboarding-links';
import {
  construirPayloadRegistroOnboarding,
  type DatosRegistroOnboarding,
} from '../../../lib/onboarding-registro';
import {
  validarFechaNacimiento,
  validarTelefonoWhatsapp,
} from '../../../lib/formulario-registro';
import { MENSAJE_ERROR_GENERICO } from '../../../lib/mensajes-error';

/** Redireccion tras el exito, en ms (valor historico del contenedor). */
export const RETRASO_REDIRECCION_EXITO_MS = 2500;

export interface RegistroOnboarding {
  isLoading: boolean;
  success: boolean;
  error: string | null;
  correoYaRegistrado: boolean;
  errorWhatsapp: string | null;
  errorFecha: string | null;
  fijarErrorWhatsapp: (valor: string | null) => void;
  fijarErrorFecha: (valor: string | null) => void;
  registrar: (coachCodeValidado: string | null, datos: DatosRegistroOnboarding) => Promise<void>;
}

/**
 * @param navegar redireccion post-exito (el contenedor pasa `navigate` de react-router).
 */
export function useRegistroOnboarding(navegar: (ruta: string) => void): RegistroOnboarding {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correoYaRegistrado, setCorreoYaRegistrado] = useState(false);
  const [errorWhatsapp, setErrorWhatsapp] = useState<string | null>(null);
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  // C7: la redirección tras el éxito se cancela si la pantalla se desmonta antes.
  const redireccionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redireccionRef.current) clearTimeout(redireccionRef.current);
    },
    []
  );

  const registrar = async (
    coachCodeValidado: string | null,
    datos: DatosRegistroOnboarding
  ): Promise<void> => {
    setError(null);
    setCorreoYaRegistrado(false);

    if (!coachCodeValidado) {
      setError(MENSAJE_COACH_NO_DISPONIBLE);
      return;
    }

    const errorTelefono = validarTelefonoWhatsapp(datos.prefijoWhatsapp, datos.numeroWhatsapp);
    const errorNacimiento = validarFechaNacimiento(datos.fechaNacimiento);
    setErrorWhatsapp(errorTelefono);
    setErrorFecha(errorNacimiento);
    if (errorTelefono || errorNacimiento) return;

    setIsLoading(true);
    try {
      await apiClient('/alumnos/registro-publico', {
        method: 'POST',
        body: JSON.stringify(construirPayloadRegistroOnboarding(coachCodeValidado, datos)),
        skipAuth: true,
      });

      setSuccess(true);
      redireccionRef.current = setTimeout(() => {
        navegar('/login');
      }, RETRASO_REDIRECCION_EXITO_MS);
    } catch (err: unknown) {
      // C8: correo ya registrado → se ofrece ir a iniciar sesión.
      setCorreoYaRegistrado(esErrorCorreoYaRegistrado(err));
      setError((err as { message?: string } | null)?.message || MENSAJE_ERROR_GENERICO);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    success,
    error,
    correoYaRegistrado,
    errorWhatsapp,
    errorFecha,
    fijarErrorWhatsapp: setErrorWhatsapp,
    fijarErrorFecha: setErrorFecha,
    registrar,
  };
}
