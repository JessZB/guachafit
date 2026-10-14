import { asc, eq } from '@guachafit/database';
import {
  ejerciciosCatalogo,
  ejerciciosSesion,
  perfilesAlumno,
  seriesRegistro,
} from '@guachafit/database';
import { EstadoSesion } from '@guachafit/shared';
import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { TenantRlsContext } from '@guachafit/database';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { calcularDuracionMinutos, toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// HELPER: HIDRATACIÓN DE SESIÓN CON EJERCICIOS Y SERIES
// (Movido sin cambios desde `EntrenamientoService.hidratarSesion`; P3: mismo
// orden y forma de consultas, mismo `withTenant` con el contexto del actor.)
// ---------------------------------------------------------------------------

export async function hidratarSesion(
  ctx: ContextoEntrenamiento,
  sesion: any,
  contextoPerfil: TenantRlsContext
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db, withTenant } = ctx;
  const ejSesiones = await db
    .select()
    .from(ejerciciosSesion)
    .where(eq(ejerciciosSesion.sesionId, sesion.id))
    .orderBy(asc(ejerciciosSesion.orden));

  const ejSesionIds = ejSesiones.map((e) => e.id);
  const ejercicioIds = ejSesiones.map((e) => e.ejercicioId);

  // Cargar catálogo de ejercicios
  const ejerciciosCatalogoMap = new Map<string, any>();
  for (const ejId of ejercicioIds) {
    const [cat] = await db
      .select()
      .from(ejerciciosCatalogo)
      .where(eq(ejerciciosCatalogo.id, ejId))
      .limit(1);
    if (cat) {
      ejerciciosCatalogoMap.set(cat.id, cat);
    }
  }

  // Cargar series de los ejercicios
  const seriesMap = new Map<string, SerieRegistroDetalleDTO[]>();
  for (const ejSesionId of ejSesionIds) {
    const seriesRows = await db
      .select()
      .from(seriesRegistro)
      .where(eq(seriesRegistro.ejercicioSesionId, ejSesionId))
      .orderBy(asc(seriesRegistro.numeroSerie));

    for (const s of seriesRows) {
      if (!seriesMap.has(s.ejercicioSesionId)) {
        seriesMap.set(s.ejercicioSesionId, []);
      }
      seriesMap.get(s.ejercicioSesionId)!.push({
        id: s.id,
        ejercicioSesionId: s.ejercicioSesionId,
        numeroSerie: s.numeroSerie,
        repsObjetivo: s.repsObjetivo,
        repsLogradas: s.repsLogradas,
        pesoKg: s.pesoKg,
        pesoPrescritoKg: s.pesoPrescritoKg ?? null,
        rpe: s.rpe,
        descansoSegundos: s.descansoSegundos ?? null,
        completada: s.completada,
        timestampInicioUtc: toIsoUtcString(s.timestampInicioUtc),
        timestampCompletadaUtc: toIsoUtcString(s.timestampCompletadaUtc),
      });
    }
  }

  // Nombre del alumno si está disponible.
  // RNF-003/ADR-011 (etapa 3): lectura del perfil con RLS usando el contexto del actor.
  let alumnoNombre: string | undefined;
  const [perfilAlumno] = await withTenant(contextoPerfil, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, sesion.alumnoId))
      .limit(1)
  );

  if (perfilAlumno) {
    alumnoNombre = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();
  }

  const duracionMinutos = calcularDuracionMinutos(sesion.fechaInicioUtc, sesion.fechaFinUtc);
  const cumplimientoNum = parseFloat(sesion.porcentajeCumplimiento || '0');
  const cumpleReglaRacha = sesion.estado === EstadoSesion.COMPLETADA && cumplimientoNum >= 70.0;

  const ejerciciosHydrated: EjercicioSesionDetalleDTO[] = ejSesiones.map((e) => {
    const cat = ejerciciosCatalogoMap.get(e.ejercicioId);
    return {
      id: e.id,
      sesionId: e.sesionId,
      ejercicioId: e.ejercicioId,
      orden: e.orden,
      notasCoach: e.notasCoach,
      notasTecnicas: e.notasTecnicas ?? null,
      rpeSugerido: e.rpePrescrito ?? null,
      descansoPrescritoSegundos: e.descansoPrescritoSegundos ?? 90,
      ejercicio: cat
        ? {
            id: cat.id,
            entrenadorId: cat.entrenadorId,
            nombre: cat.nombre,
            grupoMuscular: cat.grupoMuscular,
            patronMovimiento: cat.patronMovimiento,
            videoUrl: cat.videoUrl,
            activo: cat.activo,
            createdAtUtc: toIsoUtcString(cat.createdAtUtc)!,
          }
        : undefined,
      series: seriesMap.get(e.id) || [],
    };
  });

  return {
    id: sesion.id,
    alumnoId: sesion.alumnoId,
    rutinaId: sesion.rutinaId,
    bloqueId: sesion.bloqueId ?? null,
    esDiaDescansoOriginal: sesion.esDiaDescansoOriginal ?? false,
    fechaProgramada: sesion.fechaProgramada,
    fechaInicioUtc: toIsoUtcString(sesion.fechaInicioUtc),
    fechaFinUtc: toIsoUtcString(sesion.fechaFinUtc),
    timezoneCliente: sesion.timezoneCliente,
    estado: sesion.estado,
    motivoOmision: sesion.motivoOmision ?? null,
    porcentajeCumplimiento: sesion.porcentajeCumplimiento || '0.00',
    volumenTotalKg: (sesion as any).volumenTotalKg || '0.00',
    notasAlumno: sesion.notasAlumno,
    ejercicios: ejerciciosHydrated,
    alumnoNombre,
    duracionMinutos,
    cumpleReglaRacha,
    createdAtUtc: toIsoUtcString(sesion.createdAtUtc)!,
    updatedAtUtc: toIsoUtcString(sesion.updatedAtUtc)!,
  };
}
