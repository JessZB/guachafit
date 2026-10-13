import {
  and,
  count,
  countDistinct,
  eq,
  lte,
  ne,
  sql,
  cuotasMembresia,
  transaccionesPago,
} from '@guachafit/database';
import {
  EstadoConciliacion,
  EstadoCuota,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import {
  calcularRecaudadoMesUsd,
  calcularVentanaMesUtc,
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
} from '../../../common/cartera.util';
import type { ContextoCartera } from './contexto-cartera';

/**
 * KPIs y contadores de la cartera COMPLETA del coach (nunca de la página cargada).
 *
 * Todas las consultas van filtradas por `entrenador_id` (aislamiento de tenant) y se resuelven
 * en paralelo; ninguno de estos números se deriva de datos demo o heurísticas.
 */
export async function calcularResumenCartera(
  ctx: ContextoCartera,
  entrenadorId: string,
  ahora: Date
): Promise<ResumenCarteraDTO> {
  const { periodoActual, inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(ahora);

  // RNF-003/ADR-011 (etapa 2): las 5 lecturas sobre tablas financieras con RLS corren en UNA
  // transacción con el GUC del coach (la tasa vigente vive en tablas sin RLS: fuera del bloque).
  const [recaudadoMesUsd, [filaMora], [filaPorVencer], [filaRevision], [filaAlDia]] =
    await ctx.withTenant({ entrenadorId }, async (tx) =>
      Promise.all([
        calcularRecaudadoMesUsd(tx, entrenadorId, { inicioMesUtc, inicioMesSiguienteUtc }),
        tx
          .select({
            total: sql<string>`coalesce(sum(${cuotasMembresia.saldoPendienteUsd}), 0)`,
            alumnos: countDistinct(cuotasMembresia.clienteId),
          })
          .from(cuotasMembresia)
          .where(
            and(
              eq(cuotasMembresia.entrenadorId, entrenadorId),
              condicionCuotaEnMora(ahora)
            )
          ),
        tx
          .select({
            total: sql<string>`coalesce(sum(${cuotasMembresia.saldoPendienteUsd}), 0)`,
            alumnos: countDistinct(cuotasMembresia.clienteId),
          })
          .from(cuotasMembresia)
          .where(
            and(
              eq(cuotasMembresia.entrenadorId, entrenadorId),
              condicionCuotaPorVencer(ahora)
            )
          ),
        tx
          .select({ total: count() })
          .from(transaccionesPago)
          .where(
            and(
              eq(transaccionesPago.entrenadorId, entrenadorId),
              eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
            )
          ),
        tx
          .select({ total: count() })
          .from(cuotasMembresia)
          .where(
            and(
              eq(cuotasMembresia.entrenadorId, entrenadorId),
              eq(cuotasMembresia.periodo, periodoActual),
              lte(cuotasMembresia.saldoPendienteUsd, '0'),
              ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
            )
          ),
      ])
    );

  const tasa = await ctx.finanzasService.obtenerTasaVigente(entrenadorId);

  const alumnosEnMora = Number(filaMora?.alumnos ?? 0);
  const proximosAVencer = Number(filaPorVencer?.alumnos ?? 0);
  const pagosPorValidar = Number(filaRevision?.total ?? 0);
  const contadorAlDia = Number(filaAlDia?.total ?? 0);

  return {
    recaudadoMesUsd,
    totalEnMoraUsd: Number(filaMora?.total ?? 0).toFixed(2),
    alumnosEnMora,
    totalPorVencerUsd: Number(filaPorVencer?.total ?? 0).toFixed(2),
    proximosAVencer,
    pagosPorValidar,
    contadores: {
      enMora: alumnosEnMora,
      porVencer: proximosAVencer,
      revision: pagosPorValidar,
      alDia: contadorAlDia,
    },
    tasaVigente: tasa.tasaEfectiva,
  };
}
