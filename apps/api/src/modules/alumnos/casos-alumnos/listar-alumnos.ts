import {
  and,
  count,
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
  OrdenDirectorioAlumnos,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import { escaparPatronLike } from '../../../common/cartera.util';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import { calcularRachaEfectiva } from '../../../common/racha.util';
import type { ContextoAlumnos } from './contexto-alumnos';
import {
  calcularResumenDirectorio,
  condicionSemaforoPago,
  hidratarSemaforoPago,
} from './directorio-helpers';
import { hidratarPlanActivo as hidratarPlanActivoBase } from './hidratar-plan-activo';
import {
  contextoRachaPorZona,
  expresionUltimaSesion,
  ordenDirectorio,
  zonasDistintasDelCoach,
} from './orden-directorio';
import { sanitizarPerfilDirectorio } from './sanitizar-perfil';

/**
 * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
 *
 * WU19: respuesta paginada `{ items, total, limit, offset, resumen }`.
 * - `items`: página actual (default 100, techo 100) con la búsqueda y filtros aplicados EN SQL,
 *   con orden estable por `createdAtUtc` + `id` para que el offset no repita ni salte filas.
 * - `total`: COUNT real de filas que cumplen la consulta (sin traer el resto a memoria).
 * - `resumen`: contadores de la cartera COMPLETA (COUNT en el servidor) para los KPIs del
 *   directorio; no dependen de la página, la búsqueda ni los filtros.
 *
 * WU24: la búsqueda server-side acepta `q` (canónico) o `busqueda` (alias legado) y combina
 * ILIKE con escape de `%`, `_` y `\` sobre nombre/apellido/correo/documento.
 *
 * WU25a: `soloArchivados` (pestaña dedicada de archivados) y `semaforoPago` (pestaña "En Mora")
 * se resuelven también en SQL, ANTES del `limit`/`offset`, para que la paginación numerada sea
 * coherente entre páginas. El `resumen` nunca se altera por los filtros.
 *
 * `incluirArchivados: true` devuelve la cartera completa (vigentes + archivados); el default
 * `false` mantiene la semántica histórica de solo alumnos vigentes.
 * Movido sin cambios desde `AlumnosService.listarAlumnos` (P3: mismo orden y forma de consultas).
 *
 * Lote Mis alumnos (2026-10-19): el listado ya no incluye `fichaSaludPrivada` (solo el detalle
 * `GET /alumnos/:id`). Cada ítem trae `ultimaSesionFecha`, la racha EFECTIVA (`rachaDias`) y
 * `rachaUltimaFecha`. El parámetro `orden` (default `alta_reciente`) se aplica en SQL antes del
 * `limit`/`offset` (ADR-013), con desempate por `id`.
 */
export async function listarAlumnos(
  ctx: ContextoAlumnos,
  entrenadorId: string,
  filtro?: FiltroDirectorioAlumnosDTO
): Promise<DirectorioAlumnosDTO> {
  const limit = filtro?.limit ?? LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO;
  const offset = filtro?.offset ?? 0;
  const busqueda = (filtro?.q ?? filtro?.busqueda ?? '').trim();
  const orden = filtro?.orden ?? OrdenDirectorioAlumnos.ALTA_RECIENTE;
  const hidratarPlan = ctx.hidratarPlanActivo ?? hidratarPlanActivoBase;
  // Un único instante para la racha de SQL (orden `mayor_racha`) y para el mapeo de los ítems.
  const ahora = new Date();

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

      // La zona se resuelve en JS (ver orden-directorio.ts): solo `mayor_racha` necesita el "ayer" por zona.
      const racha =
        orden === OrdenDirectorioAlumnos.MAYOR_RACHA
          ? contextoRachaPorZona(await zonasDistintasDelCoach(tx, entrenadorId), ahora)
          : undefined;

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
            estadoActivacion: perfilesAlumno.estadoActivacion,
            modalidad: perfilesAlumno.modalidad,
            tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
            zonaHoraria: perfilesAlumno.zonaHoraria,
            rachaDias: perfilesAlumno.rachaDias,
            rachaUltimaFecha: perfilesAlumno.rachaUltimaFecha,
            ultimaSesionFecha: expresionUltimaSesion(),
            deletedAtUtc: perfilesAlumno.deletedAtUtc,
            createdAtUtc: perfilesAlumno.createdAtUtc,
          })
          .from(perfilesAlumno)
          .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
          .where(whereDirectorio)
          .orderBy(...ordenDirectorio(orden, racha))
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

  // Lote Mis alumnos (2026-10-19): racha efectiva con el día local de cada alumno, misma regla que
  // `expresionRachaEfectiva` (orden `mayor_racha`) y el mismo `ahora`.
  const items = records.map((perfil) => {
    const planActivo = planesActivos.get(perfil.usuarioId);
    const hoyLocal = obtenerFechaLocalYyyyMmDd(
      ahora,
      perfil.zonaHoraria || ZONA_HORARIA_ALUMNO_POR_DEFECTO
    );
    return {
      ...sanitizarPerfilDirectorio(planActivo ? { ...perfil, ...planActivo } : perfil),
      ultimaSesionFecha: perfil.ultimaSesionFecha?.toISOString() ?? null,
      rachaDias: calcularRachaEfectiva(perfil.rachaDias ?? 0, perfil.rachaUltimaFecha ?? null, hoyLocal),
      rachaUltimaFecha: perfil.rachaUltimaFecha ?? null,
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
