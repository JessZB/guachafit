import { CuotaDetalleDTO, TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { cuotasMembresia, transaccionesPago } from '@guachafit/database';
import { toIsoSafe } from './finanzas-reglas';

/**
 * Mapeo a DTO de las filas financieras para los casos de finanzas.
 * Sin I/O propio: convierte filas de `transacciones_pago` y `cuotas_membresia` a DTO.
 */
export function mapearTransaccionDTOCaso(
  t: typeof transaccionesPago.$inferSelect
): TransaccionPagoDetalleDTO {
  return {
    id: t.id,
    cuotaId: t.cuotaId,
    clienteId: t.clienteId,
    entrenadorId: t.entrenadorId,
    registradoPor: t.registradoPor,
    montoOriginal: t.montoOriginal,
    monedaOriginal: t.monedaOriginal,
    tasaCambioFijada: t.tasaCambioFijada,
    montoEquivalenteUsd: t.montoEquivalenteUsd,
    excedenteUsd: t.excedenteUsd,
    metodoPago: t.metodoPago,
    referenciaBancaria: t.referenciaBancaria,
    fechaOperacion: t.fechaOperacion,
    comprobanteStorageKey: t.comprobanteStorageKey,
    estadoConciliacion: t.estadoConciliacion,
    motivoRechazo: t.motivoRechazo,
    motivoReversion: t.motivoReversion ?? null,
    fechaReversionUtc: t.fechaReversionUtc ? toIsoSafe(t.fechaReversionUtc) : null,
    fechaReporteUtc: toIsoSafe(t.fechaReporteUtc),
    fechaConciliacionUtc: t.fechaConciliacionUtc ? toIsoSafe(t.fechaConciliacionUtc) : null,
    createdAtUtc: toIsoSafe(t.createdAtUtc),
    updatedAtUtc: toIsoSafe(t.updatedAtUtc),
  };
}

export function mapearCuotaDTOCaso(c: typeof cuotasMembresia.$inferSelect): CuotaDetalleDTO {
  return {
    id: c.id,
    clienteId: c.clienteId,
    entrenadorId: c.entrenadorId,
    planId: c.planId,
    periodo: c.periodo,
    montoTotalUsd: c.montoTotalUsd,
    montoAbonadoUsd: c.montoAbonadoUsd,
    saldoPendienteUsd: c.saldoPendienteUsd,
    saldoAFavorAplicadoUsd: c.saldoAFavorAplicadoUsd,
    fechaEmisionUtc: toIsoSafe(c.fechaEmisionUtc),
    fechaCorteUtc: toIsoSafe(c.fechaCorteUtc),
    estado: c.estado,
    notas: c.notas,
    motivoAnulacion: c.motivoAnulacion ?? null,
    fechaAnulacionUtc: c.fechaAnulacionUtc ? toIsoSafe(c.fechaAnulacionUtc) : null,
    anuladaPor: c.anuladaPor ?? null,
    createdAtUtc: toIsoSafe(c.createdAtUtc),
    updatedAtUtc: toIsoSafe(c.updatedAtUtc),
  };
}
