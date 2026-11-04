import { Logger } from '@nestjs/common';
import { R2StorageService } from '../../antropometria/r2-storage.service';
import type { ContextoFinanzas } from './contexto-finanzas';

const loggerComprobantes = new Logger('ComprobantesFinanzas');

export const MENSAJE_COMPROBANTE_INVALIDO = 'El comprobante adjunto no es válido.';

/**
 * D16 (RF-007, RNF-001): `true` solo si la clave del comprobante cumple la estructura ADR-007 Y
 * pertenece al namespace del propio alumno (`comprobantes/{alumnoId}/`). Función pura: la
 * comparación del prefijo es EXACTA (sin normalizar mayúsculas ni espacios) y solo se admiten
 * imágenes (`.webp`, `.jpeg`, `.jpg`); un `.pdf` válido para otros módulos se rechaza aquí.
 */
export function esClaveComprobanteDe(clave: string, alumnoId: string): boolean {
  return (
    R2StorageService.validarStorageKeyEstructura(clave) &&
    clave.startsWith(`comprobantes/${alumnoId}/`) &&
    (clave.endsWith('.webp') || clave.endsWith('.jpeg') || clave.endsWith('.jpg'))
  );
}

/**
 * WU-I: la MISMA resolución de comprobantes para todos los casos (presigned URL con TTL,
 * `null` honesto si R2 no está configurado o falla). La fachada la expone para cartera.
 */
export async function resolverComprobanteUrlCaso(
  ctx: ContextoFinanzas,
  storageKey?: string | null,
  clienteId?: string
): Promise<string | null> {
  if (!storageKey || !ctx.r2StorageService) return null;
  // D16: nunca se firma una clave que no cumpla ADR-007 o no pertenezca al titular. El aviso
  // omite la clave (contiene el id del alumno) y la lectura nunca lanza por ello.
  if (!clienteId || !esClaveComprobanteDe(storageKey, clienteId)) {
    loggerComprobantes.warn('Clave de comprobante inválida para su titular; no se firma la URL.');
    return null;
  }
  try {
    return await ctx.r2StorageService.generarPresignedGetUrl(storageKey, 900);
  } catch {
    // Texto fijo: sin clave, clienteId ni mensaje del error (pueden contener datos del alumno).
    loggerComprobantes.warn('No se pudo firmar la URL del comprobante; se devuelve null.');
    return null;
  }
}
