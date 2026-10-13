import { CuotaDetalleDTO, Rol, TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  cuotasMembresia,
  eq,
  perfilesAlumno,
  transaccionesPago,
  usuarios,
  type TenantRlsContext,
  type TenantTransaction,
} from '@guachafit/database';
import { toIsoSafe } from './finanzas-reglas';
import type { ContextoFinanzas } from './contexto-finanzas';

/**
 * Soporte compartido de los casos de uso (sin I/O propio salvo el indicado):
 * contexto RLS por rol, resolución de identidad de cliente y mapeos a DTO.
 * Lo importan todos los casos que leen con RLS; no importa a ningún otro caso.
 */

export function contextoRlsDeActor(
  actorUserId: string,
  actorRole: Rol,
  actorEntrenadorId?: string
): TenantRlsContext {
  if (actorRole === Rol.ALUMNO) return { usuarioId: actorUserId };
  if (actorRole === Rol.SUPERADMIN) return { isSuperadmin: true };
  return { entrenadorId: actorEntrenadorId ?? actorUserId };
}

/**
 * SIEMPRE debe correr en una transacción con contexto (`withTenant` o tx con `set_config`).
 * El `tx` es OBLIGATORIO a propósito: sin él, un futuro llamador leería 0 filas en silencio.
 */
export async function resolveClienteUsuarioId(
  idOrPerfilId: string,
  tx: TenantTransaction
): Promise<string> {
  const conn = tx;

  // Si ya es un usuarioId en la tabla usuarios
  const [user] = await conn
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.id, idOrPerfilId));

  if (user) return user.id;

  // Si es un perfilId en perfilesAlumno
  const [perfil] = await conn
    .select({ usuarioId: perfilesAlumno.usuarioId })
    .from(perfilesAlumno)
    .where(eq(perfilesAlumno.id, idOrPerfilId));

  if (perfil) return perfil.usuarioId;

  return idOrPerfilId;
}

/**
 * WU-I: la MISMA resolución de comprobantes para todos los casos (presigned URL con TTL,
 * `null` honesto si R2 no está configurado o falla). La fachada la expone para cartera.
 */
export async function resolverComprobanteUrlCaso(
  ctx: ContextoFinanzas,
  storageKey?: string | null
): Promise<string | null> {
  if (!storageKey || !ctx.r2StorageService) return null;
  try {
    return await ctx.r2StorageService.generarPresignedGetUrl(storageKey, 900);
  } catch {
    return null;
  }
}

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
