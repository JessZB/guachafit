/**
 * RF-010 (WU Admin): lógica pura del panel maestro de entrenadores.
 *
 * Sin React ni red: etiquetas de estado, guardas de auto-deshabilitación, aplicación de un cambio
 * confirmado (2xx) sobre la lista en pantalla, endpoints exactos y fixture demo (solo con la
 * bandera `isDemoMode` activa, igual que el resto del repo).
 */
import {
  EstadoLicencia,
  type EntrenadorAdminDTO,
  type ListadoEntrenadoresAdminDTO,
} from '@guachafit/shared';
import { rebanarPagina } from './paginacion';

/** Página por defecto del listado del panel (mismo valor que el contrato compartido del API). */
export const TAMANO_PAGINA_ENTRENADORES_ADMIN = 25;

/** `GET /auth/entrenadores` con el `offset` derivado de la página visible (1-indexada). */
export function endpointListadoEntrenadores(pagina: number, tamano: number): string {
  const paginaSegura = Math.max(1, Math.floor(pagina) || 1);
  const tamanoSeguro = Math.max(1, Math.floor(tamano) || 1);
  const offset = (paginaSegura - 1) * tamanoSeguro;
  return `/auth/entrenadores?limit=${tamanoSeguro}&offset=${offset}`;
}

/** `PATCH /auth/entrenadores/:id/estado` (`:id` = `usuarioId` de la cuenta). */
export function endpointEstadoEntrenador(usuarioId: string): string {
  return `/auth/entrenadores/${encodeURIComponent(usuarioId)}/estado`;
}

/** `PATCH /auth/entrenadores/:id/licencia` (`:id` = `usuarioId` de la cuenta). */
export function endpointLicenciaEntrenador(usuarioId: string): string {
  return `/auth/entrenadores/${encodeURIComponent(usuarioId)}/licencia`;
}

/** Etiqueta de la cuenta: `usuarios.activo` (no confundir con la licencia). */
export function etiquetaCuenta(activo: boolean): string {
  return activo ? 'Cuenta activa' : 'Cuenta deshabilitada';
}

/** Etiqueta de la licencia del entrenador. */
export function etiquetaLicencia(estado: EstadoLicencia): string {
  return estado === EstadoLicencia.ACTIVA ? 'Licencia activa' : 'Licencia suspendida';
}

/** Texto de la acción de cuenta según su estado actual. */
export function textoBotonEstado(activo: boolean): string {
  return activo ? 'Deshabilitar' : 'Reactivar';
}

/** Texto de la acción de licencia según su estado actual. */
export function textoBotonLicencia(estado: EstadoLicencia): string {
  return estado === EstadoLicencia.ACTIVA ? 'Suspender licencia' : 'Activar licencia';
}

/**
 * La API rechaza con 400 que el Superadmin se deshabilite a sí mismo; la UI deshabilita el botón
 * para no ofrecer una acción imposible. Solo aplica a la acción de deshabilitar.
 */
export function esAutodeshabilitacion(
  entrenador: EntrenadorAdminDTO,
  usuarioActualId: string | undefined
): boolean {
  return (
    entrenador.activo &&
    !!usuarioActualId &&
    entrenador.usuarioId === usuarioActualId
  );
}

/** Aplica un cambio de cuenta confirmado por el servidor a la lista en pantalla. */
export function aplicarEstadoEnLista(
  items: EntrenadorAdminDTO[],
  usuarioId: string,
  activo: boolean
): EntrenadorAdminDTO[] {
  return items.map((item) => (item.usuarioId === usuarioId ? { ...item, activo } : item));
}

/** Aplica un cambio de licencia confirmado por el servidor a la lista en pantalla. */
export function aplicarLicenciaEnLista(
  items: EntrenadorAdminDTO[],
  usuarioId: string,
  estadoLicencia: EstadoLicencia
): EntrenadorAdminDTO[] {
  return items.map((item) =>
    item.usuarioId === usuarioId ? { ...item, estadoLicencia } : item
  );
}

/**
 * Fixture demo del panel (SOLO con `isDemoMode`). Cubre los tres escenarios de la UI: cuenta
 * normal, cuenta deshabilitada y licencia suspendida, para poder recorrer todos los botones.
 */
export const ENTRENADORES_ADMIN_DEMO: EntrenadorAdminDTO[] = [
  {
    usuarioId: 'demo-coach-1',
    perfilId: 'demo-perfil-1',
    nombres: 'Marcos',
    apellidos: 'Fitness',
    nombreComercial: 'Marcos Fitness',
    email: 'marcos@gym.com',
    coachCode: 'MARCOS-921',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: true,
    fechaAltaUtc: '2026-08-15T14:00:00.000Z',
  },
  {
    usuarioId: 'demo-coach-2',
    perfilId: 'demo-perfil-2',
    nombres: 'Valeria',
    apellidos: 'Rojas',
    nombreComercial: null,
    email: 'valeria@box.com',
    coachCode: 'VALERIA-7',
    estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    activo: true,
    fechaAltaUtc: '2026-09-02T09:30:00.000Z',
  },
  {
    usuarioId: 'demo-coach-3',
    perfilId: 'demo-perfil-3',
    nombres: 'Andrés',
    apellidos: 'Pérez',
    nombreComercial: 'AP Training',
    email: 'andres@aptraining.com',
    coachCode: 'ANDRES-44',
    estadoLicencia: EstadoLicencia.ACTIVA,
    activo: false,
    fechaAltaUtc: '2026-09-10T18:45:00.000Z',
  },
];

/** Cambio aplicado en la sesión demo (aún sin persistencia real). */
export interface CambioDemoEntrenador {
  activo?: boolean;
  estadoLicencia?: EstadoLicencia;
}

/**
 * Página del fixture demo con los cambios de la sesión aplicados. La aritmética es la misma del
 * servidor (`rebanarPagina` + `total` real), así la paginación demo se comporta igual que la real.
 */
export function listarEntrenadoresDemo(
  pagina: number,
  tamano: number,
  cambios: Record<string, CambioDemoEntrenador> = {}
): ListadoEntrenadoresAdminDTO {
  const items = ENTRENADORES_ADMIN_DEMO.map((entrenador) => ({
    ...entrenador,
    ...cambios[entrenador.usuarioId],
  }));
  return {
    items: rebanarPagina(items, pagina, tamano),
    total: items.length,
    limit: tamano,
    offset: (Math.max(1, Math.floor(pagina) || 1) - 1) * tamano,
  };
}
