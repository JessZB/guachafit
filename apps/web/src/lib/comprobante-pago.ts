/**
 * RF-007 (ADR-007): preparación y subida del comprobante de pago a la bóveda R2.
 *
 * El contrato compartido (`PresignedUploadUrlSchema`, módulo `comprobantes`) firma SOLO
 * `image/webp` o `image/jpeg`. Un PNG pedía la presign como WebP y luego un PUT con
 * `Content-Type: image/png`: la firma no coincidía, la bóveda respondía 403 y el reporte viajaba
 * con una `storageKey` cuyo objeto nunca se subió (referencia colgante en la BD). Este módulo:
 *
 * 1. `prepararComprobanteParaSubida`: deja la imagen en un MIME firmable (WebP 1920px/85 % con
 *    fallback JPEG) y falla honestamente si no hay conversión posible (p. ej. PNG original).
 * 2. `subirComprobantePago`: pide la presign con el MIME REAL del archivo preparado, ejecuta el
 *    PUT, exige `respuesta.ok` y solo entonces devuelve la `storageKey`. Sin subida confirmada no
 *    hay clave, y sin clave el reporte de pago NO se envía.
 */
import type { PresignedUploadUrlResponseDTO } from '@guachafit/shared';
import { comprimirImagenAWebp } from './imagen-comprimida';

/** MIMEs que la presign del módulo `comprobantes` acepta; un PNG nunca es firmable. */
export const MIMES_COMPROBANTE_FIRMABLES: ReadonlyArray<string> = ['image/webp', 'image/jpeg'];

export const MENSAJE_COMPROBANTE_FORMATO =
  'No se pudo procesar la imagen. Prueba con una foto JPG o WebP.';
export const MENSAJE_COMPROBANTE_SIN_URL =
  'No se pudo subir el comprobante: el servidor no devolvió una URL de subida. Inténtalo de nuevo en unos minutos.';
export const MENSAJE_COMPROBANTE_SIN_CLAVE =
  'No se pudo registrar el comprobante: el servidor no devolvió la clave de la bóveda. Inténtalo de nuevo en unos minutos.';

/**
 * Comprobante del pago: imagen JPG, PNG o WebP, no vacía y de hasta 5 MB. Devuelve `null` si es
 * válida o el mensaje del primer incumplimiento (orden: formato, archivo vacío, tamaño).
 */
export function validarArchivoComprobante(archivo: { type: string; size: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    return 'Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.';
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío.';
  }
  return archivo.size > 5 * 1024 * 1024 ? 'El archivo excede el límite máximo de 5 MB.' : null;
}

/** Mensaje honesto del PUT rechazado: incluye el status real (403 firma no coincide, 500 bóveda). */
export function mensajeComprobantePutFallido(status: number): string {
  return `No se pudo subir el comprobante (${status}). Revisa tu conexión e inténtalo de nuevo.`;
}

/** Compresor inyectable en tests; por defecto el WebP 1920px/85 % con fallback JPEG del repo. */
export type ComprimirComprobante = (archivo: File) => Promise<File>;

/**
 * Deja el comprobante en un MIME firmable por el contrato.
 *
 * @throws Error honesto si el resultado sigue siendo un MIME no firmable (PNG sin conversión).
 */
export async function prepararComprobanteParaSubida(
  archivo: File,
  comprimir: ComprimirComprobante = comprimirImagenAWebp
): Promise<File> {
  const preparado = await comprimir(archivo);
  if (!MIMES_COMPROBANTE_FIRMABLES.includes(preparado.type)) {
    throw new Error(MENSAJE_COMPROBANTE_FORMATO);
  }
  return preparado;
}

/** Opciones mínimas que este flujo usa del cliente HTTP de la app. */
export interface OpcionesApiComprobante {
  method?: string;
  body?: string;
}

/** Forma mínima de la respuesta del PUT (misma estructura que `Response`). */
export interface RespuestaSubidaComprobante {
  ok: boolean;
  status: number;
}

/** Colaboradores inyectables para testear el flujo sin red real. */
export interface DepsSubirComprobante {
  apiClient: <T>(endpoint: string, opciones: OpcionesApiComprobante) => Promise<T>;
  fetchFn: (url: string, init: RequestInit) => Promise<RespuestaSubidaComprobante>;
}

/**
 * Sube UN comprobante preparado y devuelve su `storageKey` SOLO en éxito.
 *
 * @throws Error si la presign no trae `uploadUrl`, si el PUT no es `ok` (con su status) o si la
 * presign no trae `storageKey`.
 */
export async function subirComprobantePago(
  archivoPreparado: File,
  alumnoId: string,
  deps: DepsSubirComprobante
): Promise<string> {
  const presign = await deps.apiClient<PresignedUploadUrlResponseDTO>(
    '/antropometria/presigned-upload-url',
    {
      method: 'POST',
      body: JSON.stringify({
        modulo: 'comprobantes',
        alumnoId,
        // El MIME REAL del archivo preparado: el mismo que firma la presign y el que viaja en el PUT.
        mimeType: archivoPreparado.type,
      }),
    }
  );

  if (!presign?.uploadUrl) {
    throw new Error(MENSAJE_COMPROBANTE_SIN_URL);
  }

  const respuesta = await deps.fetchFn(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': archivoPreparado.type },
    body: archivoPreparado,
  });

  if (!respuesta.ok) {
    throw new Error(mensajeComprobantePutFallido(respuesta.status));
  }

  if (!presign.storageKey) {
    throw new Error(MENSAJE_COMPROBANTE_SIN_CLAVE);
  }

  return presign.storageKey;
}
