import { ForbiddenException } from '@nestjs/common';
import {
  and,
  checkinsNutricionales,
  desc,
  eq,
  fotosComida,
  gte,
  inArray,
  lte,
} from '@guachafit/database';
import {
  FiltroCheckinsNutricionalesSchema,
  Rol,
  type CheckinNutricionalDetalleDTO,
  type FiltroCheckinsNutricionalesDTO,
  type FotoComidaDetalleDTO,
} from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoNutricion } from './contexto-nutricion';
import { obtenerZonaHorariaAlumno, validarAlumnoDelCoach } from './acceso-nutricion';
import { resolverUrlFirmada, toIsoUtcString } from './hidratacion-nutricion';

/**
 * Listar historial de check-ins nutricionales para alumno o entrenador.
 * Valida aislamiento de tenancy si consulta el entrenador.
 */
export async function listarCheckins(
  ctx: ContextoNutricion,
  entrenadorId: string,
  alumnoId: string,
  filtro?: FiltroCheckinsNutricionalesDTO,
  callerRol?: Rol,
  callerId?: string
): Promise<CheckinNutricionalDetalleDTO[]> {
  // Validar aislamiento Tenancy
  if (callerRol === Rol.ALUMNO && callerId && callerId !== alumnoId) {
    throw new ForbiddenException('Solo puedes ver tus propios reportes.');
  }

  // LOTE API-N2: cada reporte declara la zona del perfil con la que se interpreta su fecha.
  const zonaHoraria =
    callerRol === Rol.ENTRENADOR
      ? await validarAlumnoDelCoach(ctx, entrenadorId, alumnoId)
      : await obtenerZonaHorariaAlumno(ctx, alumnoId, { usuarioId: alumnoId });

  // LOTE API-N1: fechas reales y rango acotado (92 días) también para llamadas internas.
  const filtroValidado = parsearContrato(FiltroCheckinsNutricionalesSchema, filtro ?? {});

  const conditions = [eq(checkinsNutricionales.alumnoId, alumnoId)];

  if (filtroValidado.desde) {
    conditions.push(gte(checkinsNutricionales.fecha, filtroValidado.desde));
  }
  if (filtroValidado.hasta) {
    conditions.push(lte(checkinsNutricionales.fecha, filtroValidado.hasta));
  }
  if (filtroValidado.semaforo) {
    conditions.push(eq(checkinsNutricionales.semaforo, filtroValidado.semaforo));
  }

  const rows = await ctx.db
    .select()
    .from(checkinsNutricionales)
    .where(and(...conditions))
    .orderBy(desc(checkinsNutricionales.fecha));

  const checkinIds = rows.map((r) => r.id);
  const fotosMap = new Map<string, FotoComidaDetalleDTO[]>();

  if (checkinIds.length > 0) {
    const fotosRows = await ctx.db
      .select()
      .from(fotosComida)
      .where(inArray(fotosComida.checkinId, checkinIds));

    // RN-03: cada foto se hidrata con su URL firmada de lectura (TTL 900s). `fotoUrl` queda
    // null si la firma falla o no hay bóveda configurada; la UI lo declara en vez de romperse.
    const fotosHidratadas = await Promise.all(
      fotosRows.map(async (f) => ({
        id: f.id,
        checkinId: f.checkinId,
        tipoComida: f.tipoComida,
        storageKey: f.storageKey,
        fotoUrl: await resolverUrlFirmada(ctx, f.storageKey),
        createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
      }))
    );

    for (const foto of fotosHidratadas) {
      if (!fotosMap.has(foto.checkinId)) {
        fotosMap.set(foto.checkinId, []);
      }
      fotosMap.get(foto.checkinId)!.push(foto);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    alumnoId: r.alumnoId,
    fecha: r.fecha,
    semaforo: r.semaforo,
    caloriasReportadas: r.caloriasReportadas,
    proteinaGramosReportada: r.proteinaGramosReportada,
    aguaLitros: r.aguaLitros,
    notasAlumno: r.notasAlumno,
    fotosPlatos: fotosMap.get(r.id) || [],
    capturadoEnUtc: toIsoUtcString(r.capturadoEnUtc),
    metasVigentes: r.metasVigentes ?? null,
    zonaHoraria,
    createdAtUtc: toIsoUtcString(r.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(r.updatedAtUtc)!,
  }));
}
