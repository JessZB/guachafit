import { NotFoundException } from '@nestjs/common';
import { eq, perfilesAlumno } from '@guachafit/database';
import { ActualizarZonaHorariaAlumnoDTO } from '@guachafit/shared';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import type { ContextoAlumnos } from './contexto-alumnos';

/**
 * LOTE API-N2 (RF-002): el alumno cambia SU zona horaria. El perfil se identifica por el usuario
 * autenticado (nunca por un id del cuerpo) y la escritura corre con el contexto self, cubierta
 * por la política `rls_perfiles_alumno_self_update`. Solo se escribe esta columna y su marca
 * `zona_horaria_definida` (ADR-025: elegir la zona la vuelve una decisión, no una precarga).
 * Movido sin cambios desde `AlumnosService.actualizarZonaHorariaPropia` (P3).
 */
export async function actualizarZonaHorariaPropia(
  ctx: Pick<ContextoAlumnos, 'withTenant'>,
  usuarioId: string,
  dto: ActualizarZonaHorariaAlumnoDTO
): Promise<{ zonaHoraria: string }> {
  const [fila] = await ctx.withTenant({ usuarioId }, (tx) =>
    tx
      .update(perfilesAlumno)
      .set({ zonaHoraria: dto.zonaHoraria, zonaHorariaDefinida: true, updatedAtUtc: new Date() })
      .where(eq(perfilesAlumno.usuarioId, usuarioId))
      .returning({ zonaHoraria: perfilesAlumno.zonaHoraria })
  );

  if (!fila) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  return { zonaHoraria: fila.zonaHoraria };
}
