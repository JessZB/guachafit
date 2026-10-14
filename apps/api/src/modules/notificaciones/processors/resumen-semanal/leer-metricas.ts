import {
  and,
  count,
  eq,
  gt,
  gte,
  inArray,
  lte,
  sum,
  checkinsNutricionales,
  cuotasMembresia,
  sesionesEntrenamiento,
  transaccionesPago,
} from '@guachafit/database';
import { EstadoConciliacion, EstadoCuota, EstadoSesion } from '@guachafit/shared';
import { sumarDiasCalendario } from '../../../../common/adherencia.util';
import {
  contarDiasNoReportados,
  ultimoDiaNutricionalCerrado,
} from '../../../nutricion/nutricion-tiempo.util';
import type { ContextoResumenSemanal } from './contexto-resumen-semanal';
import type { CarteraDigest } from './leer-cartera';

/** RF-002 §6: días cerrados que revisa la alerta de "no reportado" del digest semanal. */
const DIAS_VENTANA_NUTRICION = 7;

export interface MetricasDigest {
  desdeYmd: string;
  hastaYmd: string;
  sesionesCompletadasPorCoach: Map<string, number>;
  sesionesProgramadasPorCoach: Map<string, number>;
  nutricionNoReportadosPorCoach: Map<string, number>;
  cobradoPorCoach: Map<string, string>;
  porVencerPorCoach: Map<string, number>;
  enMoraPorCoach: Map<string, number>;
}

/**
 * Lee las métricas del digest en lote (una consulta por métrica, no por coach)
 * y las agrega en memoria por coach.
 */
