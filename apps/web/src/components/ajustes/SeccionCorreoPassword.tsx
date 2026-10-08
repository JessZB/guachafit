import { useEffect, useState } from 'react';
import type { MiPerfilDTO, SolicitudCambioCorreoDTO } from '@guachafit/shared';
import {
  apiClient,
  ErrorTiempoAgotado,
  setAuthToken,
  setRefreshToken,
} from '../../lib/api-client';
import {
  MENSAJE_PASSWORD_TIEMPO_AGOTADO,
  mensajeErrorAjustes,
  OPCIONES_GUARDADO_AJUSTES,
  validarCambioPassword,
  type ErroresPassword,
  type FormularioPassword,
} from '../../lib/mi-perfil';
import { TarjetaAjustes } from './CampoAjustes';
import { FormularioCambioCorreo, type ValoresCambioCorreo } from './FormularioCambioCorreo';
import { FormularioCambioPassword } from './FormularioCambioPassword';

const PASSWORD_VACIA: FormularioPassword = { actual: '', nueva: '', confirmacion: '' };

/**
 * RF-018 pestaña "Correo y contraseña": cambio de contraseña (la sesión actual recibe tokens
 * nuevos) y cambio de correo con confirmación por enlace (RN-03..RN-05).
 *
 * `onRecargarPerfil` se llama cuando el servidor cambió el estado de la cuenta (correo pendiente
 * pedido o cancelado, o anulado al cambiar la contraseña: RN-08) para no mostrar uno viejo.
 *
 * La sección sigue montada aunque su pestaña se oculte (`visible = false`) para no perder el
 * resultado de un guardado en vuelo; las contraseñas escritas sí se borran al ocultarla.
 */
