import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  cuotasMembresia,
  perfilesAlumno,
  perfilesEntrenador,
  rutinas,
  transaccionesPago,
} from '@guachafit/database';
import {
  EstadoConciliacion,
  EstadoCuota,
} from '@guachafit/shared';
import type { DashboardComandoDTO } from '@guachafit/shared';
import {
  calcularRecaudadoMesUsd,
  calcularVentanaMesUtc,
  condicionCuotaEnMora,
} from '../../../common/cartera.util';
import { calcularVentanaSemana } from '../../../common/adherencia.util';
import type { ContextoEntrenador } from './contexto-entrenador';
import {
  calcularContadoresRiesgo,
  calcularMetaCobranza,
  calcularOcupacion,
  mapearAlumnosEnMora,
} from './dashboard-entrenador-reglas';
import {
  evaluarRiesgoDeportivo,
  indexarDatosAdherencia,
} from './riesgo-deportivo-reglas';
import { leerSesionesAdherencia } from './leer-sesiones-adherencia';
import { contarCheckinsPendientes } from './contar-checkins-pendientes';

/**
 * Genera el payload consolidado del Dashboard de Comando Central del Entrenador (RF-013)
 */
export async function obtenerDashboardComando(
  ctx: ContextoEntrenador,
  coachId: string
): Promise<DashboardComandoDTO> {
  const now = new Date();
  const { periodoActual, inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(now);

  // 1. Capacidad Máxima del Entrenador
  const [coachProfile] = await ctx.db
    .select({
      capacidadMaxima: perfilesEntrenador.capacidadMaxima,
    })
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.usuarioId, coachId));

  const capacidadMaxima = coachProfile?.capacidadMaxima ?? 50;

  // 2. Alumnos de su cartera.
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach.
  const alumnos = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
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

  const { alumnosActivos, porcentajeOcupacion } = calcularOcupacion(
    alumnos,
    capacidadMaxima
  );

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
    await ctx.withTenant({ entrenadorId: coachId }, async (tx) => {
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

  const { metaCobranzaMesUsd, porcentajeCobranza } = calcularMetaCobranza(
    cuotasPeriodo,
    cobranzaMesUsd
  );

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
    rutinasActivas = await ctx.withTenant({ entrenadorId: coachId }, async (tx) =>
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

    // 4.2 Sesiones completadas dentro de la ventana semanal y 4.3 historial completado
    //     (para inactividad y última sesión).
    ({ sesionesCompletadasVentana, ultimasSesiones } = await leerSesionesAdherencia(
      ctx,
      alumnosUserIds,
      ventana
    ));
  }

  const { rutinaPorAlumno, completadasVentanaPorAlumno, ultimaSesionPorAlumno } =
    indexarDatosAdherencia(rutinasActivas, sesionesCompletadasVentana, ultimasSesiones);

  // 5. Bandejas Rápidas
  // 5.1 Pagos por conciliar y 5.3 Alumnos en mora se leyeron arriba, dentro del bloque
  //     `withTenant` del dashboard (tablas financieras con RLS, etapa 2).

  // 5.2 Checkins antropométricos pendientes
  const checkinsAntropometricosPendientes = await contarCheckinsPendientes(
    ctx,
    alumnosUserIds
  );

  // 5.3 Alumnos en Mora
  const alumnosEnMora = mapearAlumnosEnMora(cuotasMora, alumnos, now);

  // 5.4 Riesgo deportivo por alumno (inactividad + adherencia RN-03) y agregados semanales.
  //     Se calcula en un único recorrido, reutilizando el evaluador puro compartido.
  const { alumnosInactivosEntrenamiento, alumnosEnRiesgoDeportivo, tasaAdherenciaSemanal } =
    evaluarRiesgoDeportivo(
      alumnos,
      rutinaPorAlumno,
      completadasVentanaPorAlumno,
      ultimaSesionPorAlumno,
      ventana,
      now
    );

  // 5.5 Contadores separados: riesgo deportivo vs mora financiera.
  //     `alumnosEnRiesgo` se conserva como unión legacy por compatibilidad con consumidores previos.
  const { alumnosEnRiesgo, alumnosEnMoraFinanciera } = calcularContadoresRiesgo(
    alumnosEnMora,
    alumnosInactivosEntrenamiento
  );

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
