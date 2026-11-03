/**
 * Hook del comprobante del reporte de pago (RF-007, D2/ADR-007). Extraído de `use-reporte-pago.ts`:
 * selección y validación del archivo (MIME/5MB + preview) y subida con la clave en caché, para no
 * repetir la subida si el envío del reporte falla después. `alCambiarComprobante` permite al hook
 * padre renovar su clave de idempotencia cuando el comprobante cambia.
 */
import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { apiClient } from '../../../lib/api-client';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../../lib/comprobante-pago';
import { validarArchivoComprobante } from '../../../lib/pagos-montos';

const MENSAJE_SESION_NO_IDENTIFICADA =
  'No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.';

export interface EstadoComprobantePago {
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  previewUrl: string | null;
  errorArchivo: string | null;
  setErrorArchivo: (error: string | null) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: () => void;
  /** Clave del comprobante ya subido (o la sube); lanza con el mensaje a mostrar si falla. */
  asegurarComprobanteSubido: (userId: string | undefined) => Promise<string>;
}

export function useComprobantePago(alCambiarComprobante: () => void): EstadoComprobantePago {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const comprobanteSubidoKeyRef = useRef<string | null>(null);

  const handleRemoveFile = () => {
    alCambiarComprobante();
    comprobanteSubidoKeyRef.current = null;
    setSelectedFile(null);
    setErrorArchivo(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    comprobanteSubidoKeyRef.current = null;

    const errSeleccion = validarArchivoComprobante(file);
    if (errSeleccion) {
      handleRemoveFile();
      setErrorArchivo(errSeleccion);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setErrorArchivo(null);
    alCambiarComprobante();
    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setPreviewUrl(objUrl);
  };

  const asegurarComprobanteSubido = async (userId: string | undefined): Promise<string> => {
    if (comprobanteSubidoKeyRef.current) return comprobanteSubidoKeyRef.current;
    if (!userId || !selectedFile) throw new Error(MENSAJE_SESION_NO_IDENTIFICADA);
    try {
      // D2/ADR-007: la imagen se prepara (WebP/JPEG) ANTES de firmar; la presign y el PUT llevan
      // el MISMO MIME y la subida solo se da por buena con `respuesta.ok`. Sin clave no hay reporte.
      const archivoPreparado = await prepararComprobanteParaSubida(selectedFile);
      const clave = await subirComprobantePago(archivoPreparado, userId, {
        apiClient,
        fetchFn: fetch,
      });
      comprobanteSubidoKeyRef.current = clave;
      return clave;
    } catch (err: any) {
      // D2: sin storageKey fabricado; si el comprobante no se pudo subir, el reporte no se envía.
      throw new Error(
        err?.message || 'No se pudo subir el comprobante. Revisa tu conexión e inténtalo de nuevo.'
      );
    }
  };

  return {
    fileInputRef,
    selectedFile,
    previewUrl,
    errorArchivo,
    setErrorArchivo,
    handleFileChange,
    handleRemoveFile,
    asegurarComprobanteSubido,
  };
}
