import {
  BandejaConciliacionDTO,
  EstadoConciliacion,
  LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO,
} from '@guachafit/shared';
import {
  and,
  asc,
  count,
  cuotasMembresia,
  eq,
  perfilesAlumno,
  transaccionesPago,
} from '@guachafit/database';
import { resolverComprobanteUrlCaso } from './comprobantes';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 6. BANDEJA DE CONCILIACIÓN (RF-007 / RF-009)
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
