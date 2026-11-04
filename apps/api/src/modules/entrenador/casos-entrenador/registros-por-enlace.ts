import { and, eq, gte, perfilesAlumno } from '@guachafit/database';
import { OrigenRegistro } from '@guachafit/shared';
import type { ContextoEntrenador } from './contexto-entrenador';

interface FilaRegistro {
  origenRegistro?: string | null;
  createdAtUtc?: Date | null;
}

/**
 * D17: cuenta los alumnos que llegaron por el enlace vigente: origen `enlace` y creados en o después
 * de la última rotación (`rotadoEn`); con `rotadoEn = null` (nunca rotado) cuentan todos los de
 * origen `enlace`. Es la regla única; la consulta solo acota el volumen que se trae.
 */
export function contarRegistrosDelEnlace(
  filas: readonly FilaRegistro[],
  rotadoEn: Date | null
): number {
  return filas.filter(
    (fila) =>
      fila.origenRegistro === OrigenRegistro.ENLACE &&
      (rotadoEn === null ||
        (fila.createdAtUtc != null && fila.createdAtUtc.getTime() >= rotadoEn.getTime()))
  ).length;
}

/**
 * `perfiles_alumno` tiene RLS: la lectura corre dentro de `withTenant` con el entrenador dueño.
 * `entrenadorUsuarioId` es `usuarios.id` del entrenador (el `entrenador_id` de sus alumnos).
 */
export async function registrosPorEnlace(
  ctx: ContextoEntrenador,
  entrenadorUsuarioId: string,
  rotadoEn: Date | null
): Promise<number> {
  const filas = await ctx.withTenant({ entrenadorId: entrenadorUsuarioId }, (tx) =>
    tx
      .select({
        origenRegistro: perfilesAlumno.origenRegistro,
        createdAtUtc: perfilesAlumno.createdAtUtc,
      })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorUsuarioId),
          eq(perfilesAlumno.origenRegistro, OrigenRegistro.ENLACE),
          rotadoEn ? gte(perfilesAlumno.createdAtUtc, rotadoEn) : undefined
        )
      )
  );
  return contarRegistrosDelEnlace(filas, rotadoEn);
}
