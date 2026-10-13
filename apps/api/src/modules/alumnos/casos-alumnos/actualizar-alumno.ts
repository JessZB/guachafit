import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { eq, or, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  ActualizarPerfilAlumnoDTO,
  PerfilAlumnoDetalleDTO,
  Rol,
} from '@guachafit/shared';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';
import { lanzarAccesoDenegado } from './acceso-rls';
import { hidratarPlanActivo as hidratarPlanActivoBase } from './hidratar-plan-activo';
import { sanitizarPerfilParaRol } from './sanitizar-perfil';

/**
 * Full record and health-file edition by the coach (RF-011, RF-012).
 * Moved verbatim from `AlumnosService.actualizarAlumno` (P3).
 */
export async function actualizarAlumno(
  ctx: ContextoCasosAlumnos,
  entrenadorId: string,
  alumnoId: string,
  dto: ActualizarPerfilAlumnoDTO
): Promise<PerfilAlumnoDetalleDTO> {
  const hidratarPlan = ctx.hidratarPlanActivo ?? hidratarPlanActivoBase;
  const { perfil, actualizado } = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [perfil] = await tx
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
      .where(
        or(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.usuarioId, alumnoId)
        )
      );

    if (!perfil) {
      throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
    }

    if (perfil.entrenadorId !== entrenadorId) {
      throw lanzarAccesoDenegado(
        ctx,
        { usuarioId: entrenadorId, rol: Rol.ENTRENADOR },
        { ruta: '/alumnos/:id', metodo: 'PATCH' },
        'ALUMNO_DE_OTRO_ENTRENADOR'
      );
    }

    if (perfil.deletedAtUtc) {
      throw new ConflictException(
        'El alumno está dado de baja. Restáuralo para volver a operar sobre su expediente.'
      );
    }

    const valoresAActualizar: Record<string, any> = {
      updatedAtUtc: new Date(),
    };

    if (dto.nombres !== undefined) {
      valoresAActualizar.nombres = dto.nombres.trim();
    }
    if (dto.apellidos !== undefined) {
      valoresAActualizar.apellidos = dto.apellidos.trim();
    }
    if (dto.tipoDocumento !== undefined) {
      valoresAActualizar.tipoDocumento = dto.tipoDocumento;
    }
    if (dto.numeroDocumento !== undefined) {
      valoresAActualizar.numeroDocumento = dto.numeroDocumento.trim();
    }
    if (dto.fechaNacimiento !== undefined) {
      valoresAActualizar.fechaNacimiento = dto.fechaNacimiento;
    }
    if (dto.telefonoWhatsapp !== undefined) {
      valoresAActualizar.telefonoWhatsapp = dto.telefonoWhatsapp.trim();
    }
    if (dto.modalidad !== undefined) {
      valoresAActualizar.modalidad = dto.modalidad;
    }
    const periodicidadEfectiva =
      dto.periodicidadAntropometria !== undefined
        ? dto.periodicidadAntropometria
        : perfil.periodicidadAntropometria;
    const inicioEfectivo =
      dto.antropometriaInicio !== undefined ? dto.antropometriaInicio : perfil.antropometriaInicio;

    if (periodicidadEfectiva && !inicioEfectivo) {
      throw new BadRequestException(
        'Para activar la periodicidad del check-in antropométrico debes indicar la fecha de inicio del calendario.'
      );
    }

    if (dto.periodicidadAntropometria !== undefined) {
      valoresAActualizar.periodicidadAntropometria = dto.periodicidadAntropometria;
    }
    if (dto.antropometriaInicio !== undefined) {
      valoresAActualizar.antropometriaInicio = dto.antropometriaInicio || null;
    }
    if (dto.tasaFijadaOverride !== undefined) {
      valoresAActualizar.tasaFijadaOverride = dto.tasaFijadaOverride || null;
    }
    if (dto.zonaHoraria !== undefined) {
      valoresAActualizar.zonaHoraria = dto.zonaHoraria;
    }
    if (dto.fichaSaludPrivada !== undefined) {
      valoresAActualizar.fichaSaludPrivada =
        dto.fichaSaludPrivada && dto.fichaSaludPrivada.trim().length > 0
          ? ctx.cryptoService.encryptHealthRecord(dto.fichaSaludPrivada)
          : null;
    }

    const [fila] = await tx
      .update(perfilesAlumno)
      .set(valoresAActualizar)
      .where(eq(perfilesAlumno.id, perfil.id))
      .returning();

    return { perfil, actualizado: fila };
  });

  const perfilActualizadoConEmail = {
    ...actualizado,
    email: perfil.email,
  };

  const planActivo = (
    await ctx.withTenant({ entrenadorId: actualizado.entrenadorId }, (tx) =>
      hidratarPlan(tx, actualizado.entrenadorId, [actualizado.usuarioId])
    )
  ).get(actualizado.usuarioId);

  return sanitizarPerfilParaRol(
    ctx,
    planActivo ? { ...perfilActualizadoConEmail, ...planActivo } : perfilActualizadoConEmail,
    Rol.ENTRENADOR
  );
}
