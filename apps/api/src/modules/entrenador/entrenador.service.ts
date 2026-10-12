import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  eq,
  and,
  lte,
  isNull,
  inArray,
  desc,
  gte,
  ne,
  perfilesEntrenador,
  perfilesAlumno,
  transaccionesPago,
  cuotasMembresia,
  controlesAntropometricos,
  sesionesEntrenamiento,
  rutinas,
} from '@guachafit/database';
import {
  BloqueDiaRutinaDTO,
  DashboardComandoDTO,
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  EstadoMedicion,
  EstadoSesion,
  PerfilEntrenadorDTO,
  SemaforoAdherencia,
} from '@guachafit/shared';
import {
  calcularDiasAtraso,
  calcularRecaudadoMesUsd,
  calcularVentanaMesUtc,
  condicionCuotaEnMora,
} from '../../common/cartera.util';
import {
  calcularVentanaSemana,
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
  evaluarAdherenciaSemanal,
  obtenerFechaLocalYyyyMmDd,
} from '../../common/adherencia.util';

/**
 * Ventana del mes calendario en UTC para los KPIs financieros del dashboard (RF-013).
 *
 * Definida en `common/cartera.util` (WU-I) para que el dashboard y el tablero de cartera usen
 * EXACTAMENTE el mismo criterio; se re-exporta aquí por compatibilidad con los consumidores
 * históricos (`rf013-dashboard-comando.spec.ts`).
 */
export { calcularVentanaMesUtc };