export function SeccionCorreoPassword({
  perfil,
  isDemoMode,
  onRecargarPerfil,
  visible = true,
}: {
  perfil: MiPerfilDTO;
  isDemoMode: boolean;
  onRecargarPerfil: () => void;
  visible?: boolean;
}) {
  // --- Contraseña ---
  const [password, setPassword] = useState<FormularioPassword>(PASSWORD_VACIA);
  const [erroresPassword, setErroresPassword] = useState<ErroresPassword>({});
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [exitoPassword, setExitoPassword] = useState<string | null>(null);

  const cambiarPassword = async () => {
    setErrorPassword(null);
    setExitoPassword(null);
    const errores = validarCambioPassword(password);
    setErroresPassword(errores);
    if (Object.keys(errores).length > 0) return;
    if (isDemoMode) {
      setPassword(PASSWORD_VACIA);
      setExitoPassword('En la demostración la contraseña no cambia.');
      return;
    }
    setGuardandoPassword(true);
    try {
      const respuesta = await apiClient.post<{
        mensaje: string;
        accessToken: string;
        refreshToken: string;
      }>(
        '/usuarios/me/password',
        { passwordActual: password.actual, passwordNueva: password.nueva },
        OPCIONES_GUARDADO_AJUSTES
      );
      // La sesión de este dispositivo sigue con los tokens nuevos; las demás se cierran.
      setAuthToken(respuesta.accessToken);
      setRefreshToken(respuesta.refreshToken);
      setPassword(PASSWORD_VACIA);
      setExitoPassword(respuesta.mensaje);
      // RN-08: el cambio de contraseña anula un cambio de correo pendiente.
      if (perfil.correoPendiente) onRecargarPerfil();
    } catch (err) {
      setErrorPassword(
        err instanceof ErrorTiempoAgotado
          ? MENSAJE_PASSWORD_TIEMPO_AGOTADO
          : mensajeErrorAjustes(err, 'No pudimos cambiar tu contraseña. Inténtalo de nuevo.')
      );
    } finally {
      setGuardandoPassword(false);
    }
  };

  // --- Correo ---
  const [correo, setCorreo] = useState<ValoresCambioCorreo>({ correoNuevo: '', passwordActual: '' });
  // Una sola operación de correo a la vez: reenviar y cancelar no se cruzan en el servidor.
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [exitoCorreo, setExitoCorreo] = useState<string | null>(null);
  const [enlaceConfirmacion, setEnlaceConfirmacion] = useState<string | undefined>(undefined);

  // Al ocultar la pestaña no quedan contraseñas escritas en un formulario que no se ve.
  useEffect(() => {
    if (visible) return;
    setPassword(PASSWORD_VACIA);
    setCorreo((anterior) => ({ ...anterior, passwordActual: '' }));
  }, [visible]);

  const limpiarAvisosCorreo = () => {
    setErrorCorreo(null);
    setExitoCorreo(null);
    setEnlaceConfirmacion(undefined);
  };

  const pedirCambioCorreo = async (correoNuevo: string) => {
    limpiarAvisosCorreo();
    if (!correoNuevo.trim()) {
      setErrorCorreo('Escribe el correo nuevo.');
      return;
    }
    if (!correo.passwordActual) {
      setErrorCorreo('Escribe tu contraseña actual para confirmar que eres tú.');
      return;
    }
    if (isDemoMode) {
      setExitoCorreo('En la demostración no se envían correos.');
      return;
    }
    setEnviandoCorreo(true);
    try {
      const respuesta = await apiClient.post<SolicitudCambioCorreoDTO>(
        '/usuarios/me/correo',
        { correoNuevo: correoNuevo.trim(), passwordActual: correo.passwordActual },
        OPCIONES_GUARDADO_AJUSTES
      );
      setCorreo({ correoNuevo: '', passwordActual: '' });
      if (respuesta.correoEnviado) setExitoCorreo(respuesta.mensaje);
      else setErrorCorreo(respuesta.mensaje);
      setEnlaceConfirmacion(respuesta.enlaceConfirmacion);
      onRecargarPerfil();
    } catch (err) {
      setErrorCorreo(
        mensajeErrorAjustes(err, 'No pudimos pedir el cambio de correo. Inténtalo de nuevo.')
      );
    } finally {
      setEnviandoCorreo(false);
    }
  };

  const cancelarCambioCorreo = async () => {
    limpiarAvisosCorreo();
    if (isDemoMode) return;
    setEnviandoCorreo(true);
    try {
      const respuesta = await apiClient.delete<{ mensaje: string }>(
        '/usuarios/me/correo-pendiente',
        OPCIONES_GUARDADO_AJUSTES
      );
      setExitoCorreo(respuesta.mensaje);
      onRecargarPerfil();
    } catch (err) {
      setErrorCorreo(mensajeErrorAjustes(err, 'No pudimos cancelar el cambio. Inténtalo de nuevo.'));
    } finally {
      setEnviandoCorreo(false);
    }
  };

  return (
    <div className="space-y-6">
      <TarjetaAjustes
        titulo="Correo de acceso"
        descripcion="Es el correo con el que inicias sesión y al que te llegan los avisos de seguridad."
      >
        <FormularioCambioCorreo
          correoActual={perfil.email}
          correoPendiente={perfil.correoPendiente}
          valores={correo}
          onCambiar={(campo, valor) => setCorreo((actual) => ({ ...actual, [campo]: valor }))}
          onEnviar={() => void pedirCambioCorreo(correo.correoNuevo)}
          onReenviar={() => void pedirCambioCorreo(perfil.correoPendiente ?? correo.correoNuevo)}
          onCancelarPendiente={() => void cancelarCambioCorreo()}
          enviando={enviandoCorreo}
          error={errorCorreo}
          exito={exitoCorreo}
          enlaceConfirmacion={enlaceConfirmacion}
        />
      </TarjetaAjustes>

      <TarjetaAjustes titulo="Contraseña">
        <FormularioCambioPassword
          valores={password}
          errores={erroresPassword}
          onCambiar={(campo, valor) => setPassword((actual) => ({ ...actual, [campo]: valor }))}
          onGuardar={() => void cambiarPassword()}
          guardando={guardandoPassword}
          error={errorPassword}
          exito={exitoPassword}
        />
      </TarjetaAjustes>
    </div>
  );
}
