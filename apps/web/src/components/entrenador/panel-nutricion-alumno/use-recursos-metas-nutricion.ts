/**
 * Recursos educativos del editor de metas (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: filas del editor y subida
 * del PDF con presign + PUT reales. La validación es real (MIME/extensión,
 * tamaño y firma `%PDF-` del contenido) antes de pedir la URL firmada. En modo
 * demo la subida se simula localmente y se declara; nunca viaja a la API.
 */
import { useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import {
  filaRecursoVacia,
  tieneFirmaPdf,
  validarArchivoPdf,
  type FilaRecursoFormulario,
} from '../../../lib/recursos-pdf';
import {
  MENSAJE_SUBIDA_PDF_FALLIDA,
  mensajeErrorSubidaPdf,
} from '../../../lib/editor-metas-nutricion';
import type { PresignedUploadUrlResponseDTO } from '@guachafit/shared';

export function useRecursosMetasNutricion({
  alumnoUsuarioId,
  isDemoMode,
}: {
  alumnoUsuarioId: string;
  isDemoMode: boolean;
}) {
  const [recursos, setRecursos] = useState<FilaRecursoFormulario[]>([]);

  /** Actualiza una fila del editor sin tocar las demás. */
  const actualizarFilaRecurso = (indice: number, cambios: Partial<FilaRecursoFormulario>) => {
    setRecursos((previos) =>
      previos.map((item, i) => (i === indice ? { ...item, ...cambios } : item))
    );
  };

  const anadirRecurso = () => setRecursos((previos) => [...previos, filaRecursoVacia()]);

  /**
   * Quita el recurso de la lista del editor. Si era un PDF ya guardado, el archivo se borra para
   * siempre al guardar (la API elimina los PDFs que el reemplazo deja sin referencia); por eso
   * el guardado pide confirmación antes de enviar.
   */
  const quitarRecurso = (indice: number) =>
    setRecursos((previos) => previos.filter((_, i) => i !== indice));

  const fijarRecursos = (filas: FilaRecursoFormulario[]) => setRecursos(filas);

  /**
   * RF-002 RN-01 / RNF-001: sube el PDF elegido con presign + PUT reales. La validación es
   * real (MIME/extensión, tamaño y firma `%PDF-` del contenido) antes de pedir la URL firmada.
   */
  const subirPdf = async (indice: number, archivo: File | null | undefined) => {
    if (!archivo) return;

    const errorFormato = validarArchivoPdf(archivo);
    if (errorFormato) {
      actualizarFilaRecurso(indice, { errorSubida: errorFormato });
      return;
    }
    if (!(await tieneFirmaPdf(archivo))) {
      actualizarFilaRecurso(indice, {
        errorSubida: 'El archivo no parece un PDF válido. Elige otro archivo.',
      });
      return;
    }

    actualizarFilaRecurso(indice, { subiendo: true, errorSubida: null });

    // MODO DEMO: la subida se simula localmente y se declara; nunca viaja a la API.
    if (isDemoMode) {
      const previewUrl = URL.createObjectURL(archivo);
      actualizarFilaRecurso(indice, {
        subiendo: false,
        storageKey: `nutricion-recursos/${alumnoUsuarioId}/2026/${crypto.randomUUID()}.pdf`,
        nombreArchivo: archivo.name,
        url: previewUrl,
      });
      return;
    }

    try {
      const presigned = await apiClient<PresignedUploadUrlResponseDTO>(
        '/antropometria/presigned-upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            modulo: 'nutricion-recursos',
            alumnoId: alumnoUsuarioId,
            mimeType: 'application/pdf',
          }),
        }
      );

      const respuesta = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: archivo,
      });
      if (!respuesta.ok) {
        actualizarFilaRecurso(indice, { subiendo: false, errorSubida: MENSAJE_SUBIDA_PDF_FALLIDA });
        return;
      }

      actualizarFilaRecurso(indice, {
        subiendo: false,
        errorSubida: null,
        storageKey: presigned.storageKey,
        nombreArchivo: archivo.name,
        url: '',
      });
    } catch (err: unknown) {
      actualizarFilaRecurso(indice, { subiendo: false, errorSubida: mensajeErrorSubidaPdf(err) });
    }
  };

  return {
    recursos,
    fijarRecursos,
    actualizarFilaRecurso,
    anadirRecurso,
    quitarRecurso,
    subirPdf,
  };
}
