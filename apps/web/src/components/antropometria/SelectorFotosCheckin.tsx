import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, X } from 'lucide-react';
import { AnguloFoto, type FotoAntropometriaInputDTO } from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import {
  avisoFotosFaltantes,
  prepararFotoAntropometria,
  subirFotoAntropometria,
} from '../../lib/antropometria-fotos';
import { ANGULOS_FOTO as ANGULOS, etiquetaAngulo } from '../../lib/comparador-fotos';

type EstadoFoto =
  | { estado: 'vacia' }
  | { estado: 'subiendo'; archivo: File; vista: string }
  | { estado: 'lista'; archivo: File; vista: string; storageKey: string }
  | { estado: 'error'; archivo: File; vista: string; mensaje: string };

type Fotos = Record<AnguloFoto, EstadoFoto>;

const FOTOS_VACIAS: Fotos = {
  [AnguloFoto.FRONTAL]: { estado: 'vacia' },
  [AnguloFoto.LATERAL]: { estado: 'vacia' },
  [AnguloFoto.POSTERIOR]: { estado: 'vacia' },
};

/**
 * RF-003 RN-02: fotos de control del check-in (frontal, lateral y posterior), OPCIONALES. Cada
 * foto se sube al elegirla (comprimida, con reintentos) y el formulario recibe por `onCambio` las
 * claves listas y si hay alguna subida en curso (para no enviar el check-in a medias). Una foto en
 * subida se puede quitar: la subida se cancela.
 *
 * Para montar el selector vacío de nuevo (tras enviar), el padre cambia su `key`.
 */
