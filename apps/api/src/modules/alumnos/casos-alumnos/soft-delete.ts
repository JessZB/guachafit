import { NotFoundException } from '@nestjs/common';
import { and, eq, isNull, perfilesAlumno } from '@guachafit/database';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * Logical delete (soft delete) of a student (RF-012, RN-01, RN-02).
 * Moved verbatim from `AlumnosService.softDelete` (P3).
 */
export async function softDelete(
  ctx: Pick<ContextoCasosAlumnos, 'withTenant'>,
  entrenadorId: string,
  alumnoId: string
) {
  const nowUtc = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [perfil] = await tx
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    if (!perfil) {
      throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    }

    const ahora = new Date();
    await tx
      .update(perfilesAlumno)
      .set({
        deletedAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .where(eq(perfilesAlumno.id, alumnoId));

    return ahora;
  });

  return {
    id: alumnoId,
    deletedAtUtc: nowUtc.toISOString(),
    mensaje: 'Alumno dado de baja exitosamente. Su histórico deportivo y financiero ha sido preservado.',
  };
}
