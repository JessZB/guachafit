import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import { and, controlesAntropometricos, fotosAntropometria, perfilesAlumno } from '@guachafit/database';
import { eq } from '@guachafit/database';
import { Rol, EstadoMedicion } from '@guachafit/shared';
import { ConsultaComparadorFotograficoSchema } from '@guachafit/shared';
import type {
  ComparativaAngularDTO,
  ConsultaComparadorFotograficoDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import type { CallerAntropometria, ContextoAntropometria } from './contexto-antropometria';
import { toIsoUtcString, MENSAJE_CONTROL_NO_ENCONTRADO } from './antropometria-reglas';
import { fotoFirmable, hidratarControl } from './hidratar-control';

export interface ComparativaAngularResultadoDTO extends ComparativaAngularDTO {
  fotoDisponible: boolean;
}

/**
 * Comparador fotográfico angular (Semana A vs Semana B) (RF-004).
 * Valida estado Aprobado en ambas fechas y genera presigned GET URLs con TTL 900s.
 * Maneja perspectivas faltantes sin lanzar error 500.
 */
export async function obtenerComparativaFotografica(
  ctx: ContextoAntropometria,
  alumnoId: string,
  dto: ConsultaComparadorFotograficoDTO,
  caller?: CallerAntropometria
): Promise<ComparativaAngularResultadoDTO> {
  parsearContrato(ConsultaComparadorFotograficoSchema, dto);

  if (caller) {
    if (caller.rol === Rol.ALUMNO && caller.id !== alumnoId) {
      throw new ForbiddenException('Solo puedes ver tu propia comparación de fotos.');
    }
    if (caller.rol === Rol.ENTRENADOR) {
      const coachId = caller.entrenadorId || caller.id;
      // RNF-003/ADR-011 (etapa 3): lectura del perfil con el GUC del coach (RLS).
      const [perfil] = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
        tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1)
      );

      if (!perfil || perfil.entrenadorId !== coachId) {
        throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
      }
    }
  }

  const [controlA] = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(eq(controlesAntropometricos.id, dto.controlIdA))
    .limit(1);

  const [controlB] = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(eq(controlesAntropometricos.id, dto.controlIdB))
    .limit(1);

  if (!controlA || controlA.alumnoId !== alumnoId) {
    throw new NotFoundException(MENSAJE_CONTROL_NO_ENCONTRADO);
  }
  if (!controlB || controlB.alumnoId !== alumnoId) {
    throw new NotFoundException(MENSAJE_CONTROL_NO_ENCONTRADO);
  }

  if (controlA.estado !== EstadoMedicion.APROBADO || controlB.estado !== EstadoMedicion.APROBADO) {
    throw new BadRequestException('Solo es posible comparar fotográficamente evaluaciones en estado Aprobado.');
  }

  const [fotoAGuardada] = await ctx.db
    .select()
    .from(fotosAntropometria)
    .where(
      and(
        eq(fotosAntropometria.controlId, dto.controlIdA),
        eq(fotosAntropometria.angulo, dto.angulo)
      )
    )
    .limit(1);

  const [fotoBGuardada] = await ctx.db
    .select()
    .from(fotosAntropometria)
    .where(
      and(
        eq(fotosAntropometria.controlId, dto.controlIdB),
        eq(fotosAntropometria.angulo, dto.angulo)
      )
    )
    .limit(1);

  // Defensa en profundidad (RNF-001): una clave guardada antes de validar la escritura que no
  // pertenezca al alumno no se firma; esa perspectiva queda como "foto no disponible".
  const fotoARaw = fotoFirmable(ctx, fotoAGuardada, alumnoId);
  const fotoBRaw = fotoFirmable(ctx, fotoBGuardada, alumnoId);

  let fotoA: FotoAntropometriaDetalleDTO | null = null;
  let fotoB: FotoAntropometriaDetalleDTO | null = null;

  if (fotoARaw) {
    fotoA = {
      id: fotoARaw.id,
      controlId: fotoARaw.controlId,
      angulo: fotoARaw.angulo,
      storageKey: fotoARaw.storageKey,
      presignedGetUrl: await ctx.r2StorageService.generarPresignedGetUrl(fotoARaw.storageKey, 900),
      createdAtUtc: toIsoUtcString(fotoARaw.createdAtUtc)!,
    };
  }

  if (fotoBRaw) {
    fotoB = {
      id: fotoBRaw.id,
      controlId: fotoBRaw.controlId,
      angulo: fotoBRaw.angulo,
      storageKey: fotoBRaw.storageKey,
      presignedGetUrl: await ctx.r2StorageService.generarPresignedGetUrl(fotoBRaw.storageKey, 900),
      createdAtUtc: toIsoUtcString(fotoBRaw.createdAtUtc)!,
    };
  }

  const fotoDisponible = Boolean(fotoA && fotoB);

  const pesoA = Number(controlA.pesoKg);
  const pesoB = Number(controlB.pesoKg);
  const diferenciaPesoKg = (pesoB - pesoA).toFixed(2);

  let diferenciaGrasaPorcentaje: string | null = null;
  if (controlA.porcentajeGrasa !== null && controlB.porcentajeGrasa !== null) {
    const grasaA = Number(controlA.porcentajeGrasa);
    const grasaB = Number(controlB.porcentajeGrasa);
    diferenciaGrasaPorcentaje = (grasaB - grasaA).toFixed(2);
  }

  const controlADetalle = await hidratarControl(ctx, controlA, false);
  const controlBDetalle = await hidratarControl(ctx, controlB, false);

  return {
    angulo: dto.angulo,
    controlA: controlADetalle,
    controlB: controlBDetalle,
    fotoA,
    fotoB,
    fotoDisponible,
    diferenciaPesoKg,
    diferenciaGrasaPorcentaje,
  };
}
