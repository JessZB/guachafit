import { NotFoundException } from '@nestjs/common';
import { asc } from '@guachafit/database';
import { fotosAntropometria, controlesAntropometricos } from '@guachafit/database';
import { eq } from '@guachafit/database';
import type {
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import type { ContextoAntropometria } from './contexto-antropometria';
import {
  esClaveFotoDelAlumno,
  toIsoUtcString,
  construirPerimetrosDTO,
  construirPlieguesDTO,
  MENSAJE_CONTROL_NO_ENCONTRADO,
} from './antropometria-reglas';

/**
 * RNF-001: returns the photo only if its key belongs to the student's
 * antropometria vault. A row with a foreign key (accepted before the write
 * guard) is not signed and is logged without student data or the key, so it
 * can be cleaned up.
 */
export function fotoFirmable<T extends { id: string; storageKey: string }>(
  ctx: ContextoAntropometria,
  foto: T | undefined,
  alumnoId: string
): T | undefined {
  if (!foto) return undefined;
  if (esClaveFotoDelAlumno(foto.storageKey, alumnoId)) return foto;
  ctx.logger.warn(
    `Foto antropométrica ${foto.id} con clave fuera de la bóveda de su alumno: no se firma.`
  );
  return undefined;
}

export async function hidratarControl(
  ctx: ContextoAntropometria,
  control: any,
  cargarFotos = true,
  alumnoNombre: string | null = null
): Promise<ControlAntropometricoDetalleDTO> {
  let fotos: FotoAntropometriaDetalleDTO[] = [];
  if (cargarFotos) {
    const fotosRows = await ctx.db
      .select()
      .from(fotosAntropometria)
      .where(eq(fotosAntropometria.controlId, control.id))
      .orderBy(asc(fotosAntropometria.createdAtUtc));

    // Defense in depth (RNF-001): only keys of this student's vault are signed.
    const firmables = fotosRows.filter((f) => fotoFirmable(ctx, f, control.alumnoId));
    fotos = await Promise.all(
      firmables.map(async (f) => ({
        id: f.id,
        controlId: f.controlId,
        angulo: f.angulo,
        storageKey: f.storageKey,
        presignedGetUrl: await ctx.r2StorageService.generarPresignedGetUrl(f.storageKey, 900),
        createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
      }))
    );
  }

  // RF-003 RN-02 (WU RF-003a): legacy aliases resolved on read. `brazoCm`/`musloCm` keep
  // the historical data (controls before the new columns) and the new model also exposes
  // them as `brazoRelajadoCm`/`musloMedioCm`; the new columns take precedence.
  const perimetros = construirPerimetrosDTO(control);
  const pliegues = construirPlieguesDTO(control);

  return {
    id: control.id,
    alumnoId: control.alumnoId,
    alumnoNombre,
    fechaEvaluacion: control.fechaEvaluacion,
    pesoKg: control.pesoKg,
    alturaCm: control.alturaCm ?? null,
    porcentajeGrasa: control.porcentajeGrasa ?? null,
    perimetros,
    pliegues,
    modalidad: control.modalidad,
    origen: control.origen,
    registradoPor: control.registradoPor,
    estado: control.estado,
    observacionesCoach: control.observacionesCoach ?? null,
    motivoRechazo: control.motivoRechazo ?? null,
    fechaAprobacionUtc: toIsoUtcString(control.fechaAprobacionUtc),
    fotos,
    createdAtUtc: toIsoUtcString(control.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(control.updatedAtUtc)!,
  };
}

export async function obtenerControlPorIdInterno(
  ctx: ContextoAntropometria,
  controlId: string
): Promise<ControlAntropometricoDetalleDTO> {
  const [control] = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(eq(controlesAntropometricos.id, controlId))
    .limit(1);

  if (!control) {
    throw new NotFoundException(MENSAJE_CONTROL_NO_ENCONTRADO);
  }

  return hidratarControl(ctx, control);
}
