import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EstadoConciliacion,
  EstadoCuota,
  Moneda,
  ResumenFinancieroAlumnoDTO,
  Rol,
} from '@guachafit/shared';
import {
  and,
  count,
  cuotasMembresia,
  desc,
  eq,
  gte,
  lt,
  perfilesAlumno,
  sum,
  transaccionesPago,
} from '@guachafit/database';
import { MENSAJE_ALUMNO_NO_ENCONTRADO } from '../../../common/mensajes-acceso';
import { fromCents, toCents, toIsoSafe } from './finanzas-reglas';
import { buscarPerfilDeCarteraCaso } from './emision-programada';
import { contextoRlsDeActor } from './acceso-rls-finanzas';
import type { ContextoFinanzas } from './contexto-finanzas';
import type { PerfilAlumnoFila } from './finanzas-reglas';

/**
 * Obtener historial financiero completo y resumen 360 del alumno.
 *
 * WU24b: `transaccionesTotal` es el COUNT real SIEMPRE presente. `txLimit`/`txOffset` son
 * OPT-IN: sin ellos `transacciones` trae todas (comportamiento histórico) y con ellos el
 * slice se resuelve con LIMIT/OFFSET en SQL. Los agregados del resumen (`saldoPendienteTotalUsd`,
 * `totalPagadoHistoricoUsd`, `totalPagadoMesActualUsd`) se calculan sobre el TOTAL, no la página.
 */
