import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  BandejaConciliacionDTO,
  EstadoConciliacion,
  LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
  Moneda,
  ResumenFinancieroAlumnoDTO,
  Rol,
  EstadoCuota,
} from '@guachafit/shared';
import {
  and,
  asc,
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
import {
  buscarPerfilDeCarteraCaso,
} from './emision-programada.caso';
import {
  contextoRlsDeActor,
  resolverComprobanteUrlCaso,
} from './soporte-finanzas';
import type { ContextoFinanzas } from './contexto-finanzas';
import type { PerfilAlumnoFila } from './finanzas-reglas';

// ===========================================================================
// 6. BANDEJA DE CONCILIACIÓN E HISTORIAL 360 (RF-007 / RF-009)
// ===========================================================================

export async function listarBandejaConciliacionCaso(
  ctx: ContextoFinanzas,
  entrenadorId: string,
  limit = LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
  offset = 0
): Promise<BandejaConciliacionDTO> {
  const whereBandeja = and(
    eq(transaccionesPago.entrenadorId, entrenadorId),
    eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
  );

  // WU24b: COUNT real en SQL para el `total` del envelope.
  // RNF-003/ADR-011 (etapa 2): `transacciones_pago` tiene RLS; ambas lecturas en UNA
  // transacción con el GUC del coach.
  const { filaTotal, records } = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [filaTotal] = await tx
      .select({ total: count() })
      .from(transaccionesPago)
      .where(whereBandeja);

    const records = await tx
      .select({
        tx: transaccionesPago,
        alumno: perfilesAlumno,
        cuota: cuotasMembresia,
      })
      .from(transaccionesPago)
      .leftJoin(perfilesAlumno, eq(perfilesAlumno.usuarioId, transaccionesPago.clienteId))
      .leftJoin(cuotasMembresia, eq(cuotasMembresia.id, transaccionesPago.cuotaId))
      .where(whereBandeja)
      // FIFO por fecha de reporte; desempate estable para paginar sin repetidos.
      .orderBy(asc(transaccionesPago.fechaReporteUtc), asc(transaccionesPago.id))
      .limit(limit)
      .offset(offset);

    return { filaTotal, records };
  });

  const items = await Promise.all(
    records.map(async ({ tx, alumno, cuota }) => ({
      id: tx.id,
      cuotaId: tx.cuotaId,
      clienteId: tx.clienteId,
      entrenadorId: tx.entrenadorId,
      registradoPor: tx.registradoPor,
      montoOriginal: tx.montoOriginal,
      monedaOriginal: tx.monedaOriginal,
      tasaCambioFijada: tx.tasaCambioFijada,
      montoEquivalenteUsd: tx.montoEquivalenteUsd,
      excedenteUsd: tx.excedenteUsd,
      // Saldo actual de la cuota, para que la web pueda avisar antes de aprobar si el pago la
      // excede (el excedente quedará como saldo a favor).
      saldoPendienteCuotaUsd: cuota?.saldoPendienteUsd ?? undefined,
      metodoPago: tx.metodoPago,
      referenciaBancaria: tx.referenciaBancaria,
      fechaOperacion: tx.fechaOperacion,
      comprobanteStorageKey: tx.comprobanteStorageKey,
      comprobanteUrl: await resolverComprobanteUrlCaso(ctx, tx.comprobanteStorageKey),
      estadoConciliacion: tx.estadoConciliacion,
      motivoRechazo: tx.motivoRechazo,
      fechaReporteUtc: tx.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: tx.fechaConciliacionUtc?.toISOString() || null,
      clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
      createdAtUtc: tx.createdAtUtc.toISOString(),
      updatedAtUtc: tx.updatedAtUtc.toISOString(),
    }))
  );

  return {
    items,
    total: Number(filaTotal?.total ?? 0),
    limit,
    offset,
  };
}

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
