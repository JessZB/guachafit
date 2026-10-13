import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, max } from '@guachafit/database';
import { perfilesAlumno, rutinas, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoAlumno, EstadoSesion, LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO, SemaforoAdherencia } from '@guachafit/shared';
import type {
  FiltroMonitorAdherenciaDTO,
  MonitorAdherenciaDTO,
  MonitorAdherenciaSemanalDTO,
  ResumenMonitorAdherenciaDTO,
} from '@guachafit/shared';
import {
  calcularVentanaSemana,
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
  evaluarAdherenciaSemanal,
  filtrarMonitorAdherencia,
  obtenerFechaLocalYyyyMmDd,
  ordenarMonitorPorNombre,
  ordenarMonitorPorRiesgo,
} from '../../../common/adherencia.util';
import type { ContextoEntrenamiento } from './contexto';
import { calcularRachaEfectiva, toIsoUtcString } from './reglas-racha';

// ---------------------------------------------------------------------------
// 7. MONITOR SEMANAL DE ADHERENCIA DEL COACH (RN-03)
// (Movido sin cambios desde `EntrenamientoService.calcularSemanaAdherencia`.)
// ---------------------------------------------------------------------------

/**
 * Monitor semanal de adherencia del coach (RF-001 RN-03 / Escenario 4):
 *
 * - Ventana: semana en curso desde el Lunes 00:00 local hasta "ahora". La zona del coach llega
 *   como `timezone` (default UTC, validada con Intl); el Lunes 00:00 se convierte al instante UTC
 *   exacto para consultar por `fecha_fin_utc`. Los timestamps del DTO se exponen en UTC.
 * - `sesionesPrescritas` se deriva de los bloques de la rutina ACTIVA del alumno que ya debieron
 *   ejecutarse (día sugerido <= día ISO de hoy). Las sesiones materializadas sólo aportan lo
 *   completado (estado COMPLETADA con `fecha_fin_utc` dentro de la ventana).
 * - `tienePlanActivo` permite a la UI distinguir "sin plan" de un ROJO 0/0 engañoso.
 * - `alumnoPerfilId` expone `perfiles_alumno.id` (el `GET /alumnos/:id` espera ese ID) para que
 *   la UI pueda enlazar al expediente; `alumnoId` sigue siendo el `usuarios.id` de sesiones/rutinas.
 * - `diasInactivo`/`ultimaSesionUtc` salen de la ÚLTIMA sesión completada real del alumno
 *   (consulta agregada `MAX(fecha_fin_utc) GROUP BY alumno`, una fila por alumno). Un alumno
 *   sin ninguna sesión completada mantiene `null` + `7` (default RN-03), sin inventar fechas.
 * - Rendimiento: 4 consultas en lote independientes del número de alumnos (sin N+1). El cálculo
 *   completo sigue siendo EN MEMORIA del coach (agregados en lote); el `limit`/`offset` son un
 *   slice de PRESENTACIÓN que se aplica DESPUÉS de ordenar, y `resumen` describe la cartera
 *   completa (no la página) para los chips/filtros globales de la UI.
 * - Orden por nivel de riesgo (ROJO al tope) o por nombre (`orden=nombre`) y racha efectiva
 *   RN-02 (WU1). WU24: envelope `{ items, total, limit, offset, resumen }`.
 * - WU25a: `filtro.q` (nombre, case/acento-insensible y literal) y `filtro.semaforo`
 *   (rojo|amarillo|verde|sinPlan|sinPendientes) se aplican ANTES del slice; `resumen` sigue
 *   describiendo la cartera completa (los filtros solo recortan `items`/`total`).
 * - WU26: `filtro.orden` (`riesgo` default | `nombre`) también se aplica ANTES del slice.
 *   Ambos órdenes desempatan por `alumnoId`, así que la página por offset es determinista
 *   aunque la query base no tenga ORDER BY (el sort en JS es total y estable).
 */
