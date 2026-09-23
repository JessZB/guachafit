/**
 * RF-002 RN-01: reglas de los recursos educativos del coach cuando el recurso es un PDF subido
 * a la bóveda (RNF-001). El editor de metas (`PanelNutricionAlumno`) delega aquí la validación
 * de archivos y la construcción del payload, para que la UI no duplique el contrato compartido.
 *
 * Persistencia honesta: cada recurso declara UNA fuente (URL externa o `storageKey` del PDF
 * subido). Nunca se fabrica una URL: si la API no puede firmar la lectura, `url` llega `null`
 * y la vista lo declara.
 */
import type { RecursoNutricionalDTO } from '@guachafit/shared';

export const LIMITE_RECURSOS_EDUCATIVOS = 10;
export const TAMANO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;
export const MIME_PDF = 'application/pdf';

const FIRMA_PDF = '%PDF-';
const CARGA_FIRMA_BYTES = 1024;

export interface FilaRecursoFormulario {
  titulo: string;
  /** Enlace externo (https). Excluyente con `storageKey`. */
  url: string;
  /** Clave de la bóveda del PDF ya subido. Excluyente con `url`. */
  storageKey: string;
  /** Nombre del archivo subido, solo para la etiqueta del editor. */
  nombreArchivo: string | null;
  /** Estado de subida del archivo (presign + PUT). */
  subiendo: boolean;
  /** Error honesto de la última subida fallida. */
  errorSubida: string | null;
}

export function filaRecursoVacia(): FilaRecursoFormulario {
  return {
    titulo: '',
    url: '',
    storageKey: '',
    nombreArchivo: null,
    subiendo: false,
    errorSubida: null,
  };
}

export function esFilaRecursoVacia(fila: FilaRecursoFormulario): boolean {
  return (
    fila.titulo.trim() === '' &&
    fila.url.trim() === '' &&
    fila.storageKey.trim() === '' &&
    !fila.subiendo
  );
}

/** Mensaje de error si el archivo no es un PDF razonable; `null` si es válido. */
export function validarArchivoPdf(archivo: { name: string; type: string; size: number }): string | null {
  const nombre = (archivo.name ?? '').toLowerCase();
  const tipoDeclarado = (archivo.type ?? '').toLowerCase();
  const mensajeFormato = 'Formato inválido: los recursos educativos deben ser PDF.';

  if (tipoDeclarado !== '' && tipoDeclarado !== MIME_PDF) return mensajeFormato;
  if (!nombre.endsWith('.pdf')) return mensajeFormato;
  if (archivo.size <= 0) return 'El archivo está vacío. Elige otro PDF.';
  if (archivo.size > TAMANO_MAXIMO_PDF_BYTES) {
    return 'El PDF supera el máximo de 10 MB. Comprímelo o divídelo antes de subirlo.';
  }
  return null;
}

/**
 * Verifica la firma real del archivo (`%PDF-`) en la cabecera: la extensión por sí sola no
 * demuestra que el archivo sea un PDF de verdad.
 */
export async function tieneFirmaPdf(archivo: Blob): Promise<boolean> {
  const cabecera = await archivo.slice(0, CARGA_FIRMA_BYTES).text();
  // El estándar permite bytes previos a la cabecera; se busca la firma en el arranque del blob.
  return cabecera.toUpperCase().includes(FIRMA_PDF);
}

/**
 * Filas del editor → payload del contrato (`RecursoNutricionalDTO[]`).
 * - Las filas completamente vacías se ignoran.
 * - Si hay `storageKey` (PDF subido) se envía solo la clave; si no, la URL externa.
 * - Una fila con título pero sin fuente viaja sin fuente a propósito: el contrato compartido
 *   (`MetasNutricionalesSchema`) la rechaza con mensaje claro antes de tocar la API.
 */
export function construirRecursosParaGuardar(
  filas: FilaRecursoFormulario[]
): RecursoNutricionalDTO[] {
  const recursos: RecursoNutricionalDTO[] = [];

  for (const fila of filas) {
    const titulo = fila.titulo.trim();
    const url = fila.url.trim();
    const storageKey = fila.storageKey.trim();

    if (titulo === '' && url === '' && storageKey === '') continue;

    if (storageKey !== '') {
      recursos.push({ titulo, storageKey });
    } else if (url !== '') {
      recursos.push({ titulo, url });
    } else {
      recursos.push({ titulo });
    }
  }

  return recursos;
}
