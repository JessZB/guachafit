import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, ApiError, ErrorDeConexion } from '../../lib/api-client';
import { listarZonasHorarias, ZONA_HORARIA_POR_DEFECTO } from '../../lib/zona-horaria';
import { SelectorZonaHoraria } from './SelectorZonaHoraria';

const MENSAJE_GUARDADA = 'Zona horaria guardada.';
const MENSAJE_SIN_CONEXION_ZONA =
  'No hay conexión a internet: la zona horaria no se guardó. Revisa tu red e inténtalo de nuevo.';
const MENSAJE_ERROR_ZONA = 'No pudimos guardar la zona horaria. Inténtalo de nuevo.';

/**
 * Edición de la zona horaria de un perfil de alumno (ADR-019) con guardado en línea: requiere
 * conexión y no usa la cola offline. Lo usan el alumno (`/alumnos/me/zona-horaria`) y su
 * entrenador (`/alumnos/:id`); en modo demo el guardado se simula.
 */
export function ZonaHorariaPerfil({
  id,
  zonaActual,
  endpoint,
  modoDemo = false,
  onGuardada,
}: {
  id: string;
  zonaActual: string | null | undefined;
  endpoint: string;
  modoDemo?: boolean;
  onGuardada?: (zona: string) => void;
}) {
  const opciones = useMemo(() => listarZonasHorarias(), []);
  const [valor, setValor] = useState(zonaActual ?? ZONA_HORARIA_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    setValor(zonaActual ?? ZONA_HORARIA_POR_DEFECTO);
  }, [zonaActual]);

  // Una respuesta que llega después de cambiar de perfil (otro `endpoint`) o de salir de la
  // pantalla no debe aplicarse: se descarta.
  const destinoRef = useRef(endpoint);
  destinoRef.current = endpoint;
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // Una zona guardada que no esté en la lista del navegador se ofrece igual.
  const opcionesConActual = opciones.includes(valor) ? opciones : [valor, ...opciones];

  const guardar = async () => {
    setError(null);
    setExito(null);
    if (modoDemo) {
      onGuardada?.(valor);
      setExito(MENSAJE_GUARDADA);
      return;
    }
    const destino = endpoint;
    const vigente = () => montadoRef.current && destinoRef.current === destino;
    setGuardando(true);
    try {
      await apiClient.patch(destino, { zonaHoraria: valor });
      if (!vigente()) return;
      onGuardada?.(valor);
      setExito(MENSAJE_GUARDADA);
    } catch (err) {
      if (!vigente()) return;
      if (err instanceof ErrorDeConexion) setError(MENSAJE_SIN_CONEXION_ZONA);
      else if (err instanceof ApiError && err.status < 500) setError(err.message);
      else setError(MENSAJE_ERROR_ZONA);
    } finally {
      if (montadoRef.current) setGuardando(false);
    }
  };

  return (
    <SelectorZonaHoraria
      id={id}
      valor={valor}
      opciones={opcionesConActual}
      onCambiar={(zona) => {
        setValor(zona);
        setExito(null);
      }}
      onGuardar={() => void guardar()}
      guardando={guardando}
      error={error}
      exito={exito}
    />
  );
}
