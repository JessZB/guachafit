import { Rol } from '@guachafit/shared';
import {
  eq,
  perfilesAlumno,
  usuarios,
  type TenantRlsContext,
  type TenantTransaction,
} from '@guachafit/database';

/**
 * Acceso y resolución de identidad con RLS para los casos de finanzas.
 * Lo importan los casos que leen con RLS; no importa a ningún otro caso.
 */

export function contextoRlsDeActor(
  actorUserId: string,
  actorRole: Rol,
  actorEntrenadorId?: string
): TenantRlsContext {
  if (actorRole === Rol.ALUMNO) return { usuarioId: actorUserId };
  if (actorRole === Rol.SUPERADMIN) return { isSuperadmin: true };
  return { entrenadorId: actorEntrenadorId ?? actorUserId };
}

/**
 * SIEMPRE debe correr en una transacción con contexto (`withTenant` o tx con `set_config`).
 * El `tx` es OBLIGATORIO a propósito: sin él, un futuro llamador leería 0 filas en silencio.
 */
export async function resolveClienteUsuarioId(
  idOrPerfilId: string,
  tx: TenantTransaction
): Promise<string> {
  const conn = tx;

  // Si ya es un usuarioId en la tabla usuarios
  const [user] = await conn
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, idOrPerfilId));

  if (user) return user.id;

  // Si es un perfilId en perfilesAlumno
  const [perfil] = await conn
    .select({ usuarioId: perfilesAlumno.usuarioId })
    .from(perfilesAlumno)
    .where(eq(perfilesAlumno.id, idOrPerfilId));

  if (perfil) return perfil.usuarioId;

  return idOrPerfilId;
}
