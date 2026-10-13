import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  perfilesAlumno,
  usuarios,
} from '@guachafit/database';
import {
  DirectorioAlumnosDTO,
  FiltroDirectorioAlumnosDTO,
  LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO,
  Rol,
} from '@guachafit/shared';
import { escaparPatronLike } from '../../../common/cartera.util';
import type { ContextoCasosAlumnos } from './contexto-casos';
import {
  calcularResumenDirectorio,
  condicionSemaforoPago,
  hidratarSemaforoPago,
} from './directorio-helpers';
import { hidratarPlanActivo as hidratarPlanActivoBase } from './hidratar-plan-activo';
import { sanitizarPerfilParaRol } from './sanitizar-perfil';

/**
 * Coach student directory listing (RF-011, RF-012). Moved verbatim from
 * `AlumnosService.listarAlumnos` (P3: same query order and shape).
 */
export async function listarAlumnos(
  ctx: ContextoCasosAlumnos,
  entrenadorId: string,
  filtro?: FiltroDirectorioAlumnosDTO
): Promise<DirectorioAlumnosDTO> {
  const limit = filtro?.limit ?? LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO;
  const offset = filtro?.offset ?? 0;
  const busqueda = (filtro?.q ?? filtro?.busqueda ?? '').trim();
  const hidratarPlan = ctx.hidratarPlanActivo ?? hidratarPlanActivoBase;

  const { filaTotal, records, resumen, semaforosPago, planesActivos } = await ctx.withTenant(
    { entrenadorId },
    async (tx) => {
      const conditions = [eq(perfilesAlumno.entrenadorId, entrenadorId)];

      if (filtro?.soloArchivados) {
        conditions.push(isNotNull(perfilesAlumno.deletedAtUtc));
      } else if (!filtro?.incluirArchivados) {
        conditions.push(isNull(perfilesAlumno.deletedAtUtc));
      }

      if (filtro?.estado) {
        conditions.push(eq(perfilesAlumno.estadoActivacion, filtro.estado));
      }

      if (filtro?.modalidad) {
        conditions.push(eq(perfilesAlumno.modalidad, filtro.modalidad));
      }

      if (filtro?.semaforoPago) {
        const condicionPago = await condicionSemaforoPago(
          tx,
          entrenadorId,
          filtro.semaforoPago
        );
        if (condicionPago) conditions.push(condicionPago);
      }

      if (busqueda.length > 0) {
        const patron = `%${escaparPatronLike(busqueda)}%`;
        conditions.push(
          or(
            ilike(perfilesAlumno.nombres, patron),
            ilike(perfilesAlumno.apellidos, patron),
            ilike(usuarios.email, patron),
            ilike(perfilesAlumno.numeroDocumento, patron)
          )!
        );
      }

      const whereDirectorio = and(...conditions);

      const [filaTotal, records, resumen] = await Promise.all([
        tx
          .select({ total: count() })
          .from(perfilesAlumno)
          .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
          .where(whereDirectorio),
        tx
          .select({
            id: perfilesAlumno.id,
            usuarioId: perfilesAlumno.usuarioId,
            entrenadorId: perfilesAlumno.entrenadorId,
            tipoDocumento: perfilesAlumno.tipoDocumento,
            numeroDocumento: perfilesAlumno.numeroDocumento,
            nombres: perfilesAlumno.nombres,
            apellidos: perfilesAlumno.apellidos,
            email: usuarios.email,
            fechaNacimiento: perfilesAlumno.fechaNacimiento,
            telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
            fichaSaludPrivada: perfilesAlumno.fichaSaludPrivada,
            estadoActivacion: perfilesAlumno.estadoActivacion,
            modalidad: perfilesAlumno.modalidad,
            tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
            zonaHoraria: perfilesAlumno.zonaHoraria,
            deletedAtUtc: perfilesAlumno.deletedAtUtc,
            createdAtUtc: perfilesAlumno.createdAtUtc,
          })
          .from(perfilesAlumno)
          .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
          .where(whereDirectorio)
          .orderBy(desc(perfilesAlumno.createdAtUtc), asc(perfilesAlumno.id))
          .limit(limit)
          .offset(offset),
        calcularResumenDirectorio(tx, entrenadorId),
      ]);

      const semaforosPago = await hidratarSemaforoPago(
        tx,
        entrenadorId,
        records.map((perfil) => perfil.usuarioId)
      );

      const planesActivos = await hidratarPlan(
        tx,
        entrenadorId,
        records.map((perfil) => perfil.usuarioId)
      );

      return { filaTotal, records, resumen, semaforosPago, planesActivos };
    }
  );

  const items = records.map((perfil) => {
    const planActivo = planesActivos.get(perfil.usuarioId);
    return {
      ...sanitizarPerfilParaRol(
        ctx,
        planActivo ? { ...perfil, ...planActivo } : perfil,
        Rol.ENTRENADOR
      ),
      semaforoPago: semaforosPago.get(perfil.usuarioId)!,
    };
  });

  return {
    items,
    total: Number(filaTotal[0]?.total ?? 0),
    limit,
    offset,
    resumen,
  };
}