export function SelectorFotosCheckin({
  alumnoId,
  onCambio,
  deshabilitado = false,
  subir,
}: {
  alumnoId: string;
  onCambio: (estado: { fotos: FotoAntropometriaInputDTO[]; subiendo: boolean }) => void;
  deshabilitado?: boolean;
  /** Inyectable en pruebas; por defecto comprime la foto y la sube a la bóveda. */
  subir?: (archivo: File, angulo: AnguloFoto, signal?: AbortSignal) => Promise<string>;
}) {
  const [fotos, setFotos] = useState<Fotos>(FOTOS_VACIAS);
  // Solo la subida más reciente de cada ángulo escribe su resultado.
  const turnosRef = useRef<Record<string, number>>({});
  const cancelacionesRef = useRef<Record<string, AbortController>>({});
  const vistasRef = useRef<Set<string>>(new Set());

  const subirFoto =
    subir ??
    (async (archivo: File, angulo: AnguloFoto, signal?: AbortSignal) =>
      subirFotoAntropometria(await prepararFotoAntropometria(archivo), alumnoId, angulo, {
        apiClient,
        fetchFn: (url, init) => fetch(url, init),
        signal,
      }));

  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => {
    const listas: FotoAntropometriaInputDTO[] = [];
    let subiendo = false;
    for (const angulo of ANGULOS) {
      const foto = fotos[angulo];
      if (foto.estado === 'lista') listas.push({ angulo, storageKey: foto.storageKey });
      if (foto.estado === 'subiendo') subiendo = true;
    }
    onCambioRef.current({ fotos: listas, subiendo });
  }, [fotos]);

  // Al desmontar se cancelan las subidas en curso y se liberan las vistas previas locales.
  useEffect(() => {
    const vistas = vistasRef.current;
    const cancelaciones = cancelacionesRef.current;
    return () => {
      Object.values(cancelaciones).forEach((controlador) => controlador.abort());
      vistas.forEach((vista) => URL.revokeObjectURL(vista));
    };
  }, []);

  const cancelarSubida = (angulo: AnguloFoto) => {
    cancelacionesRef.current[angulo]?.abort();
    delete cancelacionesRef.current[angulo];
  };

  const liberarVista = (foto: EstadoFoto) => {
    if (foto.estado === 'vacia') return;
    URL.revokeObjectURL(foto.vista);
    vistasRef.current.delete(foto.vista);
  };

  const iniciarSubida = (angulo: AnguloFoto, archivo: File, vista: string) => {
    const turno = (turnosRef.current[angulo] ?? 0) + 1;
    turnosRef.current[angulo] = turno;
    cancelarSubida(angulo);
    const controlador = new AbortController();
    cancelacionesRef.current[angulo] = controlador;
    setFotos((previas) => ({ ...previas, [angulo]: { estado: 'subiendo', archivo, vista } }));
    subirFoto(archivo, angulo, controlador.signal).then(
      (storageKey) => {
        if (turnosRef.current[angulo] !== turno) return;
        setFotos((previas) => ({ ...previas, [angulo]: { estado: 'lista', archivo, vista, storageKey } }));
      },
      (error: unknown) => {
        if (turnosRef.current[angulo] !== turno) return;
        const mensaje = error instanceof Error && error.message ? error.message : 'No se pudo subir la foto.';
        setFotos((previas) => ({ ...previas, [angulo]: { estado: 'error', archivo, vista, mensaje } }));
      }
    );
  };

  const elegir = (angulo: AnguloFoto, archivo: File | undefined) => {
    if (!archivo) return;
    liberarVista(fotos[angulo]);
    const vista = URL.createObjectURL(archivo);
    vistasRef.current.add(vista);
    iniciarSubida(angulo, archivo, vista);
  };

  const quitar = (angulo: AnguloFoto) => {
    turnosRef.current[angulo] = (turnosRef.current[angulo] ?? 0) + 1;
    cancelarSubida(angulo);
    liberarVista(fotos[angulo]);
    setFotos((previas) => ({ ...previas, [angulo]: { estado: 'vacia' } }));
  };

  // Una foto que se está subiendo no se anuncia como faltante.
  const faltantes = ANGULOS.filter(
    (angulo) => fotos[angulo].estado === 'vacia' || fotos[angulo].estado === 'error'
  );
  const aviso = avisoFotosFaltantes(faltantes);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ANGULOS.map((angulo) => {
          const foto = fotos[angulo];
          const nombre = etiquetaAngulo(angulo).toLowerCase();
          const subiendo = foto.estado === 'subiendo';
          return (
            <div key={angulo} className="p-3 rounded-2xl bg-secondary/40 border border-border space-y-2">
              <p className="text-xs font-bold text-foreground">{etiquetaAngulo(angulo)}</p>

              {foto.estado !== 'vacia' && (
                <img
                  src={foto.vista}
                  alt={foto.estado === 'lista' ? `Foto ${nombre} lista` : `Foto ${nombre} elegida`}
                  className={`w-full aspect-[3/4] object-cover rounded-xl ${foto.estado === 'lista' ? '' : 'opacity-60'}`}
                />
              )}

              {subiendo && (
                <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Subiendo…
                </p>
              )}

              {foto.estado === 'error' && (
                <div className="space-y-2">
                  <p role="alert" className="text-xs font-semibold text-destructive">
                    {foto.mensaje}
                  </p>
                  <button
                    type="button"
                    onClick={() => iniciarSubida(angulo, foto.archivo, foto.vista)}
                    disabled={deshabilitado}
                    aria-label={`Reintentar foto ${nombre}`}
                    className="min-h-11 w-full px-3 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-secondary/80 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reintentar
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <label
                  className={`min-h-11 flex-1 px-3 rounded-xl border border-dashed border-border text-xs font-bold flex items-center justify-center gap-1.5 ${
                    deshabilitado || subiendo
                      ? 'opacity-60 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-secondary focus-within:ring-2 focus-within:ring-primary'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {foto.estado === 'vacia' ? 'Elegir' : 'Cambiar'}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={`Foto ${nombre}`}
                    disabled={deshabilitado || subiendo}
                    className="sr-only"
                    onChange={(evento) => {
                      elegir(angulo, evento.target.files?.[0]);
                      // Permite volver a elegir el mismo archivo después de quitarlo.
                      evento.target.value = '';
                    }}
                  />
                </label>
                {foto.estado !== 'vacia' && (
                  <button
                    type="button"
                    onClick={() => quitar(angulo)}
                    disabled={deshabilitado}
                    aria-label={`Quitar foto ${nombre}`}
                    className="min-h-11 min-w-11 rounded-xl bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 disabled:opacity-60 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {aviso}
      </p>
    </div>
  );
}
