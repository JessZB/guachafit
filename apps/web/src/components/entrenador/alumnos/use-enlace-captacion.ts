/**
 * Módulo `alumnos` (fase B, prompt 53) · hook de datos del enlace de captación.
 *
 * Extraído verbatim de `pages/entrenador/AlumnosPage.tsx:145-179, 281-289`
 * (ver inventario 42 §3, `use-enlace-captacion` ~60 líneas).
 *
 * - WU-E (RF-011 RN-06): el enlace usa el coachCode REAL del entrenador
 *   (`GET /entrenador/perfil`). Nunca un código hardcodeado; en modo demo no se
 *   consulta la API.
 * - C5: el portapapeles puede fallar (permiso denegado, navegador sin API): aviso
 *   para copiar a mano.
 */

import { useEffect, useState } from 'react';
import type { PerfilEntrenadorDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { construirLinkOnboarding } from '../../../lib/onboarding-links';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../../lib/acceso-ui';

export function useEnlaceCaptacion({ isDemoMode }: { isDemoMode: boolean }) {
  // WU-E (RF-011 RN-06): el enlace de captación usa el coachCode REAL del entrenador
  // (GET /entrenador/perfil). Nunca un código hardcodeado; en modo demo no se consulta la API.
  const [coachCode, setCoachCode] = useState<string | null>(null);
  const [coachCodeError, setCoachCodeError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [errorCopiaCaptacion, setErrorCopiaCaptacion] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      // Modo demo explícito: sin llamadas a la API real. El enlace se muestra solo con el
      // código real del entrenador; no se inventa una identidad de coach para la demo.
      setCoachCode(null);
      setCoachCodeError(null);
      return;
    }

    let cancelado = false;
    apiClient<PerfilEntrenadorDTO>('/entrenador/perfil')
      .then((perfil) => {
        if (cancelado) return;
        setCoachCode(perfil.coachCode);
        setCoachCodeError(null);
      })
      .catch(() => {
        if (cancelado) return;
        setCoachCode(null);
        setCoachCodeError('No se pudo cargar tu enlace de captación. Recarga la página.');
      });

    return () => {
      cancelado = true;
    };
  }, [isDemoMode]);

  const registrationUrl = coachCode
    ? construirLinkOnboarding(coachCode, window.location.origin)
    : null;

  // C5: el portapapeles puede fallar (permiso denegado, navegador sin API): aviso para copiar a mano.
  const handleCopyLink = async () => {
    if (!registrationUrl) return;
    const ok = await copiarAlPortapapeles(registrationUrl);
    setErrorCopiaCaptacion(ok ? null : MENSAJE_COPIA_FALLIDA);
    if (!ok) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return {
    coachCode,
    coachCodeError,
    registrationUrl,
    isCopied,
    errorCopiaCaptacion,
    handleCopyLink,
  };
}

export type EnlaceCaptacion = ReturnType<typeof useEnlaceCaptacion>;
