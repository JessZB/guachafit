import { asc, count, desc, eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import {
  ListadoEntrenadoresAdminDTO,
  ListarEntrenadoresAdminQueryDTO,
  Rol,
} from '@guachafit/shared';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * RF-010 RN-01 (WU Admin): coach listing for the Superadmin master panel.
 * Only ENTRENADOR-role accounts with a profile (inner join): a user without a
 * coach profile is not an operable coach and is excluded. Returns the repo
 * standard paginated envelope, with `total` as the real COUNT (not the page
 * size). Order: most recent signup first. Moved verbatim (P3).
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
