import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { MENSAJE_ALUMNO_NO_ENCONTRADO, MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import { eq, perfilesAlumno } from '@guachafit/database';
import { Rol, Modalidad } from '@guachafit/shared';
import { PresignedUploadUrlSchema } from '@guachafit/shared';
import type {
  PresignedUploadUrlDTO,
  PresignedUploadUrlResponseDTO,
} from '@guachafit/shared';
import type { CallerAntropometria, ContextoAntropometria } from './contexto-antropometria';
import { contextoRlsDeCaller } from './antropometria-reglas';

/**
 * Genera URL presignada PUT directa a Cloudflare R2 con TTL de 15 minutos (RNF-001, ADR-007).
 * Aplica validación RBAC híbrida: los alumnos presenciales no pueden subir fotos corporales de antropometría.
 */
export async function solicitarPresignedUploadUrl(
  ctx: ContextoAntropometria,
  caller: CallerAntropometria,
  dto: PresignedUploadUrlDTO,
  customUuid?: string
): Promise<PresignedUploadUrlResponseDTO> {
  const validado = parsearContrato(PresignedUploadUrlSchema, dto);

  // RBAC primero: un alumno solo opera sobre su propio perfil (y su contexto RLS es self).
  if (caller.rol === Rol.ALUMNO && caller.id !== validado.alumnoId) {
    throw new ForbiddenException('No puedes subir archivos para otro alumno.');
  }

  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el contexto del actor.
  const [alumno] = await ctx.withTenant(contextoRlsDeCaller(caller), (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, validado.alumnoId))
      .limit(1)
  );

  if (!alumno) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  if (caller.rol === Rol.ALUMNO) {
    if (validado.modulo === 'antropometria' && alumno.modalidad === Modalidad.PRESENCIAL) {
      throw new ForbiddenException(
        'Los alumnos en modalidad presencial no registran sus propias medidas: las toma tu entrenador y quedan verificadas.'
      );
    }
  } else if (caller.rol === Rol.ENTRENADOR) {
    const coachId = caller.entrenadorId || caller.id;
    if (alumno.entrenadorId !== coachId) {
      throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
    }
  }

  return ctx.r2StorageService.generarPresignedUploadUrl(validado, customUuid);
}
