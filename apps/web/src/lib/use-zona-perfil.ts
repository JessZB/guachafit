import { useAuth } from '../context/auth-context';
import { zonaPerfilEfectiva } from './nutricion-checkin';

/**
 * Zona IANA del perfil del alumno en sesión (ADR-025). Sin usuario, sin zona o con una zona
 * inválida devuelve la zona por defecto.
 */
export function useZonaPerfil(): string {
  return zonaPerfilEfectiva(useAuth().user?.zonaHoraria);
}
