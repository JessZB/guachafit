import { NotFoundException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';
import { contextoRlsDeActor, lanzarAccesoDenegado } from './acceso-rls';
import { hidratarPlanActivo as hidratarPlanActivoBase } from './hidratar-plan-activo';
import { sanitizarPerfilParaRol } from './sanitizar-perfil';

/**
 * Obtener perfil por ID con aislamiento de Tenancy.
 * Movido sin cambios desde `AlumnosService.obtenerPorId` (P3).
 */
export async function obtenerPorId(
  ctx: ContextoCasosAlumnos,
  alumnoId: string,
  actorUserId: string,
  actorRole: Rol,
  actorEntrenadorId?: string
) {
  const hidratarPlan = ctx.hidratarPlanActivo ?? hidratarPlanActivoBase;
  const [perfil] = await ctx.withTenant(
    contextoRlsDeActor(actorUserId, actorRole, actorEntrenadorId),
    (tx) =>
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
          periodicidadAntropometria: perfilesAlumno.periodicidadAntropometria,
          antropometriaInicio: perfilesAlumno.antropometriaInicio,
          tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
          zonaHoraria: perfilesAlumno.zonaHoraria,
          deletedAtUtc: perfilesAlumno.deletedAtUtc,
          createdAtUtc: perfilesAlumno.createdAtUtc,
        })
        .from(perfilesAlumno)
        .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
        .where(eq(perfilesAlumno.id, alumnoId))
  );

  if (!perfil) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  if (actorRole === Rol.ALUMNO && perfil.usuarioId !== actorUserId) {
    throw lanzarAccesoDenegado(
      ctx,
      { usuarioId: actorUserId, rol: actorRole },
      { ruta: '/alumnos/:id', metodo: 'GET' },
      'PERFIL_DE_OTRO_ALUMNO'
    );
  }

  if (actorRole === Rol.ENTRENADOR && perfil.entrenadorId !== actorEntrenadorId && perfil.entrenadorId !== actorUserId) {
    throw lanzarAccesoDenegado(
      ctx,
      { usuarioId: actorUserId, rol: actorRole },
      { ruta: '/alumnos/:id', metodo: 'GET' },
      'ALUMNO_DE_OTRO_ENTRENADOR'
    );
  }

  const planActivo = (
    await ctx.withTenant({ entrenadorId: perfil.entrenadorId }, (tx) =>
      hidratarPlan(tx, perfil.entrenadorId, [perfil.usuarioId])
    )
  ).get(perfil.usuarioId);

  return sanitizarPerfilParaRol(
    ctx,
    planActivo ? { ...perfil, ...planActivo } : perfil,
    actorRole
  );
}
