/**
 * Acceso y roles: lectura segura de la sesión persistida y reglas puras del ciclo de sesión.
 *
 * - C9: un `guachafit_user` corrupto en localStorage ya no rompe el arranque de la app; se
 *   descartan las claves de sesión y se pide iniciar sesión de nuevo.
 * - D2: al iniciar sesión con un usuario distinto al último del dispositivo se limpian los datos
 *   locales (caché de consultas, IndexedDB y cachés de API) antes de guardar la sesión nueva.
 * - A1: la sesión se valida contra `/auth/me` solo con red, con la app visible y fuera del modo demo.
 */
import type { AuthUserDTO } from '@guachafit/shared';
import { prefijoClaveCronometro } from './cronometro-descanso';

export const CLAVES_SESION_LOCAL = {
  usuario: 'guachafit_user',
  accessToken: 'guachafit_token',
  refreshToken: 'guachafit_refresh_token',
  modoDemo: 'guachafit_demo_mode',
  ultimoUsuarioId: 'guachafit_ultimo_usuario_id',
} as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** Almacén con enumeración de claves (solo lo necesita la limpieza por prefijo). */
type StorageEnumerable = StorageLike & Pick<Storage, 'key' | 'length'>;

function limpiarClavesDeSesion(storage: StorageLike): void {
  for (const clave of [
    CLAVES_SESION_LOCAL.usuario,
    CLAVES_SESION_LOCAL.accessToken,
    CLAVES_SESION_LOCAL.refreshToken,
    CLAVES_SESION_LOCAL.modoDemo,
  ]) {
    try {
      storage.removeItem(clave);
    } catch {
      // Almacenamiento bloqueado: no hay nada más que hacer.
    }
  }
}

/**
 * Higiene al cerrar sesión: borra los cronómetros de descanso guardados (`guachafit_cronometro_*`)
 * y no toca ninguna otra clave. Primero junta las claves y luego las borra una a una, cada una con
 * su propio try/catch, para que un fallo no deje las demás ni mueva los índices mientras se recorre.
 */
export function limpiarClavesEntrenamientoLocal(storage: StorageEnumerable): void {
  const claves: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const clave = storage.key(i);
      if (clave && clave.startsWith(prefijoClaveCronometro)) claves.push(clave);
    }
  } catch {
    // Almacenamiento bloqueado: no hay nada más que hacer.
    return;
  }
  for (const clave of claves) {
    try {
      storage.removeItem(clave);
    } catch {
      // Una clave que no se pudo borrar no impide borrar las demás.
    }
  }
}

function esUsuarioValido(valor: unknown): valor is AuthUserDTO {
  if (!valor || typeof valor !== 'object') return false;
  const { id, email, rol } = valor as Partial<AuthUserDTO>;
  return typeof id === 'string' && id.length > 0 && typeof email === 'string' && typeof rol === 'string';
}

export function leerUsuarioGuardado(storage: StorageLike): AuthUserDTO | null {
  let crudo: string | null;
  try {
    crudo = storage.getItem(CLAVES_SESION_LOCAL.usuario);
  } catch {
    return null;
  }
  if (!crudo) return null;

  try {
    const usuario: unknown = JSON.parse(crudo);
    if (esUsuarioValido(usuario)) return usuario;
  } catch {
    // JSON corrupto: se trata igual que una forma inesperada.
  }
  limpiarClavesDeSesion(storage);
  return null;
}

/** Último usuario que usó el dispositivo (o el de la sesión guardada, para sesiones previas). */
export function leerUltimoUsuarioId(storage: StorageLike): string | null {
  try {
    const ultimo = storage.getItem(CLAVES_SESION_LOCAL.ultimoUsuarioId);
    if (ultimo) return ultimo;
  } catch {
    return null;
  }
  return leerUsuarioGuardado(storage)?.id ?? null;
}

/**
 * Migración: las sesiones previas a `guachafit_ultimo_usuario_id` no tienen la clave. Mientras haya
 * un usuario de sesión válido se registra su id, para que un cierre forzado (que borra
 * `guachafit_user`) no haga creer al siguiente login de la misma persona que es otra (D2).
 */
export function asegurarUltimoUsuarioId(storage: StorageLike): void {
  try {
    if (storage.getItem(CLAVES_SESION_LOCAL.ultimoUsuarioId)) return;
    const usuario = leerUsuarioGuardado(storage);
    if (usuario) storage.setItem(CLAVES_SESION_LOCAL.ultimoUsuarioId, usuario.id);
  } catch {
    // Almacenamiento bloqueado: no hay nada más que hacer.
  }
}

export function debeLimpiarDatosAlIniciarSesion(
  idAnterior: string | null,
  idNuevo: string
): boolean {
  return idAnterior !== idNuevo;
}

export interface CondicionesValidacionSesion {
  hayToken: boolean;
  esDemo: boolean;
  enLinea: boolean;
  visible: boolean;
}

export function debeValidarSesion({
  hayToken,
  esDemo,
  enLinea,
  visible,
}: CondicionesValidacionSesion): boolean {
  return hayToken && !esDemo && enLinea && visible;
}