export async function obtenerHistorialClienteCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  clienteId: string,
  actorUserId: string,
  actorRole: Rol,
  txLimit?: number,
  txOffset = 0
): Promise<ResumenFinancieroAlumnoDTO> {
  // RNF-003/ADR-011 (etapa 2): `cuotas_membresia`/`transacciones_pago` tienen RLS. El flujo
  // completo (perfil + cuotas + transacciones + agregados) corre en UNA transacción con el
  // contexto del actor: ALUMNO -> self; COACH -> tenant.
  return ctx.withTenant(
    contextoRlsDeActor(actorUserId, actorRole, entrenadorId),
    async (tx) => {
      // 1. Alumno y aislamiento. El entrenador usa la búsqueda única de su cartera (404
      //    uniforme) y SÍ puede consultar los pagos de un alumno archivado.
      let perfil: PerfilAlumnoFila;
      if (actorRole === Rol.ENTRENADOR) {
        perfil = await buscarPerfilDeCarteraCaso(tx, entrenadorId, clienteId, {
          incluirArchivados: true,
        });
      } else {
        let [encontrado] = await tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.id, clienteId));

        if (!encontrado) {
          [encontrado] = await tx
            .select()
            .from(perfilesAlumno)
            .where(eq(perfilesAlumno.usuarioId, clienteId));
        }

        if (!encontrado) {
          throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
        }

        if (encontrado.usuarioId !== actorUserId) {
          throw new ForbiddenException('Solo puedes ver tus propios pagos.');
        }
        perfil = encontrado;
      }

      const clienteUsuarioId = perfil.usuarioId;

      const cuotas = await tx
        .select()
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.clienteId, clienteUsuarioId),
            eq(cuotasMembresia.entrenadorId, entrenadorId)
          )
        )
        .orderBy(desc(cuotasMembresia.createdAtUtc));

      const whereTransacciones = and(
        eq(transaccionesPago.clienteId, clienteUsuarioId),
        eq(transaccionesPago.entrenadorId, entrenadorId)
      );

      // WU24b: COUNT real del total (independiente de la página solicitada).
      const [filaTotalTx] = await tx
        .select({ total: count() })
        .from(transaccionesPago)
        .where(whereTransacciones);

      const txQuery = tx
        .select()
        .from(transaccionesPago)
        .where(whereTransacciones)
        // Desempate estable por `id` para que `txOffset` no repita ni salte filas.
        .orderBy(desc(transaccionesPago.createdAtUtc), desc(transaccionesPago.id));

      // WU24b: LIMIT/OFFSET en SQL solo cuando el consumidor pide explícitamente una página.
      const txs = await (txLimit !== undefined
        ? txQuery.limit(txLimit).offset(txOffset)
        : txQuery);

      // RF-008: una cuota anulada no es deuda ni "cuota del mes", aunque un dato antiguo
      // conserve saldo pendiente.
      const cuotasVigentes = cuotas.filter((c) => c.estado !== EstadoCuota.ANULADA);

      let saldoTotalCents = 0;
      for (const c of cuotasVigentes) {
        if (c.estado !== EstadoCuota.AL_DIA) {
          saldoTotalCents += toCents(c.saldoPendienteUsd);
        }
      }

      const hoy = new Date();
      const currentYear = hoy.getFullYear();
      const currentMonth = hoy.getMonth();
      const inicioMesActual = new Date(currentYear, currentMonth, 1);
      const inicioMesSiguiente = new Date(currentYear, currentMonth + 1, 1);

      // WU24b: agregados del resumen en SQL sobre TODAS las transacciones aprobadas del alumno
      // (no solo la página), preservando la semántica de `totalPagadoHistoricoUsd`/`totalPagadoMesActualUsd`.
      const [filaTotalesHistoricos] = await tx
        .select({ totalUsd: sum(transaccionesPago.montoEquivalenteUsd) })
        .from(transaccionesPago)
        .where(
          and(whereTransacciones, eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO))
        );

      const [filaTotalesMes] = await tx
        .select({ totalUsd: sum(transaccionesPago.montoEquivalenteUsd) })
        .from(transaccionesPago)
        .where(
          and(
            whereTransacciones,
            eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.APROBADO),
            gte(transaccionesPago.createdAtUtc, inicioMesActual),
            lt(transaccionesPago.createdAtUtc, inicioMesSiguiente)
          )
        );

      const totalPagadoHistCents = toCents(filaTotalesHistoricos?.totalUsd ?? '0');
      const totalPagadoMesCents = toCents(filaTotalesMes?.totalUsd ?? '0');

      const currentPeriod = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      const cuotaMes =
        cuotasVigentes.find((c) => c.periodo === currentPeriod) || cuotasVigentes[0] || null;

      return {
        alumnoId: perfil.id,
        usuarioId: clienteUsuarioId,
        saldoPendienteTotalUsd: fromCents(saldoTotalCents),
        saldoAFavorUsd: perfil.saldoAFavorUsd ?? '0.00',
        totalPagadoHistoricoUsd: fromCents(totalPagadoHistCents),
        totalPagadoMesActualUsd: fromCents(totalPagadoMesCents),
        cuotaMesActual: cuotaMes
          ? {
              id: cuotaMes.id,
              periodo: cuotaMes.periodo,
              montoTotalUsd: cuotaMes.montoTotalUsd,
              montoPagadoUsd: cuotaMes.montoAbonadoUsd,
              saldoPendienteUsd: cuotaMes.saldoPendienteUsd,
              saldoAFavorAplicadoUsd: cuotaMes.saldoAFavorAplicadoUsd,
              estado: cuotaMes.estado,
              fechaVencimiento: toIsoSafe(cuotaMes.fechaCorteUtc),
              motivoAnulacion: cuotaMes.motivoAnulacion ?? null,
              fechaAnulacionUtc: cuotaMes.fechaAnulacionUtc
                ? toIsoSafe(cuotaMes.fechaAnulacionUtc)
                : null,
            }
          : null,
        transaccionesTotal: Number(filaTotalTx?.total ?? 0),
        transacciones: txs.map((t) => ({
          id: t.id,
          cuotaId: t.cuotaId,
          montoUsd: t.montoEquivalenteUsd,
          montoBs: t.monedaOriginal === Moneda.VES ? t.montoOriginal : undefined,
          metodoPago: t.metodoPago,
          referencia: t.referenciaBancaria || undefined,
          estado: t.estadoConciliacion,
          motivoReversion: t.motivoReversion ?? null,
          createdAtUtc: toIsoSafe(t.createdAtUtc),
        })),
      };
    }
  );
}
