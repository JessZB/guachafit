/**
 * RF-010 Escenario 1 (WU Admin): alta de entrenadores del panel.
 *
 * Hook de datos extraído de `AdminPage` con el MISMO mecanismo que usa hoy (R9): formulario
 * controlado, `POST /auth/entrenador` con el payload normalizado, éxito con enlace de
 * activación y recarga del listado, error honesto y copia del enlace al portapapeles.
 */
import React, { useState } from 'react';
import type { EntrenadorCreadoDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../../lib/acceso-ui';
import { construirLinkActivacion } from '../../../lib/onboarding-links';
import {
  construirPayloadAltaEntrenador,
  FORMULARIO_INICIAL,
  type FormularioAltaEntrenador,
} from '../../../lib/admin-alta-payload';

export interface OpcionesAltaEntrenador {
  /** Recarga el listado para que el alta nueva aparezca sin recargar la página. */
  onRecargar: () => void;
}

export function useAltaEntrenador({ onRecargar }: OpcionesAltaEntrenador) {
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<EntrenadorCreadoDTO | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState<string | null>(null);

  const actualizarCampo =
    (campo: keyof FormularioAltaEntrenador) => (evento: React.ChangeEvent<HTMLInputElement>) => {
      setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }));
    };

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setError(null);
    setCreado(null);
    setCopiado(false);
    setErrorCopia(null);
    setEnviando(true);
    try {
      const respuesta = await apiClient.post<EntrenadorCreadoDTO>(
        '/auth/entrenador',
        construirPayloadAltaEntrenador(formulario)
      );
      setCreado(respuesta);
      setFormulario(FORMULARIO_INICIAL);
      // El alta nueva aparece en la lista del panel sin recargar la página.
      onRecargar();
    } catch (err) {
      // Mensaje honesto: el cliente conserva el texto de la API si es legible (correo duplicado,
      // código en uso) y traduce los técnicos.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo crear el entrenador. Intenta de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  };

  const enlaceActivacion = creado?.tokenInvitacion
    ? construirLinkActivacion(creado.tokenInvitacion, window.location.origin)
    : null;

  const copiarEnlace = async () => {
    if (!enlaceActivacion) return;
    const ok = await copiarAlPortapapeles(enlaceActivacion);
    setCopiado(ok);
    setErrorCopia(ok ? null : MENSAJE_COPIA_FALLIDA);
  };

  return {
    formulario,
    enviando,
    error,
    creado,
    copiado,
    errorCopia,
    enlaceActivacion,
    actualizarCampo,
    handleSubmit,
    copiarEnlace,
  };
}