@Injectable()
export class EntrenadorService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RNF-003/ADR-009: consultas a tablas con RLS (hoy `rutinas`) corren con GUC.
    @Inject(WITH_TENANT) private readonly withTenant: WithTenantFn
  ) {}

  /**
   * Perfil operativo del entrenador autenticado (WU-E / RF-011 RN-06).
   * Es la fuente REAL del `coachCode` para el enlace único de captación del coach; el cliente
   * nunca debe inventar ni hardcodear este valor. Solo devuelve datos propios del solicitante.
   */
  async obtenerPerfil(usuarioId: string): Promise<PerfilEntrenadorDTO> {
    const [coach] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, usuarioId));

    if (!coach) {
      throw new NotFoundException('Perfil de entrenador no encontrado.');
    }

    return {
      id: coach.id,
      usuarioId: coach.usuarioId,
      nombres: coach.nombres,
      apellidos: coach.apellidos,
      nombreComercial: coach.nombreComercial,
      coachCode: coach.coachCode,
      estadoLicencia: coach.estadoLicencia,
      capacidadMaxima: coach.capacidadMaxima,
      telefonoContacto: coach.telefonoContacto,
    };
  }

  /**
   * Genera el payload consolidado del Dashboard de Comando Central del Entrenador (RF-013)
   */
  async obtenerDashboardComando(coachId: string): Promise<DashboardComandoDTO> {
    const now = new Date();
    const { periodoActual, inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(now);

    // 1. Capacidad Máxima del Entrenador
    const [coachProfile] = await this.db
      .select({
        capacidadMaxima: perfilesEntrenador.capacidadMaxima,
      })
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, coachId));

    const capacidadMaxima = coachProfile?.capacidadMaxima ?? 50;

    // 2. Alumnos de su cartera.
    // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
    const alumnos = await this.withTenant({ entrenadorId: coachId }, (tx) =>
      tx
        .select({
          id: perfilesAlumno.id,
          usuarioId: perfilesAlumno.usuarioId,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          estadoActivacion: perfilesAlumno.estadoActivacion,
          createdAtUtc: perfilesAlumno.createdAtUtc,
        })
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.entrenadorId, coachId),
            isNull(perfilesAlumno.deletedAtUtc)
          )
        )
    );

    const alumnosActivos = alumnos.filter(
      (a) => a.estadoActivacion === EstadoAlumno.ACTIVO
    ).length;

    const porcentajeOcupacion =
      capacidadMaxima > 0
        ? ((alumnosActivos / capacidadMaxima) * 100).toFixed(2)
        : '0.00';

    // 3. Métricas Financieras (Cobranza Mes y Meta)
    //    "Cobros del Mes" = SOLO pagos aprobados del mes en curso (UTC), con la fecha real de
    //    entrada del dinero. La suma vive en `common/cartera.util` para que el tablero de
    //    cartera (RF-009 KPI-01) y este dashboard no divergan.
    //
    //    RNF-003/ADR-011 (etapa 2): `transacciones_pago` y `cuotas_membresia` tienen RLS; las
    //    cuatro lecturas financieras del dashboard se agrupan en UNA transacción con el GUC del
    //    coach (no se multiplican transacciones por consulta).
    const ventanaMes = { inicioMesUtc, inicioMesSiguienteUtc };
    const { cobranzaMesUsd, cuotasPeriodo, pagosPorConciliar, cuotasMora } =
      await this.withTenant({ entrenadorId: coachId }, async (tx) => {
        const [cobranzaMesUsd, cuotasPeriodo, pagosPendientes, cuotasMora] = await Promise.all([
          calcularRecaudadoMesUsd(tx, coachId, ventanaMes),
          tx
            .select({
              montoTotalUsd: cuotasMembresia.montoTotalUsd,
            })
            .from(cuotasMembresia)
            .where(
              and(
                eq(cuotasMembresia.entrenadorId, coachId),
                eq(cuotasMembresia.periodo, periodoActual),
                // RF-008: una cuota anulada no se cobra, no suma a la meta del mes.
                ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
              )
            ),
          tx
            .select({ id: transaccionesPago.id })
            .from(transaccionesPago)
            .where(
              and(
                eq(transaccionesPago.entrenadorId, coachId),
                eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
              )
            ),
          tx
            .select({
              id: cuotasMembresia.id,
              clienteId: cuotasMembresia.clienteId,
              saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
              fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
              estado: cuotasMembresia.estado,
            })
            .from(cuotasMembresia)
            .where(
              and(eq(cuotasMembresia.entrenadorId, coachId), condicionCuotaEnMora(now))
            ),
        ]);

        return {
          cobranzaMesUsd,
          cuotasPeriodo,
          pagosPorConciliar: pagosPendientes.length,
          cuotasMora,
        };
      });

    const totalMetaUsd = cuotasPeriodo.reduce(
      (acc, c) => acc + Number(c.montoTotalUsd || 0),
      0
    );
    // §6 honestidad de presentación: la meta SOLO existe si hay cuotas emitidas del periodo que
    // la respalden. Sin meta real no se inventa un valor (antes: `alumnos * 35` o 2500 USD) y el
    // cliente muestra "Sin meta de cobranza configurada"; el porcentaje tampoco se calcula.
    const metaCobranzaMesUsd = totalMetaUsd > 0 ? totalMetaUsd.toFixed(2) : null;

    const porcentajeCobranza =
      metaCobranzaMesUsd !== null
        ? ((Number(cobranzaMesUsd) / Number(metaCobranzaMesUsd)) * 100).toFixed(2)
        : null;

    // 4. Adherencia Semanal (RF-001 RN-03) — misma semántica que el monitor del coach.
    //    Ventana: Lunes 00:00 local (default UTC) -> ahora; prescritas = bloques de la rutina
    //    activa ya debidos; completadas = sesiones materializadas COMPLETADAS en la ventana.
    const alumnosUserIds = alumnos.map((a) => a.usuarioId);
    const ventana = calcularVentanaSemana(now);

    let rutinasActivas: Array<{
      alumnoId: string;
      bloques: unknown;
      createdAtUtc: Date | string;
    }> = [];
    let sesionesCompletadasVentana: Array<{ alumnoId: string }> = [];
    let ultimasSesiones: Array<{
      alumnoId: string;
      fechaProgramada: string;
      fechaFinUtc: Date | string | null;
    }> = [];

    if (alumnosUserIds.length > 0) {
      // 4.1 Rutinas activas del lote de alumnos (sin N+1).
      // RNF-003/ADR-009: `rutinas` tiene RLS; la lectura corre con el GUC del coach.
      rutinasActivas = await this.withTenant({ entrenadorId: coachId }, async (tx) =>
        tx
          .select({
            alumnoId: rutinas.alumnoId,
            bloques: rutinas.bloques,
            createdAtUtc: rutinas.createdAtUtc,
          })
          .from(rutinas)
          .where(and(inArray(rutinas.alumnoId, alumnosUserIds), eq(rutinas.activa, true)))
          .orderBy(desc(rutinas.createdAtUtc))
      );

      // 4.2 Sesiones completadas dentro de la ventana semanal
      sesionesCompletadasVentana = await this.db
        .select({ alumnoId: sesionesEntrenamiento.alumnoId })
        .from(sesionesEntrenamiento)
        .where(
          and(
            inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
            eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
            gte(sesionesEntrenamiento.fechaFinUtc, ventana.inicioSemanaUtc),
            lte(sesionesEntrenamiento.fechaFinUtc, ventana.ahoraUtc)
          )
        );

      // 4.3 Historial completado (para inactividad y última sesión)
      ultimasSesiones = await this.db
        .select({
          alumnoId: sesionesEntrenamiento.alumnoId,
          fechaProgramada: sesionesEntrenamiento.fechaProgramada,
          fechaFinUtc: sesionesEntrenamiento.fechaFinUtc,
        })
        .from(sesionesEntrenamiento)
        .where(
          and(
            inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
            eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA)
          )
        )
        .orderBy(desc(sesionesEntrenamiento.fechaFinUtc));
    }

    const rutinaPorAlumno = new Map<string, { bloques: unknown }>();
    for (const r of rutinasActivas) {
      if (!rutinaPorAlumno.has(r.alumnoId)) rutinaPorAlumno.set(r.alumnoId, r);
    }

    const completadasVentanaPorAlumno = new Map<string, number>();
    for (const s of sesionesCompletadasVentana) {
      completadasVentanaPorAlumno.set(
        s.alumnoId,
        (completadasVentanaPorAlumno.get(s.alumnoId) ?? 0) + 1
      );
    }

    // El historial viene ordenado desc por fecha de fin: la primera aparición es la última sesión.
    const ultimaSesionPorAlumno = new Map<string, { fechaFinUtc: Date | string | null }>();
    for (const s of ultimasSesiones) {
      if (s.fechaFinUtc && !ultimaSesionPorAlumno.has(s.alumnoId)) {
        ultimaSesionPorAlumno.set(s.alumnoId, s);
      }
    }

    // 4.4 Agregado semanal: sin datos evaluables => null explícito (nunca un '85.00' hardcodeado).
    let totalPrescritas = 0;
    let totalCompletadas = 0;

    // 5. Bandejas Rápidas
    // 5.1 Pagos por conciliar y 5.3 Alumnos en mora se leyeron arriba, dentro del bloque
    //     `withTenant` del dashboard (tablas financieras con RLS, etapa 2).

    // 5.2 Checkins antropométricos pendientes
    let checkinsAntropometricosPendientes = 0;
    if (alumnosUserIds.length > 0) {
      const checkins = await this.db
        .select({ id: controlesAntropometricos.id })
        .from(controlesAntropometricos)
        .where(
          and(
            inArray(controlesAntropometricos.alumnoId, alumnosUserIds),
            eq(
              controlesAntropometricos.estado,
              EstadoMedicion.PENDIENTE_APROBACION
            )
          )
        );
      checkinsAntropometricosPendientes = checkins.length;
    }

    // 5.3 Alumnos en Mora
    //     WU-I: regla ÚNICA compartida (`condicionCuotaEnMora`). POR_VENCER es preventivo (ámbar),
    //     nunca mora, y PENDIENTE_REVISION pausa la mora mientras el comprobante está en revisión.
    const alumnosEnMora = cuotasMora.map((c) => {
      const al = alumnos.find((a) => a.usuarioId === c.clienteId);
      const diasVencido = calcularDiasAtraso(new Date(c.fechaCorteUtc), now);
      return {
        alumnoId: al?.id || c.clienteId,
        nombre: al ? `${al.nombres} ${al.apellidos}` : 'Alumno Registrado',
        cuotaId: c.id,
        saldoPendienteUsd: Number(c.saldoPendienteUsd).toFixed(2),
        diasVencido,
      };
    });

    // 5.4 Riesgo deportivo por alumno (inactividad + adherencia RN-03) y agregados semanales.
    //     Se calcula en un único recorrido, reutilizando el evaluador puro compartido.
    const alumnosInactivosEntrenamiento: Array<{
      alumnoId: string;
      nombre: string;
      diasSinEntrenar: number;
    }> = [];
    let alumnosEnRiesgoDeportivo = 0;

    for (const al of alumnos) {
      const esActivo = al.estadoActivacion === EstadoAlumno.ACTIVO;
      const rutina = rutinaPorAlumno.get(al.usuarioId);
      const bloques = Array.isArray(rutina?.bloques)
        ? (rutina!.bloques as BloqueDiaRutinaDTO[])
        : [];
      const tienePlanActivo = bloques.length > 0;
      const sesionesPrescritas = tienePlanActivo
        ? contarBloquesPrescritosHasta(bloques, ventana.isoDayHoy)
        : 0;
      const sesionesCompletadas = completadasVentanaPorAlumno.get(al.usuarioId) ?? 0;

      if (sesionesPrescritas > 0) {
        totalPrescritas += sesionesPrescritas;
        totalCompletadas += sesionesCompletadas;
      }

      // Inactividad: días de calendario desde la última sesión completada (o alta si nunca entrenó).
      const sesion = ultimaSesionPorAlumno.get(al.usuarioId);
      let diasSinEntrenar = 0;
      if (sesion?.fechaFinUtc) {
        const fechaLocalUltima = obtenerFechaLocalYyyyMmDd(sesion.fechaFinUtc);
        diasSinEntrenar = diferenciaDiasCalendario(fechaLocalUltima, ventana.hoyLocal);
      } else {
        const fechaCreacion = new Date(al.createdAtUtc);
        diasSinEntrenar = Math.max(
          0,
          Math.round((now.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24))
        );
      }

      if (esActivo && diasSinEntrenar >= 4) {
        alumnosInactivosEntrenamiento.push({
          alumnoId: al.id,
          nombre: `${al.nombres} ${al.apellidos}`,
          diasSinEntrenar,
        });
      }

      const adherencia = evaluarAdherenciaSemanal(
        sesionesPrescritas,
        sesionesCompletadas,
        diasSinEntrenar
      );
      const riesgoPorAdherencia =
        tienePlanActivo &&
        sesionesPrescritas > 0 &&
        adherencia.semaforoAdherencia === SemaforoAdherencia.ROJO;
      const riesgoPorInactividad = esActivo && diasSinEntrenar >= 4;

      if (riesgoPorAdherencia || riesgoPorInactividad) {
        alumnosEnRiesgoDeportivo++;
      }
    }

    const tasaAdherenciaSemanal =
      totalPrescritas > 0 ? ((totalCompletadas / totalPrescritas) * 100).toFixed(2) : null;

    // 5.5 Contadores separados: riesgo deportivo vs mora financiera.
    //     `alumnosEnRiesgo` se conserva como unión legacy por compatibilidad con consumidores previos.
    const idsEnRiesgo = new Set([
      ...alumnosEnMora.map((m) => m.alumnoId),
      ...alumnosInactivosEntrenamiento.map((i) => i.alumnoId),
    ]);
    const alumnosEnRiesgo = idsEnRiesgo.size;
    const alumnosEnMoraFinanciera = alumnosEnMora.length;

    return {
      kpisMacro: {
        alumnosActivos,
        capacidadMaxima,
        porcentajeOcupacion,
        cobranzaMesUsd,
        metaCobranzaMesUsd,
        porcentajeCobranza,
        tasaAdherenciaSemanal,
        alumnosEnRiesgoDeportivo,
        alumnosEnMoraFinanciera,
        alumnosEnRiesgo,
      },
      bandejasRapidas: {
        pagosPorConciliar,
        checkinsAntropometricosPendientes,
        alumnosEnMora,
        alumnosInactivosEntrenamiento,
      },
    };
  }
}
