import { NotFoundException } from '@nestjs/common';
import { and, eq, perfilesAlumno, usuarios } from '@guachafit/database';
import { EstadoAlumno, EstadoUsuario, RestaurarAlumnoDTO, Rol } from '@guachafit/shared';
import { MENSAJE_ALUMNO_FUERA_DE_LISTA } from '../../../common/mensajes-acceso';
import type { ContextoAlumnos } from './contexto-alumnos';
import { lanzarAccesoDenegado } from './acceso-rls';

/**
 * Restauración de Alumno Dado de Baja Lógica (RF-012, RN-04).
 * Movido sin cambios desde `AlumnosService.restaurarAlumno` (P3).
 */
export async function restaurarAlumno(
  ctx: ContextoAlumnos,
  entrenadorId: string,
  alumnoId: string,
  _dto?: RestaurarAlumnoDTO
) {
  const resultado = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [perfil] = await tx
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!perfil) {
      const [perfilOtroCoach] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.id, alumnoId));

      if (perfilOtroCoach) {
        throw lanzarAccesoDenegado(
          ctx,
          { usuarioId: entrenadorId, rol: Rol.ENTRENADOR },
          { ruta: '/alumnos/:id/restaurar', metodo: 'PATCH' },
          'ALUMNO_DE_OTRO_ENTRENADOR'
        );
      }

      throw new NotFoundException(MENSAJE_ALUMNO_FUERA_DE_LISTA);
    }

    if (!perfil.deletedAtUtc && perfil.estadoActivacion === EstadoAlumno.ACTIVO) {
      return { yaActivo: true, perfil };
    }

    const nowUtc = new Date();
    await tx
      .update(perfilesAlumno)
      .set({
        deletedAtUtc: null,
        estadoActivacion: EstadoAlumno.ACTIVO,
        updatedAtUtc: nowUtc,
      })
      .where(eq(perfilesAlumno.id, alumnoId));

    await tx
      .update(usuarios)
      .set({
        activo: true,
        estado: EstadoUsuario.ACTIVO,
        updatedAtUtc: nowUtc,
      })
      .where(eq(usuarios.id, perfil.usuarioId));

    return { yaActivo: false, perfil };
  });

  if (resultado.yaActivo) {
    return {
      id: alumnoId,
      estadoActivacion: EstadoAlumno.ACTIVO,
      deletedAtUtc: null,
      mensaje: 'Este alumno ya está activo en tu lista.',
    };
  }

  return {
    id: alumnoId,
    estadoActivacion: EstadoAlumno.ACTIVO,
    deletedAtUtc: null,
    mensaje: 'Alumno restaurado exitosamente. Todo su histórico deportivo y financiero ha sido reactivado.',
  };
}
