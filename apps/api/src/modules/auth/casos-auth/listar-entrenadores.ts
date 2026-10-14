import { asc, count, desc, eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import {
  ListadoEntrenadoresAdminDTO,
  ListarEntrenadoresAdminQueryDTO,
  Rol,
} from '@guachafit/shared';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * RF-010 RN-01 (WU Admin): listado de entrenadores para el panel maestro del Superadmin.
 *
 * Solo cuentas con rol ENTRENADOR y su perfil (inner join): un usuario sin perfil de entrenador
 * no es un entrenador operable y no aparece. Devuelve el envelope paginado estándar del repo,
 * con `total` como COUNT real (no el tamaño de la página). Orden: alta más reciente primero.
 * Movido sin cambios (P3).
 */
export async function listarEntrenadores(
  ctx: Pick<ContextoCasosAuth, 'db'>,
  query: ListarEntrenadoresAdminQueryDTO
): Promise<ListadoEntrenadoresAdminDTO> {
  const { limit, offset } = query;
  const soloEntrenadores = eq(usuarios.rol, Rol.ENTRENADOR);

  const [[filaTotal], filas] = await Promise.all([
    ctx.db
      .select({ total: count() })
      .from(usuarios)
      .innerJoin(perfilesEntrenador, eq(perfilesEntrenador.usuarioId, usuarios.id))
      .where(soloEntrenadores),
    ctx.db
      .select({
        usuarioId: usuarios.id,
        perfilId: perfilesEntrenador.id,
        nombres: perfilesEntrenador.nombres,
        apellidos: perfilesEntrenador.apellidos,
        nombreComercial: perfilesEntrenador.nombreComercial,
        email: usuarios.email,
        coachCode: perfilesEntrenador.coachCode,
        estadoLicencia: perfilesEntrenador.estadoLicencia,
        activo: usuarios.activo,
        fechaAltaUtc: usuarios.createdAtUtc,
      })
      .from(usuarios)
      .innerJoin(perfilesEntrenador, eq(perfilesEntrenador.usuarioId, usuarios.id))
      .where(soloEntrenadores)
      .orderBy(desc(usuarios.createdAtUtc), asc(usuarios.id))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    items: filas.map((fila) => ({
      ...fila,
      fechaAltaUtc: new Date(fila.fechaAltaUtc).toISOString(),
    })),
    total: Number(filaTotal?.total ?? 0),
    limit,
    offset,
  };
}
