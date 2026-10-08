import { useEffect, useRef, useState } from 'react';
import { Rol, type MiPerfilDTO } from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import {
  cambiosPerfil,
  formularioDesdePerfil,
  mensajeErrorAjustes,
  OPCIONES_GUARDADO_AJUSTES,
  validarFormularioPerfil,
  type ErroresPerfil,
  type FormularioPerfil,
} from '../../lib/mi-perfil';
import { TarjetaAjustes } from './CampoAjustes';
import { FormularioDatosPerfil } from './FormularioDatosPerfil';

/**
 * RF-018 pestaña "Perfil": edita los datos que el rol puede cambiar. Solo envía lo que cambió;
 * requiere conexión (no usa la cola offline).
 */
export function SeccionPerfil({
  perfil,
  isDemoMode,
  onActualizado,
}: {
  perfil: MiPerfilDTO;
  isDemoMode: boolean;
  onActualizado: (perfil: MiPerfilDTO) => void;
}) {
  const [inicial, setInicial] = useState<FormularioPerfil>(() => formularioDesdePerfil(perfil));
  const [valores, setValores] = useState<FormularioPerfil>(inicial);
  const [errores, setErrores] = useState<ErroresPerfil>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // Último formulario del servidor: sirve para saber si hay cambios sin guardar.
  const inicialRef = useRef(inicial);

  // Una recarga del perfil (p. ej. tras pedir un cambio de correo) solo reemplaza el formulario
  // si no hay cambios sin guardar: nunca borra lo que el usuario está escribiendo.
  useEffect(() => {
    const formulario = formularioDesdePerfil(perfil);
    const anterior = inicialRef.current;
    inicialRef.current = formulario;
    setInicial(formulario);
    setValores((actual) =>
      Object.keys(cambiosPerfil(anterior, actual, perfil.rol)).length === 0 ? formulario : actual
    );
  }, [perfil]);

  const guardar = async () => {
    setError(null);
    setExito(null);
    const erroresValidacion = validarFormularioPerfil(valores, perfil.rol);
    setErrores(erroresValidacion);
    if (Object.keys(erroresValidacion).length > 0) return;

    const cambios = cambiosPerfil(inicial, valores, perfil.rol);
    if (Object.keys(cambios).length === 0) {
      setExito('No hay cambios que guardar.');
      return;
    }
    if (isDemoMode) {
      inicialRef.current = valores;
      setInicial(valores);
      setExito('Cambios guardados en esta sesión de demostración.');
      return;
    }
    setGuardando(true);
    try {
      const actualizado = await apiClient.patch<MiPerfilDTO>(
        '/usuarios/me/perfil',
        cambios,
        OPCIONES_GUARDADO_AJUSTES
      );
      onActualizado(actualizado);
      // Lo guardado pasa a ser el formulario (ya normalizado por el servidor).
      setValores(formularioDesdePerfil(actualizado));
      setExito('Tus datos se guardaron.');
    } catch (err) {
      setError(mensajeErrorAjustes(err, 'No pudimos guardar tus datos. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <TarjetaAjustes
      titulo="Tus datos"
      descripcion={
        perfil.rol === Rol.ENTRENADOR
          ? 'Así te ven tus alumnos.'
          : 'Así te ven tu entrenador y el gimnasio.'
      }
    >
      <FormularioDatosPerfil
        rol={perfil.rol}
        valores={valores}
        errores={errores}
        identidad={
          perfil.alumno
            ? {
                tipoDocumento: perfil.alumno.tipoDocumento,
                numeroDocumento: perfil.alumno.numeroDocumento,
                fechaNacimiento: perfil.alumno.fechaNacimiento,
              }
            : null
        }
        onCambiar={(campo, valor) => {
          setValores((actual) => ({ ...actual, [campo]: valor }));
          setExito(null);
        }}
        onGuardar={() => void guardar()}
        guardando={guardando}
        error={error}
        exito={exito}
      />
    </TarjetaAjustes>
  );
}
