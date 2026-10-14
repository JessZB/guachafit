import type { ContextoFinanzas } from './contexto-finanzas';

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
