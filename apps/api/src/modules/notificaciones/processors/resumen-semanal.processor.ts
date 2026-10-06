/**
 * Ola 3 (RF-014/RF-015 §B "Resumen Semanal"): worker de la cola `notificaciones-resumen-semanal`.
 *
 * Genera el digest semanal de CADA coach activo (adherencia de la ventana + cobros/por vencer) y
 * publica un `ResumenSemanalCoachEvent` por coach; el despachador lo persiste In-App y lo encola
 * a Email solo si `digest_weekly_email` está activo (matriz RF-015 §B).
 *
 * Decisiones:
 * - Ventana: últimos 7 días UTC ([ahora - 7d, ahora]). Deliberadamente SIN huso por coach: el
 *   recordatorio antropométrico por huso IANA queda fuera del alcance de N1 (pendiente anotado).
 * - RF-002 §6 (WU RF-002a): además de adherencia y cobros, el digest alerta los días CERRADOS
 *   sin check-in nutricional de la cartera. LOTE API-N2: cada alumno cuenta SUS últimos 7 días
 *   cerrados en la zona de su perfil, y un día cierra al vencer su plazo (12:00 del día siguiente).
 *   La matriz RF-015 no define una categoría NUTRICION: la alerta viaja por la fila "Resumen
 *   Semanal" (Email/Push según preferencia) y la copia In-App universal del despachador, sin
 *   inventar categorías fuera del doc.
 * - Consultas en lote (una por métrica, no por coach) con agregación en memoria; las tablas
 *   financieras ya tienen RLS (etapa 2) y se leen con el bypass explícito `is_superadmin`, el
 *   mismo criterio de ruta de sistema que el barrido de cobranza.
 * - Un fallo al despachar un coach NO cancela el digest de los demás.
 */
import { Inject, Logger, Optional } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
import { DRIZZLE_DB, WITH_TENANT } from '../../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
  and,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  sum,
  checkinsNutricionales,
  cuotasMembresia,
  perfilesAlumno,
  perfilesEntrenador,
  sesionesEntrenamiento,
  transaccionesPago,
  usuarios,
} from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  EstadoLicencia,
  EstadoSesion,
  EstadoUsuario,
} from '@guachafit/shared';
// RF-002 §6: el cálculo de "no reportado" es puro y vive con las reglas de tiempo de nutrición
// (`nutricion-tiempo.util.ts`); no se re-implementa aquí.
import { sumarDiasCalendario } from '../../../common/adherencia.util';
import {
  contarDiasNoReportados,
  ultimoDiaNutricionalCerrado,
} from '../../nutricion/nutricion-tiempo.util';
import { ResumenSemanalCoachEvent } from '../events/eventos-notificacion';
import { COLA_RESUMEN_SEMANAL, nombreColaDlq } from '../notificaciones.config';
import { JOB_GENERAR_RESUMEN_SEMANAL } from '../resumen-semanal.scheduler';
import { moverJobADeadLetter } from '../dead-letter';

export const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** RF-002 §6: días cerrados que revisa la alerta de "no reportado" del digest semanal. */
const DIAS_VENTANA_NUTRICION = 7;

export interface MetricasResumenSemanal {
  coachNombre: string;
  alumnosActivos: number;
  sesionesCompletadas: number;
  sesionesProgramadas: number;
  cobradoUsd: string;
  cuotasPorVencer: number;
  cuotasEnMora: number;
  /**
   * RF-002 §6 (WU RF-002a): días CERRADOS de la ventana sin check-in nutricional en toda la
   * cartera del coach. La alerta viaja en el digest semanal (RF-015 §B "Resumen Semanal"; la
   * matriz no tiene una categoría NUTRICION propia, así que se reutiliza la fila del digest
   * — Email/Push según preferencia — y la copia In-App universal del despachador).
   */
  nutricionDiasNoReportados: number;
}

export interface ResultadoResumenSemanal {
  coaches: number;
  despachados: number;
}

/** Compositor PURO del cuerpo del digest (testeable sin DB). */
export function construirCuerpoResumenSemanal(metricas: MetricasResumenSemanal): string {
  const adherencia =
    metricas.sesionesProgramadas > 0
      ? `${metricas.sesionesCompletadas} de ${metricas.sesionesProgramadas} sesiones completadas (${Math.round(
          (metricas.sesionesCompletadas / metricas.sesionesProgramadas) * 100
        )}%)`
      : `${metricas.sesionesCompletadas} sesiones completadas (sin sesiones programadas esta semana)`;

  const alertaNutricion =
    metricas.nutricionDiasNoReportados > 0
      ? ` Atención: ${metricas.nutricionDiasNoReportados} día(s) de tu alumnado quedaron sin reporte nutricional.`
      : '';

  return (
    `Hola ${metricas.coachNombre}, tu semana en GUACHAFIT: ${adherencia}, ` +
    `$${metricas.cobradoUsd} USD cobrados, ${metricas.cuotasPorVencer} cuota(s) por vencer ` +
    `y ${metricas.cuotasEnMora} en mora.${alertaNutricion}`
  );
}

