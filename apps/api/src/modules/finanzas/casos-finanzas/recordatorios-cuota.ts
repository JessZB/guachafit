import type { ContextoFinanzas } from './contexto-finanzas';

/**
 * WU-H (RF-008 / ADR-008 §3.2): cancela los recordatorios futuros de una cuota que ya no tiene
 * deuda (liquidada o anulada). Cancela sin comprobar el estado: decide quien la llama. Se ejecuta
 * DESPUÉS del commit: un fallo de Redis no revierte la operación.
 */
export async function cancelarRecordatoriosDeCuotaCaso(
  ctx: ContextoFinanzas,
  cuotaId: string
): Promise<void> {
  if (!ctx.billingSchedulerService) return;
  try {
    await ctx.billingSchedulerService.cancelarRecordatoriosCuota(cuotaId);
  } catch (error) {
    ctx.logger.error(
      `No se pudieron cancelar los recordatorios de la cuota ${cuotaId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
