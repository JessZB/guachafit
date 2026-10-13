/**
 * Módulo `alumnos` (fase B, prompt 53) · hook de datos del alta manual en sala.
 *
 * Extraído verbatim de `pages/entrenador/AlumnosPage.tsx:120-143, 270-279, 291-298,
 * 301-307, 312-365` (ver inventario 42 §3, `use-alta-manual-alumno` ~150 líneas).
 *
 * - Estado del formulario + validación (WhatsApp/fecha) + `POST /alumnos/manual` +
 *   resultado con enlace de activación. El alta vive en el servidor: al confirmar se
 *   avisa con `onAltaExitosa` (el contenedor vuelve a la página 1 y recarga la
 *   fuente de verdad; nunca se inventa un alumno local).
 * - R5: apertura y cierre limpios (nunca arrastra el enlace de un alta previa);
 *   D5: sin alumno fantasma (el éxito solo existe tras 2xx).
 */

import { useState, type FormEvent } from 'react';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import type { AltaManualAlumnoResultadoDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { construirLinkActivacion } from '../../../lib/onboarding-links';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../../lib/acceso-ui';
import {
  componerTelefonoWhatsapp,
  PREFIJO_PAIS_POR_DEFECTO,
  validarFechaNacimiento,
  validarTelefonoWhatsapp,
} from '../../../lib/formulario-registro';

export interface AlumnoCreadoVista {
  nombres: string;
  apellidos: string;
  linkActivacion: string;
  /** Solo si el servidor confirmó que el correo de bienvenida quedó en camino. */
  correoEnviado: boolean;
}

export function useAltaManualAlumno({ onAltaExitosa }: { onAltaExitosa: () => void }) {
  // New Athlete Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(TipoDocumento.V);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  // Sin datos precargados: fecha vacía y WhatsApp con prefijo de país editable.
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [prefijoWhatsapp, setPrefijoWhatsapp] = useState(PREFIJO_PAIS_POR_DEFECTO);
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);
  const [fichaSaludPrivada, setFichaSaludPrivada] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // WU-E (RF-011 RN-05): resultado del alta con el enlace de activación que el coach comparte.
  const [alumnoCreado, setAlumnoCreado] = useState<AlumnoCreadoVista | null>(null);
  const [activacionCopiada, setActivacionCopiada] = useState(false);
  const [errorCopiaActivacion, setErrorCopiaActivacion] = useState<string | null>(null);

  /**
   * WU-E: apertura limpia del modal de inscripción (nunca arrastra el enlace de un alta previa).
   */
  const abrirModalInscripcion = () => {
    setAlumnoCreado(null);
    setFormError(null);
    setActivacionCopiada(false);
    setErrorCopiaActivacion(null);
    setIsModalOpen(true);
  };

  const handleCopyActivacionLink = async () => {
    if (!alumnoCreado) return;
    const ok = await copiarAlPortapapeles(alumnoCreado.linkActivacion);
    setErrorCopiaActivacion(ok ? null : MENSAJE_COPIA_FALLIDA);
    if (!ok) return;
    setActivacionCopiada(true);
    setTimeout(() => setActivacionCopiada(false), 2000);
  };

  /** Cierre limpio del modal: nunca deja a la vista el enlace de un alta anterior. */
  const cerrarModal = () => {
    setIsModalOpen(false);
    setAlumnoCreado(null);
    setFormError(null);
    setActivacionCopiada(false);
    setErrorCopiaActivacion(null);
  };

  const handleCrearAlumnoManual = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errorValidacion =
      validarTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp) ??
      validarFechaNacimiento(fechaNacimiento);
    if (errorValidacion) {
      setFormError(errorValidacion);
      return;
    }

    setIsSubmitting(true);

    try {
      const resultado = await apiClient<AltaManualAlumnoResultadoDTO>('/alumnos/manual', {
        method: 'POST',
        body: JSON.stringify({
          nombres,
          apellidos,
          email,
          tipoDocumento,
          numeroDocumento,
          fechaNacimiento,
          telefonoWhatsapp: componerTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp),
          modalidad,
          fichaSaludPrivada: fichaSaludPrivada || undefined,
        }),
      });

      // WU-E (RF-011 RN-05): el servidor intenta enviar la bienvenida por correo y dice si quedó
      // en camino; el enlace visible y copiable es el respaldo (o la vía principal si no salió).
      setAlumnoCreado({
        nombres: resultado.nombres,
        apellidos: resultado.apellidos,
        correoEnviado: resultado.correoEnviado === true,
        linkActivacion: construirLinkActivacion(
          resultado.tokenInvitacion,
          window.location.origin
        ),
      });
      // WU25a: el alta vive en el servidor; se vuelve a la página 1 y se recarga la fuente de
      // verdad (nunca se inventa un alumno local ni se ajusta el resumen a mano).
      onAltaExitosa();
    } catch (err: unknown) {
      // D5: sin alumno fantasma; el alta solo existe si el servidor la aceptó.
      const mensaje = err instanceof Error ? err.message : null;
      setFormError(
        mensaje || 'No se pudo registrar al alumno. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    isModalOpen,
    nombres,
    setNombres,
    apellidos,
    setApellidos,
    email,
    setEmail,
    tipoDocumento,
    setTipoDocumento,
    numeroDocumento,
    setNumeroDocumento,
    fechaNacimiento,
    setFechaNacimiento,
    prefijoWhatsapp,
    setPrefijoWhatsapp,
    numeroWhatsapp,
    setNumeroWhatsapp,
    modalidad,
    setModalidad,
    fichaSaludPrivada,
    setFichaSaludPrivada,
    isSubmitting,
    formError,
    alumnoCreado,
    activacionCopiada,
    errorCopiaActivacion,
    abrirModalInscripcion,
    cerrarModal,
    handleCopyActivacionLink,
    handleCrearAlumnoManual,
  };
}

export type AltaManualAlumno = ReturnType<typeof useAltaManualAlumno>;