@Processor(COLA_RESUMEN_SEMANAL)
export class ResumenSemanalProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumenSemanalProcessor.name);

  /**
   * RNF-003/ADR-011 (etapa 2): RUTA DE SISTEMA. El digest agrega cobros/cuotas de TODOS los
   * tenants; las lecturas sobre tablas con RLS corren con el bypass explícito `is_superadmin`.
   */
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(nombreColaDlq(COLA_RESUMEN_SEMANAL)) private readonly dlq: Queue,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    super();
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
  }

  async process(job: Job): Promise<ResultadoResumenSemanal | { procesado: false }> {
    if (job.name !== JOB_GENERAR_RESUMEN_SEMANAL) {
      this.logger.warn(`Job desconocido '${job.name}' en la cola ${COLA_RESUMEN_SEMANAL}; ignorado.`);
      return { procesado: false };
    }
    return this.generarYDespachar();
  }

  /** Genera el digest de todos los coaches activos y emite un evento por coach. */
  async generarYDespachar(ahora: Date = new Date()): Promise<ResultadoResumenSemanal> {
    const desdeUtc = new Date(ahora.getTime() - 7 * MS_POR_DIA);

    const coaches = await this.db
      .select({
        usuarioId: perfilesEntrenador.usuarioId,
        nombres: perfilesEntrenador.nombres,
        apellidos: perfilesEntrenador.apellidos,
        nombreComercial: perfilesEntrenador.nombreComercial,
      })
      .from(perfilesEntrenador)
      .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
      .where(
        and(
          eq(usuarios.estado, EstadoUsuario.ACTIVO),
          eq(perfilesEntrenador.estadoLicencia, EstadoLicencia.ACTIVA)
        )
      );

    if (coaches.length === 0) {
      return { coaches: 0, despachados: 0 };
    }

    const coachIds = coaches.map((c) => c.usuarioId);

    // Alumnos ACTIVOS por coach (la cartera viva del digest).
    // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; ruta de sistema con el bypass
    // explícito `is_superadmin` (el digest agrega la cartera de TODOS los tenants).
    const alumnos = await this.withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .select({
          usuarioId: perfilesAlumno.usuarioId,
          entrenadorId: perfilesAlumno.entrenadorId,
          zonaHoraria: perfilesAlumno.zonaHoraria,
        })
        .from(perfilesAlumno)
        .where(
          and(
            inArray(perfilesAlumno.entrenadorId, coachIds),
            eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
            isNull(perfilesAlumno.deletedAtUtc)
          )
        )
    );

    const coachPorAlumno = new Map<string, string>();
    const alumnosActivosPorCoach = new Map<string, number>();
    for (const alumno of alumnos) {
      coachPorAlumno.set(alumno.usuarioId, alumno.entrenadorId);
      alumnosActivosPorCoach.set(
        alumno.entrenadorId,
        (alumnosActivosPorCoach.get(alumno.entrenadorId) ?? 0) + 1
      );
    }

    const alumnoIds = alumnos.map((a) => a.usuarioId);
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
    for (const alumno of alumnos) {
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
      const completadas = await this.db
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

      const programadas = await this.db
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
      const checkinsNutricionalesVentana = await this.db
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
    const { cobros, cuotas } = await this.withTenant({ isSuperadmin: true }, async (tx) => {
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

    // Emisión del evento por coach: un fallo puntual no cancela el resto del digest.
    let despachados = 0;
    const referenciaSemana = `semana_${hastaYmd}`;

    for (const coach of coaches) {
      const coachNombre =
        coach.nombreComercial || `${coach.nombres} ${coach.apellidos}`.trim();

      const metricas: MetricasResumenSemanal = {
        coachNombre,
        alumnosActivos: alumnosActivosPorCoach.get(coach.usuarioId) ?? 0,
        sesionesCompletadas: sesionesCompletadasPorCoach.get(coach.usuarioId) ?? 0,
        sesionesProgramadas: sesionesProgramadasPorCoach.get(coach.usuarioId) ?? 0,
        cobradoUsd: cobradoPorCoach.get(coach.usuarioId) ?? '0.00',
        cuotasPorVencer: porVencerPorCoach.get(coach.usuarioId) ?? 0,
        cuotasEnMora: enMoraPorCoach.get(coach.usuarioId) ?? 0,
        nutricionDiasNoReportados: nutricionNoReportadosPorCoach.get(coach.usuarioId) ?? 0,
      };

      try {
        await this.eventEmitter.emitAsync(
          ResumenSemanalCoachEvent.NOMBRE,
          new ResumenSemanalCoachEvent({
            tipoEvento: 'RESUMEN_SEMANAL_COACH',
            destinatarioUserId: coach.usuarioId,
            entrenadorId: coach.usuarioId,
            categoria: 'RESUMEN_SEMANAL',
            titulo: 'Tu resumen semanal GUACHAFIT',
            cuerpo: construirCuerpoResumenSemanal(metricas),
            linkAccion: '/coach',
            datosAdicionales: {
              semana: hastaYmd,
              alumnosActivos: metricas.alumnosActivos,
              sesionesCompletadas: metricas.sesionesCompletadas,
              sesionesProgramadas: metricas.sesionesProgramadas,
              cobradoUsd: metricas.cobradoUsd,
              cuotasPorVencer: metricas.cuotasPorVencer,
              cuotasEnMora: metricas.cuotasEnMora,
              nutricionDiasNoReportados: metricas.nutricionDiasNoReportados,
            },
            esCriticoSeguridad: false,
            // RNF-004 §3: ref de origen del jobId determinista (semana del digest).
            referenciaId: referenciaSemana,
          })
        );
        despachados += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo despachar el resumen semanal del coach ${coach.usuarioId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.logger.log(
      `Resumen semanal generado: ${despachados}/${coaches.length} coaches despachados (ventana ${desdeYmd}..${hastaYmd}).`
    );

    return { coaches: coaches.length, despachados };
  }

  /** RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    await moverJobADeadLetter(this.dlq, COLA_RESUMEN_SEMANAL, job, error);
  }
}
