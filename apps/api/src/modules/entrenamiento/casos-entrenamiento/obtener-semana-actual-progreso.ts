import { and, asc, desc, eq, gte, lte } from '@guachafit/database';
import { perfilesAlumno, rutinas, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion, MotivoOmision } from '@guachafit/shared';
import type {
  BloqueDiaRutinaDTO,
  BloqueSemanaProgresoDTO,
  SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';
import { calcularRangoSemanaIso, obtenerDiaSugeridoBloque } from '../../../common/adherencia.util';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { calcularRachaEfectiva, toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 3. RUTINA SEMANAL — progreso de la semana actual
// (Movido sin cambios desde `EntrenamientoService.obtenerSemanaActualProgreso`.)
// ---------------------------------------------------------------------------

/**
 * Consulta de progreso semanal de la rutina activa del alumno (Lunes a Domingo).
 * Determina qué bloques han sido completados en la semana ISO actual y sugiere el siguiente.
 * Incluye la racha efectiva del alumno (RN-02) y el estado/motivo de las sesiones OMITIDA.
 */
export async function obtenerSemanaActualProgreso(
  ctx: ContextoEntrenamiento,
  alumnoId: string,
  timezoneCliente?: string
): Promise<SemanaEntrenamientoProgresoDTO> {
  const { db, withTenant } = ctx;
  const tz = timezoneCliente || 'America/Caracas';
  let hoyStr: string;
  try {
    hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    hoyStr = new Date().toISOString().split('T')[0];
  }

  const { semanaIso, inicioSemana, finSemana, isoDay } = calcularRangoSemanaIso(hoyStr);

  // RN-02: racha efectiva del alumno (no depende de tener rutina activa).
  // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
  const [perfilAlumno] = await withTenant({ usuarioId: alumnoId }, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, alumnoId))
      .limit(1)
  );
  const rachaDias = calcularRachaEfectiva(
    perfilAlumno?.rachaDias ?? 0,
    perfilAlumno?.rachaUltimaFecha ?? null,
    hoyStr
  );

  // RNF-003/ADR-009: la rutina activa se lee con el GUC del alumno autenticado
  // (política self_select `alumno_id = current_usuario_id`).
  const [rutinaActiva] = await withTenant({ usuarioId: alumnoId }, async (tx) =>
    tx
      .select()
      .from(rutinas)
      .where(
        and(
          eq(rutinas.alumnoId, alumnoId),
          eq(rutinas.activa, true)
        )
      )
      .orderBy(desc(rutinas.createdAtUtc))
      .limit(1)
  );

  if (!rutinaActiva || !Array.isArray(rutinaActiva.bloques) || rutinaActiva.bloques.length === 0) {
    return {
      semanaIso,
      inicioSemana,
      finSemana,
      totalBloques: 0,
      bloquesCompletados: 0,
      porcentajeCumplimiento: '0.00',
      bloques: [],
      siguienteBloqueSugeridoId: null,
      esDiaDescansoHoy: true,
      rachaDias,
    };
  }

  const bloques = rutinaActiva.bloques as BloqueDiaRutinaDTO[];

  // Sesiones registradas en la ventana semanal actual
  const sesionesSemana = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(
      and(
        eq(sesionesEntrenamiento.alumnoId, alumnoId),
        gte(sesionesEntrenamiento.fechaProgramada, inicioSemana),
        lte(sesionesEntrenamiento.fechaProgramada, finSemana)
      )
    )
    .orderBy(asc(sesionesEntrenamiento.fechaProgramada), asc(sesionesEntrenamiento.createdAtUtc));

  // Determinar si hoy es día de descanso prescrito
  const bloquePrescritoParaHoy = bloques.find(
    (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
  );
  const esDiaDescansoHoy = !bloquePrescritoParaHoy;

  // Primer bloque pendiente en orden secuencial
  const primerBloquePendiente = bloques.find((b) => {
    const completado = sesionesSemana.some(
      (s) =>
        s.estado === EstadoSesion.COMPLETADA &&
        (s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id))
    );
    return !completado;
  });

  const siguienteBloqueSugeridoId = primerBloquePendiente ? primerBloquePendiente.diaId : null;

  const bloquesProgreso: BloqueSemanaProgresoDTO[] = bloques.map((b, idx) => {
    const diaSugerido = obtenerDiaSugeridoBloque(b, idx);
    const sesionesBloque = sesionesSemana.filter(
      (s) => s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id)
    );
    const sesionCompletada = sesionesBloque.find((s) => s.estado === EstadoSesion.COMPLETADA);
    // La sesión de hoy más reciente del bloque (puede ser OMITIDA o EN_PROGRESO tras repetir)
    const sesionHoyBloque = [...sesionesBloque]
      .reverse()
      .find((s) => s.fechaProgramada === hoyStr);
    const sesionRef =
      sesionCompletada || sesionHoyBloque || sesionesBloque[sesionesBloque.length - 1];

    return {
      bloqueId: b.diaId,
      titulo: b.titulo,
      enfoque: b.enfoque ?? null,
      diaSugerido,
      totalEjercicios: b.ejercicios?.length ?? 0,
      completado: !!sesionCompletada,
      fechaCompletadaUtc: sesionCompletada
        ? toIsoUtcString(sesionCompletada.fechaFinUtc || sesionCompletada.updatedAtUtc)
        : null,
      fechaProgramada: sesionRef ? sesionRef.fechaProgramada : null,
      sesionId: sesionRef ? sesionRef.id : null,
      esSugeridoHoy: b.diaId === siguienteBloqueSugeridoId,
      estadoSesion: sesionRef ? (sesionRef.estado as EstadoSesion) : null,
      motivoOmision: (sesionRef?.motivoOmision as MotivoOmision | null | undefined) ?? null,
    };
  });

  const bloquesCompletados = bloquesProgreso.filter((b) => b.completado).length;
  const porcentajeCumplimiento = ((bloquesCompletados / bloques.length) * 100).toFixed(2);

  return {
    semanaIso,
    inicioSemana,
    finSemana,
    totalBloques: bloques.length,
    bloquesCompletados,
    porcentajeCumplimiento,
    bloques: bloquesProgreso,
    siguienteBloqueSugeridoId,
    esDiaDescansoHoy,
    rachaDias,
  };
}
