/**
 * RF-003 RN-02 / RNF-001: fotos de control del check-in antropométrico (frontal, lateral y
 * posterior). Son OPCIONALES (decisión del dueño, 2026-10-08): el check-in se basa en las medidas.
 *
 * 1. `prepararFotoAntropometria`: WebP 1920px/85 % (fallback JPEG) antes de pedir la presign; un
 *    MIME que la presign no firma (p. ej. PNG sin conversión) falla con un mensaje honesto.
 * 2. `subirFotoAntropometria`: presign del módulo `antropometria` + PUT directo a la bóveda. Cada
 *    intento pide una presign nueva (la anterior pudo vencer) y solo devuelve la `storageKey` con
 *    el PUT confirmado. Fallos de red, de plazo o del almacenamiento (5xx) se reintentan hasta 3
 *    veces (esperas de 1 s y 2 s, RNF-001 §5); un rechazo del API o un PUT 4xx no. El PUT tiene
 *    su propio plazo (una red colgada no deja la foto "subiendo" para siempre) y se puede cancelar.
 */
import type { AnguloFoto, PresignedUploadUrlResponseDTO } from '@guachafit/shared';
import { ErrorTiempoAgotado } from './api-client';
import { ANGULOS_FOTO } from './comparador-fotos';
import { comprimirImagenAWebp } from './imagen-comprimida';

/** MIMEs que la presign de antropometría firma. */
const MIMES_FOTO_FIRMABLES: ReadonlyArray<string> = ['image/webp', 'image/jpeg'];

/** Plazo de la presign (ms): una red colgada cuenta como fallo reintentable. */
const TIEMPO_LIMITE_PRESIGN_MS = 15000;

/** Plazo de cada PUT a la bóveda (ms): una foto de ~600 KB en 4G tarda pocos segundos. */
const TIEMPO_LIMITE_PUT_MS = 30000;

/** Espera antes de cada reintento (ms). */
const ESPERAS_REINTENTO_MS = [1000, 2000];

/** Intentos totales de una subida: el primero más un reintento por cada espera. */
const MAX_INTENTOS = ESPERAS_REINTENTO_MS.length + 1;

export const MENSAJE_FOTO_FORMATO = 'No se pudo procesar la imagen. Prueba con una foto JPG o WebP.';
export const MENSAJE_FOTO_SIN_CONEXION =
  'No se pudo subir la foto: revisa tu conexión e inténtalo de nuevo.';
export const MENSAJE_FOTO_TIEMPO_AGOTADO =
  'No se pudo subir la foto: la conexión tardó demasiado. Inténtalo de nuevo.';
export const MENSAJE_FOTO_SIN_URL =
  'No se pudo subir la foto: el servidor no devolvió una URL de subida. Inténtalo de nuevo en unos minutos.';

/** PUT rechazado por la bóveda (4xx: p. ej. firma vencida o MIME distinto al firmado). */
export function mensajeFotoPutFallido(status: number): string {
  return `No se pudo subir la foto (${status}). Revisa tu conexión e inténtalo de nuevo.`;
}

/** La bóveda falló (5xx) en todos los intentos: no es un problema de la conexión del usuario. */
export function mensajeFotoAlmacenamiento(status: number): string {
  return `No se pudo subir la foto (${status}): el almacenamiento no respondió bien. Inténtalo de nuevo en unos minutos.`;
}

/** Deja la foto en un MIME firmable (WebP comprimido o JPEG). */
export async function prepararFotoAntropometria(
  archivo: File,
  comprimir: (archivo: File) => Promise<File> = comprimirImagenAWebp
): Promise<File> {
  const preparado = await comprimir(archivo);
  if (!MIMES_FOTO_FIRMABLES.includes(preparado.type)) {
    throw new Error(MENSAJE_FOTO_FORMATO);
  }
  return preparado;
}

/** Colaboradores inyectables (cliente HTTP de la app, `fetch` y la espera entre intentos). */
export interface DepsSubirFoto {
  apiClient: (
    endpoint: string,
    opciones: { method?: string; body?: string; tiempoLimiteMs?: number }
  ) => Promise<unknown>;
  fetchFn: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
  esperar?: (ms: number) => Promise<void>;
  /** Cancela la subida (p. ej. el usuario quitó la foto): se propaga un `AbortError` sin reintentar. */
  signal?: AbortSignal;
}

