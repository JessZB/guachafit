/**
 * Compresión en cliente de fotos de platos (RF-002 RN-03, RNF-001, ADR-004).
 *
 * La foto capturada (una cámara moderna entrega 12–108 MP) se reduce a un WebP de lado mayor
 * máximo 1920px y calidad 85 % ANTES de pedir la presigned URL: el upload nunca mueve el
 * original de varios MB y la bóveda guarda un archivo liviano.
 *
 * Degradación honesta: si el navegador no puede decodificar la imagen se lanza un error visible
 * (nunca se declara subida una foto que no se pudo leer); si no soporta `canvas.toBlob`/WebP se
 * devuelve el archivo ORIGINAL en vez de fabricar un blob vacío.
 */

/** Lado mayor máximo del WebP comprimido (ADR-004: 1920px). */
export const LADO_MAXIMO_FOTO = 1920;

/** Calidad WebP de la compresión en cliente (ADR-004: 82–85 %). */
export const CALIDAD_WEBP = 0.85;

export interface DimensionesImagen {
  ancho: number;
  alto: number;
}

/**
 * Escala proporcional para que el lado mayor no exceda `ladoMaximo`. Una imagen ya pequeña se
 * devuelve intacta (nunca se amplía). Entradas no finitas o no positivas devuelven 0×0.
 */
export function calcularDimensionesEscaladas(
  ancho: number,
  alto: number,
  ladoMaximo: number = LADO_MAXIMO_FOTO
): DimensionesImagen {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ancho: 0, alto: 0 };
  }
  if (!Number.isFinite(ladoMaximo) || ladoMaximo <= 0) return { ancho: 0, alto: 0 };
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMaximo) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const factor = ladoMaximo / mayor;
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)) };
}

type FuenteImagen = ImageBitmap | HTMLImageElement;

/** Decodifica el archivo con `createImageBitmap` y cae al `<img>` clásico si no está disponible. */
async function decodificarImagen(archivo: File): Promise<FuenteImagen> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(archivo);
    } catch {
      // Formato no soportado por createImageBitmap: se intenta con el decodificador del DOM.
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolve(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen seleccionada. Prueba con otra foto.'));
    };
    imagen.src = url;
  });
}

function dimensionesFuente(fuente: FuenteImagen): DimensionesImagen {
  if ('naturalWidth' in fuente) {
    return { ancho: fuente.naturalWidth, alto: fuente.naturalHeight };
  }
  return { ancho: fuente.width, alto: fuente.height };
}

/**
 * Comprime una foto a WebP (máx. 1920px, calidad 85 %) y devuelve un `File` listo para subir.
 *
 * @throws Error legible si la imagen no se puede decodificar.
 */
export async function comprimirImagenAWebp(
  archivo: File,
  ladoMaximo: number = LADO_MAXIMO_FOTO,
  calidad: number = CALIDAD_WEBP
): Promise<File> {
  const fuente = await decodificarImagen(archivo);
  const original = dimensionesFuente(fuente);
  const { ancho, alto } = calcularDimensionesEscaladas(original.ancho, original.alto, ladoMaximo);

  if (ancho === 0 || alto === 0) {
    throw new Error('La imagen seleccionada no tiene dimensiones válidas.');
  }

  const soportaOffscreen = typeof OffscreenCanvas !== 'undefined';
  const lienzo: HTMLCanvasElement | OffscreenCanvas = soportaOffscreen
    ? new OffscreenCanvas(ancho, alto)
    : document.createElement('canvas');
  if (!soportaOffscreen) {
    (lienzo as HTMLCanvasElement).width = ancho;
    (lienzo as HTMLCanvasElement).height = alto;
  }

  const contexto = lienzo.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!contexto) {
    cerrarFuente(fuente);
    return archivo;
  }

  contexto.drawImage(fuente as CanvasImageSource, 0, 0, ancho, alto);
  cerrarFuente(fuente);

  const blob = await new Promise<Blob | null>((resolve) => {
    if (lienzo instanceof OffscreenCanvas) {
      lienzo.convertToBlob({ type: 'image/webp', quality: calidad }).then(resolve).catch(() => resolve(null));
    } else {
      (lienzo as HTMLCanvasElement).toBlob((resultado) => resolve(resultado), 'image/webp', calidad);
    }
  });

  // Un navegador sin codificador WebP (Safari) no devuelve `null`: entrega un PNG, como manda el
  // estándar. Solo un WebP real se acepta; cualquier otra cosa pasa al respaldo JPEG.
  const comprimido =
    blob?.type === 'image/webp' ? blob : await convertirAJpeg(lienzo, calidad);

  // Ni WebP ni JPEG disponibles: se sube el original (no se inventa un archivo vacío).
  if (!comprimido) return archivo;

  const nombreBase = archivo.name.replace(/\.[^.]+$/, '') || 'foto';
  const extension = comprimido.type === 'image/jpeg' ? 'jpg' : 'webp';
  return new File([comprimido], `${nombreBase}.${extension}`, {
    type: comprimido.type,
    lastModified: Date.now(),
  });
}

/** Fallback de codificación para navegadores sin WebP: JPEG a la misma calidad (ADR-004). */
async function convertirAJpeg(
  lienzo: HTMLCanvasElement | OffscreenCanvas,
  calidad: number
): Promise<Blob | null> {
  if (lienzo instanceof OffscreenCanvas) {
    try {
      return await lienzo.convertToBlob({ type: 'image/jpeg', quality: calidad });
    } catch {
      return null;
    }
  }
  return new Promise<Blob | null>((resolve) => {
    (lienzo as HTMLCanvasElement).toBlob((resultado) => resolve(resultado), 'image/jpeg', calidad);
  });
}

function cerrarFuente(fuente: FuenteImagen): void {
  if ('close' in fuente && typeof fuente.close === 'function') {
    fuente.close();
  }
}
