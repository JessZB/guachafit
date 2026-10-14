import { NotFoundException } from '@nestjs/common';
import { and, eq, isNull, perfilesAlumno } from '@guachafit/database';
import { CambioEstadoAlumnoDTO, EstadoAlumno } from '@guachafit/shared';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * §6: etiquetas humanas del estado de activación para los mensajes devueltos al usuario.
 * Nunca se interpola el valor crudo del enum (`inactivo_pausado`).
 * Movido sin cambios (P3).
 */
export const ETIQUETA_ESTADO_ACTIVACION: Record<EstadoAlumno, string> = {
  [EstadoAlumno.ACTIVO]: 'activo',
  [EstadoAlumno.INACTIVO_PAUSADO]: 'pausado',
  [EstadoAlumno.SUSPENDIDO_PAGO]: 'suspendido por pago',
};

/**
 * Cambio de estado de activación del alumno (RF-012).
 * Movido sin cambios desde `AlumnosService.cambiarEstado` (P3).
 */
export async function cambiarEstado(
  ctx: Pick<ContextoCasosAlumnos, 'withTenant'>,
  entrenadorId: string,
  alumnoId: string,
  dto: CambioEstadoAlumnoDTO
) {
  const actualizado = await ctx.withTenant({ entrenadorId }, async (tx) => {
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

    const [fila] = await tx
      .update(perfilesAlumno)
      .set({
        estadoActivacion: dto.nuevoEstado,
        updatedAtUtc: new Date(),
      })
      .where(eq(perfilesAlumno.id, alumnoId))
      .returning();

    return fila;
  });

  return {
    id: actualizado.id,
    estadoActivacion: actualizado.estadoActivacion,
    mensaje: `El estado del alumno ha sido actualizado a ${
      ETIQUETA_ESTADO_ACTIVACION[actualizado.estadoActivacion] ?? 'sin dato'
    }.`,
  };
}
