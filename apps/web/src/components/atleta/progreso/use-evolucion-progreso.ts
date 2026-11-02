/**
 * Hook de datos: serie de evolución corporal del alumno (SL1, fase B).
 *
 * Extraído verbatim de `ProgresoPage.tsx:77-80, 93-94, 262-296` (R9: mismo
 * mecanismo `apiClient` + `useEffect`, con rama demo y error honesto, sin
 * migrar a TanStack Query). Sin JSX ni estilos. §6: sin UI.
 */
import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { crearEvolucionDemo } from '../../../lib/demo-evolucion';
import { AuthUserDTO, EvolucionCorporalDTO } from '@guachafit/shared';

export function useEvolucionProgreso(
  user: AuthUserDTO | null,
  isDemoMode: boolean
) {
  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin evolución demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // Miniaturas cuyo enlace temporal falló: se rotulan en vez de dejar una imagen rota.
  const [fotosConError, setFotosConError] = useState<string[]>([]);

  const cargarEvolucion = async () => {
    setIsLoading(true);
    setError(null);
    // Al recargar la serie se obtienen enlaces presignados nuevos: las miniaturas que habían
    // fallado vuelven a intentar (no quedan marcadas "Sin imagen" para siempre).
    setFotosConError([]);

    // MODO DEMO EXPLÍCITO (isDemoMode): evolución de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setEvolucion(crearEvolucionDemo(user?.id || 'demo-alumno'));
      setIsLoading(false);
      return;
    }

    try {
      if (!user?.id) {
        setEvolucion(null);
        return;
      }
      const data = await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${user.id}`);
      setEvolucion(data);
    } catch (err: any) {
      // D2 / PRO-01: sin evolución demo en sesión real; error visible con reintento.
      // Se conservan los datos previos si existían (no se sobrescribe a null).
      setError(
        err?.message || 'No se pudo cargar tu evolución corporal. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let desmontado = false;
    cargarEvolucion();
    return () => {
      desmontado = true;
    };
  }, [user?.id, isDemoMode]);

  return {
    evolucion,
    setEvolucion,
    isLoading,
    error,
    fotosConError,
    setFotosConError,
    cargarEvolucion,
  };
}