export async function calcularSemanaAdherencia(
  ctx: ContextoEntrenamiento,
  entrenadorId: string,
  timezone?: string,
  limit = LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
  offset = 0,
  filtro?: FiltroMonitorAdherenciaDTO
): Promise<MonitorAdherenciaDTO> {
  const { db, withTenant } = ctx;
  // 1. Obtener alumnos activos del entrenador.
  // D10: "activos" es literal: se excluyen los perfiles pausados/suspendidos, no solo los
  // soft-deleted. Un alumno pausado no debe aparecer en el monitor de adherencia.
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
  const alumnos = await withTenant({ entrenadorId }, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      )
  );

  if (alumnos.length === 0) {
    return {
      items: [],
      total: 0,
      limit,
      offset,
      resumen: { rojo: 0, amarillo: 0, verde: 0, sinPlan: 0, sinPendientes: 0, total: 0 },
    };
  }

  const ventana = calcularVentanaSemana(new Date(), timezone);
  const alumnoIds = alumnos.map((a) => a.usuarioId);

  // 2. Rutinas activas de todos los alumnos (en lote) -> bloques prescritos por alumno.
  // RNF-003/ADR-009: lectura tenant-scoped con el GUC del coach (withTenant).
  const rutinasActivas = await withTenant({ entrenadorId }, async (tx) =>
    tx
      .select()
      .from(rutinas)
      .where(and(inArray(rutinas.alumnoId, alumnoIds), eq(rutinas.activa, true)))
      .orderBy(desc(rutinas.createdAtUtc))
  );

  const rutinaPorAlumno = new Map<string, (typeof rutinasActivas)[number]>();
  for (const rutina of rutinasActivas) {
    if (!rutinaPorAlumno.has(rutina.alumnoId)) {
      rutinaPorAlumno.set(rutina.alumnoId, rutina);
    }
  }

  // 3. Sesiones materializadas COMPLETADAS dentro de la ventana (en lote).
  const sesionesVentana = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(
      and(
        inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
        eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
        gte(sesionesEntrenamiento.fechaFinUtc, ventana.inicioSemanaUtc),
        lte(sesionesEntrenamiento.fechaFinUtc, ventana.ahoraUtc)
      )
    );

  const completadasPorAlumno = new Map<string, number>();
  for (const sesion of sesionesVentana) {
    completadasPorAlumno.set(
      sesion.alumnoId,
      (completadasPorAlumno.get(sesion.alumnoId) ?? 0) + 1
    );
  }

  // 4. Última sesión completada REAL por alumno (en lote). WU23: una consulta agregada
  //    `MAX(fecha_fin_utc) GROUP BY alumno_id` devuelve una fila por alumno (jamás el
  //    histórico en crudo) con la última sesión real, aunque sea más antigua que la ventana
  //    de 30 días de WU19. Antes, un alumno con historial viejo quedaba en `diasInactivo = 7`
  //    (default) y `ultimaSesionUtc = null`, y la UI lo mostraba como inactividad falsa.
  const ultimasSesiones = await db
    .select({
      alumnoId: sesionesEntrenamiento.alumnoId,
      ultimaSesionUtc: max(sesionesEntrenamiento.fechaFinUtc),
    })
    .from(sesionesEntrenamiento)
    .where(
      and(
        inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
        eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
        isNotNull(sesionesEntrenamiento.fechaFinUtc)
      )
    )
    .groupBy(sesionesEntrenamiento.alumnoId);

  const ultimaPorAlumno = new Map<string, Date>();
  for (const fila of ultimasSesiones) {
    if (fila.alumnoId && fila.ultimaSesionUtc) {
      ultimaPorAlumno.set(fila.alumnoId, new Date(fila.ultimaSesionUtc));
    }
  }

  const resultados: MonitorAdherenciaSemanalDTO[] = [];

  for (const alumno of alumnos) {
    const rutina = rutinaPorAlumno.get(alumno.usuarioId);
    const bloques = rutina?.bloques ?? [];
    const tienePlanActivo = Array.isArray(bloques) && bloques.length > 0;

    const sesionesPrescritas = tienePlanActivo
      ? contarBloquesPrescritosHasta(bloques, ventana.isoDayHoy)
      : 0;
    const sesionesCompletadas = completadasPorAlumno.get(alumno.usuarioId) ?? 0;

    let diasInactivo = 7; // Inactividad máxima por defecto si nunca ha entrenado
    let ultimaSesionUtc: string | null = null;

    const ultimaFechaSesion = ultimaPorAlumno.get(alumno.usuarioId);
    if (ultimaFechaSesion) {
      ultimaSesionUtc = toIsoUtcString(ultimaFechaSesion);
      const fechaLocalUltima = obtenerFechaLocalYyyyMmDd(ultimaFechaSesion, timezone);
      diasInactivo = diferenciaDiasCalendario(fechaLocalUltima, ventana.hoyLocal);
    }

    const adherencia = evaluarAdherenciaSemanal(
      sesionesPrescritas,
      sesionesCompletadas,
      diasInactivo
    );

    // RN-02: racha efectiva persistida (si la cadena está rota por gap, se muestra 0).
    const rachaDiasConsecutivos = calcularRachaEfectiva(
      alumno.rachaDias ?? 0,
      alumno.rachaUltimaFecha ?? null,
      ventana.hoyLocal
    );

    resultados.push({
      alumnoId: alumno.usuarioId,
      alumnoPerfilId: alumno.id,
      nombreCompleto: `${alumno.nombres} ${alumno.apellidos}`.trim(),
      sesionesPrescritas,
      sesionesCompletadas,
      porcentajeCumplimientoSemanal: adherencia.porcentajeCumplimientoSemanal,
      semaforoAdherencia: adherencia.semaforoAdherencia,
      tienePlanActivo,
      // D6 (aditivo): plan activo sin bloques vencidos aún => la UI lo muestra neutral,
      // nunca ROJO 0/0 a inicio de semana.
      sinPendientesSemana: tienePlanActivo && sesionesPrescritas === 0,
      rachaDiasConsecutivos,
      diasInactivo,
      ultimaSesionUtc,
    });
  }

  // WU24: contadores de TODA la cartera (no de la página ni del filtro), con la misma semántica
  // que los filtros de la UI: un 0/0 con plan pero sin pendientes no cuenta como ROJO (D6).
  const resumen: ResumenMonitorAdherenciaDTO = {
    rojo: resultados.filter(
      (a) => a.tienePlanActivo && !a.sinPendientesSemana && a.semaforoAdherencia === SemaforoAdherencia.ROJO
    ).length,
    amarillo: resultados.filter(
      (a) => a.tienePlanActivo && a.semaforoAdherencia === SemaforoAdherencia.AMARILLO
    ).length,
    verde: resultados.filter(
      (a) => a.tienePlanActivo && a.semaforoAdherencia === SemaforoAdherencia.VERDE
    ).length,
    sinPlan: resultados.filter((a) => !a.tienePlanActivo).length,
    sinPendientes: resultados.filter((a) => a.tienePlanActivo && a.sinPendientesSemana).length,
    total: resultados.length,
  };

  // WU25a/WU26: los filtros recortan la lista ANTES del slice (el resumen ya es de la cartera
  // completa) y el orden pedido (`riesgo` default ROJO->AMARILLO->VERDE, o `nombre` A–Z)
  // también se aplica antes del slice. Ambos comparadores son totales (desempate por
  // `alumnoId`), así que la paginación por offset no repite ni salta filas entre páginas.
  const filtrados = filtrarMonitorAdherencia(resultados, filtro);
  const ordenados =
    filtro?.orden === 'nombre'
      ? ordenarMonitorPorNombre(filtrados)
      : ordenarMonitorPorRiesgo(filtrados);

  // Slice de PRESENTACIÓN posterior al orden: offset avanza sin repetir ni saltar filas.
  return {
    items: ordenados.slice(offset, offset + limit),
    total: ordenados.length,
    limit,
    offset,
    resumen,
  };
}
