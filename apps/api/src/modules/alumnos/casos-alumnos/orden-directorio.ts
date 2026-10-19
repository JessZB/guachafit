import {
  asc,
  desc,
  eq,
  perfilesAlumno,
  sesionesEntrenamiento,
  sql,
  type SQL,
  type TenantTransaction,
} from '@guachafit/database';
import {
  EstadoSesion,
  OrdenDirectorioAlumnos,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import {
  fechaAnteriorYyyyMmDd,
  obtenerFechaLocalYyyyMmDd,
} from '../../../common/adherencia.util';

/**
 * Lote Mis alumnos (2026-10-19): expresiones SQL del directorio "Mis alumnos" (ADR-013: el orden
 * se aplica en SQL antes de `limit`/`offset`, nunca en memoria).
 *
 * Las subconsultas son ESCALARES y CORRELACIONADAS (no un LEFT JOIN a una tabla derivada con
 * GROUP BY) y viven solo en el SELECT y en el ORDER BY, nunca en el WHERE:
 * - Aislamiento por tenant: la subconsulta solo lee sesiones de `perfiles_alumno.usuario_id` de
 *   filas que ya pasaron el `entrenador_id` del WHERE exterior. `sesiones_entrenamiento` no tiene
 *   RLS, así que no se recorre el histórico de otros coaches.
 * - El COUNT y el WHERE del directorio no cambian; el resumen tampoco.
 *
 * La zona horaria de la racha se resuelve en JS, no en SQL: `AT TIME ZONE` con una zona almacenada
 * inválida aborta TODA la consulta (500 del directorio entero), mientras que el mapeo JS cae a UTC
 * sin lanzar (`obtenerFechaLocalYyyyMmDd`). Para que SQL y JS den el mismo resultado, SQL recibe
 * solo el "ayer" de cada zona distinta del coach, ya calculado, como parámetros enlazados.
 */

/** Día anterior al día local de cada zona del coach, y el de la zona por defecto (ver cabecera). */
export interface ContextoRachaPorZona {
  ayerPorZona: Map<string, string>;
  ayerPorDefecto: string;
}

/** Último entrenamiento completado del alumno de la fila (`fecha_fin_utc`); `null` si nunca entrenó. */
export function expresionUltimaSesion(): SQL<Date | null> {
  return sql<Date | null>`(select max(${sesionesEntrenamiento.fechaFinUtc}) from ${sesionesEntrenamiento} where ${sesionesEntrenamiento.alumnoId} = ${perfilesAlumno.usuarioId} and ${sesionesEntrenamiento.estado} = ${EstadoSesion.COMPLETADA} and ${sesionesEntrenamiento.fechaFinUtc} is not null)`.mapWith(
    sesionesEntrenamiento.fechaFinUtc
  );
}

/** Zonas distintas (no vacías) de los alumnos del coach: una sola lectura, solo para `mayor_racha`. */
export async function zonasDistintasDelCoach(
  tx: TenantTransaction,
  entrenadorId: string
): Promise<string[]> {
  const filas = await tx
    .selectDistinct({ zona: perfilesAlumno.zonaHoraria })
    .from(perfilesAlumno)
    .where(eq(perfilesAlumno.entrenadorId, entrenadorId));
  return filas.map((fila) => fila.zona).filter((zona): zona is string => Boolean(zona));
}

/**
 * Contexto de racha para `mayor_racha`. Usa la misma zona que el mapeo JS del ítem
 * (`zona || ZONA_HORARIA_ALUMNO_POR_DEFECTO`) y el mismo `ahora` que ese mapeo: SQL y JS coinciden.
 */
export function contextoRachaPorZona(zonas: string[], ahora: Date): ContextoRachaPorZona {
  const ayerDe = (zona: string) => fechaAnteriorYyyyMmDd(obtenerFechaLocalYyyyMmDd(ahora, zona), 1);
  return {
    ayerPorZona: new Map(zonas.map((zona) => [zona, ayerDe(zona)])),
    ayerPorDefecto: ayerDe(ZONA_HORARIA_ALUMNO_POR_DEFECTO),
  };
}

/**
 * Racha efectiva en SQL con la misma regla que `calcularRachaEfectiva`: vale `racha_dias` si
 * `racha_ultima_fecha` es hoy o ayer en la zona del alumno; si no, 0. El "ayer" de cada zona llega
 * ya calculado desde JS (ver cabecera) y se elige con `zona_horaria` como valor enlazado. Zona nula
 * o vacía cae en la zona por defecto, igual que en JS.
 */
export function expresionRachaEfectiva(racha: ContextoRachaPorZona): SQL<number> {
  const casos = [...racha.ayerPorZona].map(
    ([zona, ayer]) => sql`when ${zona} then ${ayer}::date`
  );
  const ayerDelAlumno =
    casos.length > 0
      ? sql`(case ${perfilesAlumno.zonaHoraria} ${sql.join(casos, sql` `)} else ${racha.ayerPorDefecto}::date end)`
      : sql`${racha.ayerPorDefecto}::date`;
  return sql<number>`case when ${perfilesAlumno.rachaUltimaFecha} >= ${ayerDelAlumno} then ${perfilesAlumno.rachaDias} else 0 end`;
}

/**
 * Cláusulas ORDER BY del directorio. Todas terminan en `perfiles_alumno.id` asc: el orden es total,
 * así que el offset de cada página no repite ni salta filas.
 * `racha` es obligatorio solo para `mayor_racha` (lo calcula `listarAlumnos` dentro de la tx).
 */
export function ordenDirectorio(
  orden: OrdenDirectorioAlumnos,
  racha?: ContextoRachaPorZona
): SQL[] {
  const porId = asc(perfilesAlumno.id);

  switch (orden) {
    case OrdenDirectorioAlumnos.NOMBRE:
      return [
        sql`lower(${perfilesAlumno.nombres}) asc`,
        sql`lower(${perfilesAlumno.apellidos}) asc`,
        porId,
      ];
    case OrdenDirectorioAlumnos.SIN_ENTRENAR:
      // Nunca entrenados primero (NULLS FIRST), luego los de entreno más antiguo.
      return [sql`${expresionUltimaSesion()} asc nulls first`, porId];
    case OrdenDirectorioAlumnos.MAYOR_RACHA:
      if (!racha) {
        throw new Error('ordenDirectorio: mayor_racha requiere el contexto de racha por zona');
      }
      return [
        sql`${expresionRachaEfectiva(racha)} desc`,
        sql`lower(${perfilesAlumno.nombres}) asc`,
        porId,
      ];
    case OrdenDirectorioAlumnos.ALTA_RECIENTE:
    default:
      return [desc(perfilesAlumno.createdAtUtc), porId];
  }
}
