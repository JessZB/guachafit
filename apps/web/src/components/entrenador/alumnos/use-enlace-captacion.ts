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
 * - D17: ciclo de vida del enlace. `rotarEnlace` (`POST /entrenador/captacion/rotar`) corta el
 *   código anterior de inmediato; `alternarCaptacion` (`PATCH /entrenador/captacion`) pausa o
 *   reanuda los registros; `registrosPorEnlace` cuenta los alumnos del enlace vigente. Ante un
 *   fallo se deja `errorCaptacion` y el estado no cambia. En demo no se llama a la API.
 *   `recargarCaptacion` repite la consulta del perfil (al abrir el modal «Invitar»); si falla,
 *   conserva los datos ya cargados.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActualizarCaptacionDTO,
  CaptacionEntrenadorResultadoDTO,
  PerfilEntrenadorDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { construirLinkOnboarding } from '../../../lib/onboarding-links';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../../lib/acceso-ui';

const MENSAJE_ERROR_ROTAR = 'No se pudo generar el nuevo enlace. Intenta de nuevo.';
const MENSAJE_ERROR_PAUSAR = 'No se pudo pausar la captación. Intenta de nuevo.';
const MENSAJE_ERROR_REANUDAR = 'No se pudo reanudar la captación. Intenta de nuevo.';

export function useEnlaceCaptacion({ isDemoMode }: { isDemoMode: boolean }) {
  // WU-E (RF-011 RN-06): el enlace de captación usa el coachCode REAL del entrenador
  // (GET /entrenador/perfil). Nunca un código hardcodeado; en modo demo no se consulta la API.
  const [coachCode, setCoachCode] = useState<string | null>(null);
  const [coachCodeError, setCoachCodeError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [errorCopiaCaptacion, setErrorCopiaCaptacion] = useState<string | null>(null);
  const [captacionActiva, setCaptacionActiva] = useState(true);
  const [registrosPorEnlace, setRegistrosPorEnlace] = useState(0);
  const [rotando, setRotando] = useState(false);
  const [cambiandoCaptacion, setCambiandoCaptacion] = useState(false);
  const [errorCaptacion, setErrorCaptacion] = useState<string | null>(null);
  const [mensajeCaptacion, setMensajeCaptacion] = useState<string | null>(null);

  // Identifica la consulta vigente: una respuesta solo se aplica si sigue siendo la última lanzada
  // (misma idea que la bandera `cancelado`, pero compartida entre la carga inicial y el refresco).
  const consultaVigente = useRef(0);
  // Hay datos del enlace ya cargados (del perfil o de una rotación/pausa): un refresco fallido los conserva.
  const hayDatosCargados = useRef(false);

  const invalidarConsultas = useCallback(() => {
    consultaVigente.current += 1;
  }, []);

  // Consulta `GET /entrenador/perfil` y aplica la respuesta al estado. En un refresco
  // (`conservarSiFalla`) un fallo no borra lo ya cargado ni muestra el error de carga inicial.
  const consultarPerfil = useCallback((conservarSiFalla: boolean) => {
    consultaVigente.current += 1;
    const consulta = consultaVigente.current;

    apiClient<PerfilEntrenadorDTO>('/entrenador/perfil')
      .then((perfil) => {
        if (consulta !== consultaVigente.current) return;
        hayDatosCargados.current = true;
        setCoachCode(perfil.coachCode);
        setCaptacionActiva(perfil.captacionActiva);
        setRegistrosPorEnlace(perfil.registrosPorEnlace);
        setCoachCodeError(null);
      })
      .catch(() => {
        if (consulta !== consultaVigente.current) return;
        if (conservarSiFalla && hayDatosCargados.current) return;
        setCoachCode(null);
        setCoachCodeError('No se pudo cargar tu enlace de captación. Recarga la página.');
      });
  }, []);

  useEffect(() => {
    hayDatosCargados.current = false;

    if (isDemoMode) {
      // Modo demo explícito: sin llamadas a la API real. El enlace se muestra solo con el
      // código real del entrenador; no se inventa una identidad de coach para la demo.
      setCoachCode(null);
      setCoachCodeError(null);
      setCaptacionActiva(true);
      setRegistrosPorEnlace(0);
      return;
    }

    consultarPerfil(false);

    return invalidarConsultas;
  }, [isDemoMode, consultarPerfil, invalidarConsultas]);

  /**
   * Repite la consulta del perfil (p. ej. al abrir el modal «Invitar») para que el enlace, la
   * pausa y el conteo no queden desfasados. No hace nada en demo; si falla conserva lo cargado.
   */
  const recargarCaptacion = useCallback((): void => {
    if (isDemoMode) return;
    consultarPerfil(true);
  }, [isDemoMode, consultarPerfil]);

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

  /** Aplica al estado local la respuesta de rotar o de pausar/reanudar. */
  const aplicarResultado = (resultado: CaptacionEntrenadorResultadoDTO) => {
    // Un refresco en vuelo traería datos anteriores a este cambio: se descarta.
    invalidarConsultas();
    hayDatosCargados.current = true;
    setCoachCode(resultado.coachCode);
    setCaptacionActiva(resultado.captacionActiva);
    setRegistrosPorEnlace(resultado.registrosPorEnlace);
    setMensajeCaptacion(resultado.mensaje ?? null);
    setErrorCaptacion(null);
  };

  // D17: rotación con corte inmediato; la confirmación previa vive en el diálogo.
  const rotarEnlace = async (): Promise<void> => {
    if (isDemoMode || rotando) return;
    setRotando(true);
    setErrorCaptacion(null);
    setMensajeCaptacion(null);
    try {
      const resultado = await apiClient<CaptacionEntrenadorResultadoDTO>(
        '/entrenador/captacion/rotar',
        { method: 'POST' }
      );
      aplicarResultado(resultado);
      setIsCopied(false);
      setErrorCopiaCaptacion(null);
    } catch {
      setErrorCaptacion(MENSAJE_ERROR_ROTAR);
    } finally {
      setRotando(false);
    }
  };

  // D17: pausa o reanuda la captación (`{ activa: !captacionActiva }`).
  const alternarCaptacion = async (): Promise<void> => {
    if (isDemoMode || cambiandoCaptacion) return;
    const cuerpo: ActualizarCaptacionDTO = { activa: !captacionActiva };
    setCambiandoCaptacion(true);
    setErrorCaptacion(null);
    setMensajeCaptacion(null);
    try {
      const resultado = await apiClient<CaptacionEntrenadorResultadoDTO>(
        '/entrenador/captacion',
        { method: 'PATCH', body: JSON.stringify(cuerpo) }
      );
      aplicarResultado(resultado);
    } catch {
      setErrorCaptacion(cuerpo.activa ? MENSAJE_ERROR_REANUDAR : MENSAJE_ERROR_PAUSAR);
    } finally {
      setCambiandoCaptacion(false);
    }
  };

  return {
    coachCode,
    coachCodeError,
    registrationUrl,
    isCopied,
    errorCopiaCaptacion,
    handleCopyLink,
    captacionActiva,
    registrosPorEnlace,
    rotando,
    cambiandoCaptacion,
    errorCaptacion,
    mensajeCaptacion,
    rotarEnlace,
    alternarCaptacion,
    recargarCaptacion,
  };
}

export type EnlaceCaptacion = ReturnType<typeof useEnlaceCaptacion>;
