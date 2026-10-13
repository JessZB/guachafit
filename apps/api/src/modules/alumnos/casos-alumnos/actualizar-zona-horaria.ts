import { NotFoundException } from '@nestjs/common';
import { eq, perfilesAlumno } from '@guachafit/database';
import { ActualizarZonaHorariaAlumnoDTO } from '@guachafit/shared';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * LOTE API-N2 (RF-002): the student changes their own time zone.
 * Moved verbatim from `AlumnosService.actualizarZonaHorariaPropia` (P3).
 */
export async function actualizarZonaHorariaPropia(
  ctx: Pick<ContextoCasosAlumnos, 'withTenant'>,
  usuarioId: string,
  dto: ActualizarZonaHorariaAlumnoDTO
): Promise<{ zonaHoraria: string }> {
  const [fila] = await ctx.withTenant({ usuarioId }, (tx) =>
    tx
      .update(perfilesAlumno)
      .set({ zonaHoraria: dto.zonaHoraria, updatedAtUtc: new Date() })
      .where(eq(perfilesAlumno.usuarioId, usuarioId))
      .returning({ zonaHoraria: perfilesAlumno.zonaHoraria })
  );

  if (!fila) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  return { zonaHoraria: fila.zonaHoraria };
}