/** Fallo transitorio que vale la pena reintentar con una presign nueva. */
class FalloReintentable extends Error {}

function falloDeRed(error: unknown): FalloReintentable | null {
  if (error instanceof ErrorTiempoAgotado) return new FalloReintentable(MENSAJE_FOTO_TIEMPO_AGOTADO);
  if (error instanceof TypeError) return new FalloReintentable(MENSAJE_FOTO_SIN_CONEXION);
  return null;
}

function errorCancelado(): DOMException {
  return new DOMException('La subida de la foto se canceló.', 'AbortError');
}

/** PUT con plazo propio; la señal externa (cancelar) también lo corta. */
async function putConPlazo(
  url: string,
  archivo: File,
  deps: DepsSubirFoto
): Promise<{ ok: boolean; status: number }> {
  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, TIEMPO_LIMITE_PUT_MS);
  const alCancelar = () => controlador.abort();
  deps.signal?.addEventListener('abort', alCancelar, { once: true });
  try {
    return await deps.fetchFn(url, {
      method: 'PUT',
      headers: { 'Content-Type': archivo.type },
      body: archivo,
      signal: controlador.signal,
    });
  } catch (error) {
    if (deps.signal?.aborted) throw errorCancelado();
    if (vencido) throw new FalloReintentable(MENSAJE_FOTO_TIEMPO_AGOTADO);
    throw falloDeRed(error) ?? error;
  } finally {
    clearTimeout(temporizador);
    deps.signal?.removeEventListener('abort', alCancelar);
  }
}

async function intentarSubida(
  archivo: File,
  alumnoId: string,
  angulo: AnguloFoto,
  deps: DepsSubirFoto
): Promise<string> {
  let presign: PresignedUploadUrlResponseDTO;
  try {
    presign = (await deps.apiClient('/antropometria/presigned-upload-url', {
      method: 'POST',
      body: JSON.stringify({ modulo: 'antropometria', alumnoId, angulo, mimeType: archivo.type }),
      tiempoLimiteMs: TIEMPO_LIMITE_PRESIGN_MS,
    })) as PresignedUploadUrlResponseDTO;
  } catch (error) {
    throw falloDeRed(error) ?? error;
  }
  if (!presign?.uploadUrl || !presign.storageKey) {
    throw new Error(MENSAJE_FOTO_SIN_URL);
  }
  if (deps.signal?.aborted) throw errorCancelado();

  const respuesta = await putConPlazo(presign.uploadUrl, archivo, deps);
  if (respuesta.status >= 500) throw new FalloReintentable(mensajeFotoAlmacenamiento(respuesta.status));
  if (!respuesta.ok) throw new Error(mensajeFotoPutFallido(respuesta.status));
  return presign.storageKey;
}

/** Sube una foto preparada y devuelve su `storageKey` solo con el PUT confirmado. */
export async function subirFotoAntropometria(
  archivo: File,
  alumnoId: string,
  angulo: AnguloFoto,
  deps: DepsSubirFoto
): Promise<string> {
  const esperar = deps.esperar ?? ((ms) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  for (let intento = 1; ; intento += 1) {
    if (deps.signal?.aborted) throw errorCancelado();
    try {
      return await intentarSubida(archivo, alumnoId, angulo, deps);
    } catch (error) {
      if (!(error instanceof FalloReintentable)) throw error;
      // Agotados los intentos, el último fallo sale como un Error común con su mensaje.
      if (intento >= MAX_INTENTOS) throw new Error(error.message);
      await esperar(ESPERAS_REINTENTO_MS[intento - 1]);
    }
  }
}

/** Aviso de las fotos que faltan (recuerda que son opcionales); `null` si están las tres. */
export function avisoFotosFaltantes(faltantes: AnguloFoto[]): string | null {
  const nombres = ANGULOS_FOTO.filter((angulo) => faltantes.includes(angulo));
  if (nombres.length === 0) return null;
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return `Sin foto: ${lista}. Las fotos son opcionales: puedes enviar el check-in sin ellas.`;
}