export async function leerMetricasDigest(
  ctx: Pick<ContextoResumenSemanal, 'db' | 'withTenant'>,
  cartera: CarteraDigest,
  ahora: Date,
  desdeUtc: Date
): Promise<MetricasDigest> {
  const { coachPorAlumno } = cartera;
  const alumnoIds = cartera.alumnos.map((a) => a.usuarioId);
  const desdeYmd = desdeUtc.toISOString().slice(0, 10);
  const hastaYmd = ahora.toISOString().slice(0, 10);

  // Adherencia: sesiones COMPLETADAS en la ventana y sesiones PROGRAMADAS en la ventana.
  const completadasPorAlumno = new Map<string, number>();
  const programadasPorAlumno = new Map<string, number>();

  // RF-002 §6: fechas con check-in por alumno para el cálculo de "no reportado".
  const fechasReportadasPorAlumno = new Map<string, Set<string>>();
  // LOTE API-N2: rango de días CERRADOS por alumno en la zona de su perfil (7 días que terminan
  // en el último día cuyo plazo de las 12:00 del día siguiente ya venció).
  const rangoNutricionPorAlumno = new Map<string, { desde: string; hasta: string }>();
  for (const alumno of cartera.alumnos) {
    const hasta = ultimoDiaNutricionalCerrado(ahora, alumno.zonaHoraria);
    rangoNutricionPorAlumno.set(alumno.usuarioId, {
      desde: sumarDiasCalendario(hasta, -(DIAS_VENTANA_NUTRICION - 1)),
      hasta,
    });
  }
  // Una sola consulta para toda la cartera: la unión de los rangos (el filtro fino es por alumno).
  // Neutros explícitos del mínimo y del máximo: la consulta solo corre con al menos un alumno, así
  // que siempre quedan reemplazados por fechas reales.
  const FECHA_NEUTRA_MINIMO = '9999-12-31';
  const FECHA_NEUTRA_MAXIMO = '0000-01-01';
  let desdeNutricionYmd = FECHA_NEUTRA_MINIMO;
  let hastaNutricionYmd = FECHA_NEUTRA_MAXIMO;
  for (const rango of rangoNutricionPorAlumno.values()) {
    if (rango.desde < desdeNutricionYmd) desdeNutricionYmd = rango.desde;
    if (rango.hasta > hastaNutricionYmd) hastaNutricionYmd = rango.hasta;
  }

  if (alumnoIds.length > 0) {
    const completadas = await ctx.db
      .select({ alumnoId: sesionesEntrenamiento.alumnoId, total: count() })
      .from(sesionesEntrenamiento)
      .where(
        and(
          inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
          eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
          gte(sesionesEntrenamiento.fechaFinUtc, desdeUtc),
          lte(sesionesEntrenamiento.fechaFinUtc, ahora)
        )
      )
      .groupBy(sesionesEntrenamiento.alumnoId);

    for (const fila of completadas) {
      completadasPorAlumno.set(fila.alumnoId, Number(fila.total));
    }

    const programadas = await ctx.db
      .select({ alumnoId: sesionesEntrenamiento.alumnoId, total: count() })
      .from(sesionesEntrenamiento)
      .where(
        and(
          inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
          gte(sesionesEntrenamiento.fechaProgramada, desdeYmd),
          lte(sesionesEntrenamiento.fechaProgramada, hastaYmd)
        )
      )
      .groupBy(sesionesEntrenamiento.alumnoId);

    for (const fila of programadas) {
      programadasPorAlumno.set(fila.alumnoId, Number(fila.total));
    }

    // RF-002 §6: check-ins de los días CERRADOS de la ventana (unión de los rangos por alumno).
    // Hoy, y ayer antes de las 12:00 locales, quedan fuera: todavía pueden llegar reportes.
    const checkinsNutricionalesVentana = await ctx.db
      .select({ alumnoId: checkinsNutricionales.alumnoId, fecha: checkinsNutricionales.fecha })
      .from(checkinsNutricionales)
      .where(
        and(
          inArray(checkinsNutricionales.alumnoId, alumnoIds),
          gte(checkinsNutricionales.fecha, desdeNutricionYmd),
          lte(checkinsNutricionales.fecha, hastaNutricionYmd)
        )
      );

    for (const fila of checkinsNutricionalesVentana) {
      if (!fechasReportadasPorAlumno.has(fila.alumnoId)) {
        fechasReportadasPorAlumno.set(fila.alumnoId, new Set());
      }
      fechasReportadasPorAlumno.get(fila.alumnoId)!.add(fila.fecha);
    }
  }

  const sesionesCompletadasPorCoach = new Map<string, number>();
  const sesionesProgramadasPorCoach = new Map<string, number>();
  for (const [alumnoId, entrenadorId] of coachPorAlumno) {
    sesionesCompletadasPorCoach.set(
      entrenadorId,
      (sesionesCompletadasPorCoach.get(entrenadorId) ?? 0) + (completadasPorAlumno.get(alumnoId) ?? 0)
    );
    sesionesProgramadasPorCoach.set(
      entrenadorId,
      (sesionesProgramadasPorCoach.get(entrenadorId) ?? 0) + (programadasPorAlumno.get(alumnoId) ?? 0)
    );
  }

  // RF-002 §6: días cerrados sin reporte por coach (alerta del resumen semanal).
  const nutricionNoReportadosPorCoach = new Map<string, number>();
  for (const [alumnoId, entrenadorId] of coachPorAlumno) {
    // Ambos mapas salen de la misma lista `alumnos`: todo alumno de la cartera tiene su rango.
    const rango = rangoNutricionPorAlumno.get(alumnoId)!;
    const noReportados = contarDiasNoReportados(
      rango.desde,
      rango.hasta,
      fechasReportadasPorAlumno.get(alumnoId) ?? new Set()
    );
    if (noReportados > 0) {
      nutricionNoReportadosPorCoach.set(
        entrenadorId,
        (nutricionNoReportadosPorCoach.get(entrenadorId) ?? 0) + noReportados
      );
    }
  }

  // RNF-003/ADR-011 (etapa 2): cobros (transacciones_pago) y cartera (cuotas_membresia) tienen
  // RLS; ambas lecturas transversales van en UNA transacción con el bypass explícito de sistema.
  const coachIds = cartera.coaches.map((c) => c.usuarioId);
  const { cobros, cuotas } = await ctx.withTenant({ isSuperadmin: true }, async (tx) => {
    // Cobros de la ventana: pagos APROBADOS por fecha real de conciliación.
    const cobros = await tx
      .select({
        entrenadorId: transaccionesPago.entrenadorId,
        total: sum(transaccionesPago.montoEquivalenteUsd),
      })
      .from(transaccionesPago)
      .where(
        and(
          inArray(transaccionesPago.entrenadorId, coachIds),
          eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO),
          gte(transaccionesPago.fechaConciliacionUtc, desdeUtc),
          lte(transaccionesPago.fechaConciliacionUtc, ahora)
        )
      )
      .groupBy(transaccionesPago.entrenadorId);

    // Cartera: cuotas con saldo en POR_VENCER / VENCIDA por coach.
    const cuotas = await tx
      .select({
        entrenadorId: cuotasMembresia.entrenadorId,
        estado: cuotasMembresia.estado,
        total: count(),
      })
      .from(cuotasMembresia)
      .where(
        and(
          inArray(cuotasMembresia.entrenadorId, coachIds),
          gt(cuotasMembresia.saldoPendienteUsd, '0'),
          inArray(cuotasMembresia.estado, [EstadoCuota.POR_VENCER, EstadoCuota.VENCIDA])
        )
      )
      .groupBy(cuotasMembresia.entrenadorId, cuotasMembresia.estado);

    return { cobros, cuotas };
  });

  const cobradoPorCoach = new Map<string, string>();
  for (const fila of cobros) {
    cobradoPorCoach.set(fila.entrenadorId, fila.total ?? '0.00');
  }

  const porVencerPorCoach = new Map<string, number>();
  const enMoraPorCoach = new Map<string, number>();
  for (const fila of cuotas) {
    const destino = fila.estado === EstadoCuota.POR_VENCER ? porVencerPorCoach : enMoraPorCoach;
    destino.set(fila.entrenadorId, (destino.get(fila.entrenadorId) ?? 0) + Number(fila.total));
  }

  return {
    desdeYmd,
    hastaYmd,
    sesionesCompletadasPorCoach,
    sesionesProgramadasPorCoach,
    nutricionNoReportadosPorCoach,
    cobradoPorCoach,
    porVencerPorCoach,
    enMoraPorCoach,
  };
}
