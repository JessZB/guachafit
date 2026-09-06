import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  or,
  lt,
  gt,
  notInArray,
  isNull,
  inArray,
  desc,
  gte,
  perfilesEntrenador,
  perfilesAlumno,
  transaccionesPago,
  cuotasMembresia,
  controlesAntropometricos,
  sesionesEntrenamiento,
} from '@guachafit/database';
import {
  DashboardComandoDTO,
  EstadoAlumno,
  EstadoConciliacion,
  EstadoCuota,
  EstadoMedicion,
  EstadoSesion,
} from '@guachafit/shared';

@Injectable()
export class EntrenadorService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Genera el payload consolidado del Dashboard de Comando Central del Entrenador (RF-013)
   */
  async obtenerDashboardComando(coachId: string): Promise<DashboardComandoDTO> {
    const now = new Date();
    const periodoActual = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // 1. Capacidad Máxima del Entrenador
    const [coachProfile] = await this.db
      .select({
        capacidadMaxima: perfilesEntrenador.capacidadMaxima,
      })
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, coachId));

    const capacidadMaxima = coachProfile?.capacidadMaxima ?? 50;

    // 2. Alumnos de su cartera
    const alumnos = await this.db
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
      );

    const alumnosActivos = alumnos.filter(
      (a) => a.estadoActivacion === EstadoAlumno.ACTIVO
    ).length;

    const porcentajeOcupacion =
      capacidadMaxima > 0
        ? ((alumnosActivos / capacidadMaxima) * 100).toFixed(2)
        : '0.00';

    // 3. Métricas Financieras (Cobranza Mes y Meta)
    const pagosAprobados = await this.db
      .select({
        montoEquivalenteUsd: transaccionesPago.montoEquivalenteUsd,
      })
      .from(transaccionesPago)
      .where(
        and(
          eq(transaccionesPago.entrenadorId, coachId),
          eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO)
        )
      );

    const totalCobradoUsd = pagosAprobados.reduce(
      (acc, p) => acc + Number(p.montoEquivalenteUsd || 0),
      0
    );
    const cobranzaMesUsd = totalCobradoUsd.toFixed(2);

    const cuotasPeriodo = await this.db
      .select({
        montoTotalUsd: cuotasMembresia.montoTotalUsd,
      })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, coachId),
          eq(cuotasMembresia.periodo, periodoActual)
        )
      );

    const totalMetaUsd = cuotasPeriodo.reduce(
      (acc, c) => acc + Number(c.montoTotalUsd || 0),
      0
    );
    const metaCalculada =
      totalMetaUsd > 0
        ? totalMetaUsd
        : alumnosActivos > 0
          ? alumnosActivos * 35
          : 2500;
    const metaCobranzaMesUsd = metaCalculada.toFixed(2);

    const porcentajeCobranza =
      Number(metaCobranzaMesUsd) > 0
        ? ((Number(cobranzaMesUsd) / Number(metaCobranzaMesUsd)) * 100).toFixed(2)
        : '100.00';

    // 4. Adherencia Semanal
    const alumnosUserIds = alumnos.map((a) => a.usuarioId);
    let tasaAdherenciaSemanal = '85.00';

    if (alumnosUserIds.length > 0) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const sesionesSemana = await this.db
        .select({
          estado: sesionesEntrenamiento.estado,
        })
        .from(sesionesEntrenamiento)
        .where(
          and(
            inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
            gte(
              sesionesEntrenamiento.fechaProgramada,
              sevenDaysAgo.toISOString().split('T')[0]
            )
          )
        );

      if (sesionesSemana.length > 0) {
        const completadas = sesionesSemana.filter(
          (s) => s.estado === EstadoSesion.COMPLETADA
        ).length;
        tasaAdherenciaSemanal = (
          (completadas / sesionesSemana.length) *
          100
        ).toFixed(2);
      }
    }

    // 5. Bandejas Rápidas
    // 5.1 Pagos por conciliar
    const pagosPendientes = await this.db
      .select({ id: transaccionesPago.id })
      .from(transaccionesPago)
      .where(
        and(
          eq(transaccionesPago.entrenadorId, coachId),
          eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
        )
      );
    const pagosPorConciliar = pagosPendientes.length;

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
    const cuotasMora = await this.db
      .select({
        id: cuotasMembresia.id,
        clienteId: cuotasMembresia.clienteId,
        saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
        fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
        estado: cuotasMembresia.estado,
      })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, coachId),
          or(
            eq(cuotasMembresia.estado, EstadoCuota.VENCIDA),
            and(
              lt(cuotasMembresia.fechaCorteUtc, now),
              gt(cuotasMembresia.saldoPendienteUsd, '0'),
              notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA])
            )
          )
        )
      );

    const alumnosEnMora = cuotasMora.map((c) => {
      const al = alumnos.find((a) => a.usuarioId === c.clienteId);
      const diasVencido = Math.max(
        1,
        Math.round(
          (now.getTime() - new Date(c.fechaCorteUtc).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      return {
        alumnoId: al?.id || c.clienteId,
        nombre: al ? `${al.nombres} ${al.apellidos}` : 'Alumno Registrado',
        cuotaId: c.id,
        saldoPendienteUsd: Number(c.saldoPendienteUsd).toFixed(2),
        diasVencido,
      };
    });

    // 5.4 Alumnos Inactivos en Entrenamiento (>= 4 días sin entrenar)
    const alumnosInactivosEntrenamiento: Array<{
      alumnoId: string;
      nombre: string;
      diasSinEntrenar: number;
    }> = [];

    if (alumnosUserIds.length > 0) {
      const ultimasSesiones = await this.db
        .select({
          alumnoId: sesionesEntrenamiento.alumnoId,
          fechaProgramada: sesionesEntrenamiento.fechaProgramada,
        })
        .from(sesionesEntrenamiento)
        .where(
          and(
            inArray(sesionesEntrenamiento.alumnoId, alumnosUserIds),
            eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA)
          )
        )
        .orderBy(desc(sesionesEntrenamiento.fechaProgramada));

      for (const al of alumnos.filter(
        (a) => a.estadoActivacion === EstadoAlumno.ACTIVO
      )) {
        const sesion = ultimasSesiones.find((s) => s.alumnoId === al.usuarioId);
        let diasSinEntrenar = 0;
        if (sesion) {
          const fechaS = new Date(sesion.fechaProgramada);
          diasSinEntrenar = Math.max(
            0,
            Math.round((now.getTime() - fechaS.getTime()) / (1000 * 60 * 60 * 24))
          );
        } else {
          const fechaCreacion = new Date(al.createdAtUtc);
          diasSinEntrenar = Math.max(
            0,
            Math.round(
              (now.getTime() - fechaCreacion.getTime()) / (1000 * 60 * 60 * 24)
            )
          );
        }

        if (diasSinEntrenar >= 4) {
          alumnosInactivosEntrenamiento.push({
            alumnoId: al.id,
            nombre: `${al.nombres} ${al.apellidos}`,
            diasSinEntrenar,
          });
        }
      }
    }

    // 5.5 Conteo de Alumnos en Riesgo (mora o inactividad)
    const idsEnRiesgo = new Set([
      ...alumnosEnMora.map((m) => m.alumnoId),
      ...alumnosInactivosEntrenamiento.map((i) => i.alumnoId),
    ]);
    const alumnosEnRiesgo = idsEnRiesgo.size;

    return {
      kpisMacro: {
        alumnosActivos,
        capacidadMaxima,
        porcentajeOcupacion,
        cobranzaMesUsd,
        metaCobranzaMesUsd,
        porcentajeCobranza,
        tasaAdherenciaSemanal,
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
