import {
  and,
  eq,
  inArray,
  isNull,
  perfilesAlumno,
  perfilesEntrenador,
  usuarios,
} from '@guachafit/database';
import { EstadoAlumno, EstadoLicencia, EstadoUsuario } from '@guachafit/shared';
import type { ContextoResumenSemanal } from './contexto-resumen-semanal';

export interface CoachResumen {
  usuarioId: string;
  nombres: string;
  apellidos: string;
  nombreComercial: string | null;
}

export interface AlumnoCartera {
  usuarioId: string;
  entrenadorId: string;
  zonaHoraria: string | null;
}

export interface CarteraDigest {
  coaches: CoachResumen[];
  alumnos: AlumnoCartera[];
  coachPorAlumno: Map<string, string>;
  alumnosActivosPorCoach: Map<string, number>;
}

/**
 * Lee la cartera viva del digest: coaches activos y sus alumnos activos.
 * Si no hay coaches, vuelve con la cartera vacía sin consultar alumnos.
 */
export async function leerCarteraDigest(
  ctx: Pick<ContextoResumenSemanal, 'db' | 'withTenant'>
): Promise<CarteraDigest> {
  const coaches = await ctx.db
    .select({
      usuarioId: perfilesEntrenador.usuarioId,
      nombres: perfilesEntrenador.nombres,
      apellidos: perfilesEntrenador.apellidos,
      nombreComercial: perfilesEntrenador.nombreComercial,
    })
    .from(perfilesEntrenador)
    .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
    .where(
      and(
        eq(usuarios.estado, EstadoUsuario.ACTIVO),
        eq(perfilesEntrenador.estadoLicencia, EstadoLicencia.ACTIVA)
      )
    );

  if (coaches.length === 0) {
    return { coaches: [], alumnos: [], coachPorAlumno: new Map(), alumnosActivosPorCoach: new Map() };
  }

  const coachIds = coaches.map((c) => c.usuarioId);

  // Alumnos ACTIVOS por coach (la cartera viva del digest).
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; ruta de sistema con el bypass
  // explícito `is_superadmin` (el digest agrega la cartera de TODOS los tenants).
  const alumnos = await ctx.withTenant({ isSuperadmin: true }, (tx) =>
    tx
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        zonaHoraria: perfilesAlumno.zonaHoraria,
      })
      .from(perfilesAlumno)
      .where(
        and(
          inArray(perfilesAlumno.entrenadorId, coachIds),
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      )
  );

  const coachPorAlumno = new Map<string, string>();
  const alumnosActivosPorCoach = new Map<string, number>();
  for (const alumno of alumnos) {
    coachPorAlumno.set(alumno.usuarioId, alumno.entrenadorId);
    alumnosActivosPorCoach.set(
      alumno.entrenadorId,
      (alumnosActivosPorCoach.get(alumno.entrenadorId) ?? 0) + 1
    );
  }

  return { coaches, alumnos, coachPorAlumno, alumnosActivosPorCoach };
}
