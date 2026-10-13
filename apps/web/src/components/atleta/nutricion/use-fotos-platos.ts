/**
 * Módulo 6 · Nutrición: fotos de platos RN-03 (hook de datos, R9).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL3, fase B): selección/compresión/previews
 * con tope de 4, presign `comidas` + PUT a la bóveda con progreso incremental, y el visor.
 * §6: previews como object URLs liberados al quitar y al desmontar; error con `role="alert"`
 * (lo rinde `DiarioFotografico`).
 */
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { apiClient } from '../../../lib/api-client';
import { comprimirImagenAWebp } from '../../../lib/imagen-comprimida';
import {
  MAX_FOTOS_CHECKIN_NUTRICIONAL,
  MIME_PERMITIDO_PRESIGN,
  esMimeSelectorValido,
  type FotoPlatoSeleccionada,
} from '../../../lib/nutricion-fotos';
import {
  MENSAJE_ERROR_SUBIDA_FOTO,
  MENSAJE_FOTOS_MAXIMO_ALCANZADO,
  MENSAJE_FOTOS_RECORTADAS,
} from '../../../lib/nutricion-checkin';
import { TipoComida, type FotoComidaDetalleDTO, type PresignedUploadUrlResponseDTO } from '@guachafit/shared';

export interface FotosPlatos {
  fotos: FotoPlatoSeleccionada[];
  isProcesandoFotos: boolean;
  fotosError: string | null;
  setFotosError: (mensaje: string | null) => void;
  fotoVisor: { foto: FotoComidaDetalleDTO; fecha: string } | null;
  setFotoVisor: (visor: { foto: FotoComidaDetalleDTO; fecha: string } | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  agregarFotos: (archivos: FileList | null) => Promise<void>;
  quitarFoto: (id: string) => void;
  cambiarTipoComida: (id: string, tipo: TipoComida) => void;
  /** La evidencia ya está a salvo en la cola: libera previews y vacía la selección. */
  vaciarFotos: () => void;
  subirFotosDePlatos: (
    fotos: FotoPlatoSeleccionada[],
    claves?: Map<string, string>
  ) => Promise<Map<string, string>>;
}

export function useFotosPlatos(alumnoId: string | undefined): FotosPlatos {
  // RN-03: fotos de platos elegidas (comprimidas en cliente) y estado de su subida presignada.
  const [fotos, setFotos] = useState<FotoPlatoSeleccionada[]>([]);
  const [isProcesandoFotos, setIsProcesandoFotos] = useState(false);
  const [fotosError, setFotosError] = useState<string | null>(null);
  const [fotoVisor, setFotoVisor] = useState<{ foto: FotoComidaDetalleDTO; fecha: string } | null>(
    null
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fotosRef = useRef<FotoPlatoSeleccionada[]>([]);
  fotosRef.current = fotos;

  // Las vistas previas son object URLs: se liberan al desmontar la pantalla.
  useEffect(() => {
    return () => {
      fotosRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
    };
  }, []);

  const agregarFotos = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    setFotosError(null);

    const espacioDisponible = MAX_FOTOS_CHECKIN_NUTRICIONAL - fotos.length;
    if (espacioDisponible <= 0) {
      setFotosError(MENSAJE_FOTOS_MAXIMO_ALCANZADO);
      return;
    }

    const seleccionados = Array.from(archivos).slice(0, espacioDisponible);
    if (archivos.length > espacioDisponible) {
      setFotosError(MENSAJE_FOTOS_RECORTADAS);
    }

    setIsProcesandoFotos(true);
    try {
      const nuevas: FotoPlatoSeleccionada[] = [];
      for (const archivo of seleccionados) {
        if (!esMimeSelectorValido(archivo.type)) {
          throw new Error('Formato inválido: elige una foto JPG, PNG o WebP.');
        }
        // RN-03/RNF-001: la compresión ocurre en el dispositivo ANTES de pedir la presigned URL.
        const comprimida = await comprimirImagenAWebp(archivo);
        if (!MIME_PERMITIDO_PRESIGN.includes(comprimida.type)) {
          throw new Error(
            'No pudimos optimizar esta foto en tu navegador. Prueba con una imagen JPG o WebP.'
          );
        }
        nuevas.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tipoComida: TipoComida.ALMUERZO,
          archivo: comprimida,
          previewUrl: URL.createObjectURL(comprimida),
        });
      }
      setFotos((previas) => [...previas, ...nuevas]);
    } catch (err: unknown) {
      setFotosError(
        err instanceof Error ? err.message : 'No se pudieron procesar las fotos seleccionadas.'
      );
    } finally {
      setIsProcesandoFotos(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const quitarFoto = (id: string) => {
    setFotosError(null);
    setFotos((previas) => {
      const foto = previas.find((item) => item.id === id);
      if (foto) URL.revokeObjectURL(foto.previewUrl);
      return previas.filter((item) => item.id !== id);
    });
  };

  const cambiarTipoComida = (id: string, tipo: TipoComida) => {
    setFotos((previas) =>
      previas.map((item) => (item.id === id ? { ...item, tipoComida: tipo } : item))
    );
  };

  /** La evidencia ya está a salvo en la cola: se limpia la selección y su memoria de previews. */
  const vaciarFotos = () => {
    fotosRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
    setFotos([]);
    setFotosError(null);
  };

  /**
   * Sube cada foto comprimida a la bóveda y devuelve el mapa foto→storageKey. `claves` se
   * actualiza tras CADA subida: si una foto posterior falla por red, el progreso ya conseguido
   * viaja a la cola (el reintento no vuelve a subir esas fotos).
   */
  const subirFotosDePlatos = async (
    fotosASubir: FotoPlatoSeleccionada[],
    claves: Map<string, string> = new Map()
  ): Promise<Map<string, string>> => {
    if (!alumnoId) {
      throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
    }
    for (const foto of fotosASubir) {
      const presigned = await apiClient<PresignedUploadUrlResponseDTO>(
        '/antropometria/presigned-upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            modulo: 'comidas',
            alumnoId,
            mimeType: foto.archivo.type,
          }),
        }
      );
      const respuesta = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': foto.archivo.type },
        body: foto.archivo,
      });
      if (!respuesta.ok) {
        // Sin `status` HTTP: offline-sync lo trata como fallo de red y la evidencia se encola.
        throw new Error(MENSAJE_ERROR_SUBIDA_FOTO);
      }
      claves.set(foto.id, presigned.storageKey);
    }
    return claves;
  };

  return {
    fotos,
    isProcesandoFotos,
    fotosError,
    setFotosError,
    fotoVisor,
    setFotoVisor,
    inputRef,
    agregarFotos,
    quitarFoto,
    cambiarTipoComida,
    vaciarFotos,
    subirFotosDePlatos,
  };
}
