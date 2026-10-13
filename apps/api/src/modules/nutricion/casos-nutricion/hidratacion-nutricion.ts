import {
  asc,
  eq,
  fotosComida,
  metasNutricionales,
  perfilesAlumno,
  type TenantRlsContext,
} from '@guachafit/database';
import type {
  CheckinNutricionalDetalleDTO,
  MetasNutricionalesDetalleDTO,
  RecursoNutricionalDetalleDTO,
} from '@guachafit/shared';
import { resolverTimezoneNutricion } from '../nutricion-tiempo.util';
import type { ContextoNutricion } from './contexto-nutricion';

// =============================================================================
// HIDRATACIÓN DE LECTURA (RN-01, RN-03, RNF-003/ADR-011)
// =============================================================================

export function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * RN-03/RN-01: URL firmada de lectura (TTL 900s) de un archivo de la bóveda. `null` honesto
 * cuando no hay bóveda inyectada o la firma falla: el llamador nunca recibe un enlace inventado.
 */
export async function resolverUrlFirmada(
  ctx: ContextoNutricion,
  storageKey: string
): Promise<string | null> {
  if (!ctx.r2StorageService) return null;
  try {
    return await ctx.r2StorageService.generarPresignedGetUrl(storageKey, 900);
  } catch {
    return null;
  }
}

/**
 * RF-002 RN-01: los recursos persistidos se exponen resueltos para lectura. Los enlaces
 * externos viajan tal cual; los archivos subidos se firman con presigned GET (TTL 900s). Si
 * la firma falla (o no hay bóveda inyectada) el recurso queda con `url: null` — la UI lo
 * declara en vez de ofrecer un enlace muerto o inventado.
 */
export async function mapearMetas(
  ctx: ContextoNutricion,
  fila: typeof metasNutricionales.$inferSelect
): Promise<MetasNutricionalesDetalleDTO> {
  return {
    id: fila.id,
    alumnoId: fila.alumnoId,
    caloriasObjetivo: fila.caloriasObjetivo,
    proteinaGramosObjetivo: fila.proteinaGramosObjetivo,
    carbohidratosGramosObjetivo: fila.carbohidratosGramosObjetivo,
    grasasGramosObjetivo: fila.grasasGramosObjetivo,
    aguaLitrosObjetivo: fila.aguaLitrosObjetivo,
    recursos: await Promise.all(
      (fila.recursos ?? []).map(async (recurso): Promise<RecursoNutricionalDetalleDTO> => {
        if (recurso.storageKey) {
          return {
            titulo: recurso.titulo,
            url: await resolverUrlFirmada(ctx, recurso.storageKey),
            storageKey: recurso.storageKey,
          };
        }
        return {
          titulo: recurso.titulo,
          url: recurso.url ?? null,
          storageKey: null,
        };
      })
    ),
    createdAtUtc: toIsoUtcString(fila.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(fila.updatedAtUtc)!,
  };
}

export async function hidratarCheckin(
  ctx: ContextoNutricion,
  checkin: any,
  contextoPerfil: TenantRlsContext
): Promise<CheckinNutricionalDetalleDTO> {
  const fotos = await ctx.db
    .select()
    .from(fotosComida)
    .where(eq(fotosComida.checkinId, checkin.id))
    .orderBy(asc(fotosComida.createdAtUtc));

  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el contexto del actor.
  let alumnoNombre: string | undefined;
  const [perfilAlumno] = await ctx.withTenant(contextoPerfil, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, checkin.alumnoId))
      .limit(1)
  );

  if (perfilAlumno) {
    alumnoNombre = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();
  }

  return {
    id: checkin.id,
    alumnoId: checkin.alumnoId,
    fecha: checkin.fecha,
    semaforo: checkin.semaforo,
    caloriasReportadas: checkin.caloriasReportadas,
    proteinaGramosReportada: checkin.proteinaGramosReportada,
    aguaLitros: checkin.aguaLitros,
    notasAlumno: checkin.notasAlumno,
    fotosPlatos: await Promise.all(
      fotos.map(async (f) => ({
        id: f.id,
        checkinId: f.checkinId,
        tipoComida: f.tipoComida,
        storageKey: f.storageKey,
        fotoUrl: await resolverUrlFirmada(ctx, f.storageKey),
        createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
      }))
    ),
    alumnoNombre,
    capturadoEnUtc: toIsoUtcString(checkin.capturadoEnUtc),
    metasVigentes: checkin.metasVigentes ?? null,
    zonaHoraria: resolverTimezoneNutricion(perfilAlumno?.zonaHoraria),
    createdAtUtc: toIsoUtcString(checkin.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(checkin.updatedAtUtc)!,
  };
}
