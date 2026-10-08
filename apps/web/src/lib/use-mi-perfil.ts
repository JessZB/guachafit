import { useCallback, useEffect, useRef, useState } from 'react';
import { Rol, TipoDocumento, type AuthUserDTO, type MiPerfilDTO } from '@guachafit/shared';
import { apiClient } from './api-client';

/** Perfil de demostración construido desde la sesión demo (sin llamadas al API). */
function perfilDemo(user: AuthUserDTO | null): MiPerfilDTO {
  const rol = (user?.rol as Rol) ?? Rol.ALUMNO;
  return {
    id: user?.id ?? 'demo',
    email: user?.email ?? 'demo@guachafit.com',
    rol,
    correoPendiente: null,
    correoPendienteExpiraUtc: null,
    alumno:
      rol === Rol.ALUMNO
        ? {
            nombres: 'Ana',
            apellidos: 'Demo',
            telefonoWhatsapp: '+584121234567',
            tipoDocumento: TipoDocumento.V,
            numeroDocumento: '24123456',
            fechaNacimiento: '1998-05-14',
            zonaHoraria: user?.zonaHoraria ?? 'America/Caracas',
          }
        : null,
    entrenador:
      rol === Rol.ENTRENADOR
        ? {
            nombres: 'Luis',
            apellidos: 'Demo',
            nombreComercial: 'Gimnasio Demo',
            telefonoContacto: '+584149990000',
          }
        : null,
  };
}

/**
 * RF-018: perfil propio (`GET /usuarios/me/perfil`) para las pestañas de Ajustes. Solo la carga
 * más reciente escribe el estado; en modo demo se usa un perfil de ejemplo.
 */
export function useMiPerfil(user: AuthUserDTO | null, isDemoMode: boolean) {
  const [perfil, setPerfil] = useState<MiPerfilDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const turnoRef = useRef(0);

  // La sesión se refresca sola (`/auth/me`); el perfil solo se recarga si cambia de usuario.
  const userRef = useRef(user);
  userRef.current = user;
  const usuarioId = user?.id ?? null;

  const recargar = useCallback(async () => {
    const turno = ++turnoRef.current;
    if (isDemoMode) {
      setPerfil(perfilDemo(userRef.current));
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const datos = await apiClient<MiPerfilDTO>('/usuarios/me/perfil');
      if (turno !== turnoRef.current) return;
      setPerfil(datos);
    } catch (err) {
      if (turno !== turnoRef.current) return;
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No pudimos cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      if (turno === turnoRef.current) setCargando(false);
    }
  }, [isDemoMode, usuarioId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { perfil, setPerfil, cargando, error, recargar };
}
