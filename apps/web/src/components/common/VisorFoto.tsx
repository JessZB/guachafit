/**
 * RF-004 RN-03 / RF-002 RN-03: visor accesible de una foto privada (progreso corporal o plato).
 *
 * Reutiliza el patrón de diálogo del repo (`useDialogoAccesible`: Escape, trampa de Tab y
 * restauración del foco). Solo consume la URL presignada del DTO; si el enlace temporal venció,
 * lo declara y permite reintentar (nunca muestra una imagen rota en silencio).
 */
import React, { useState } from 'react';
import { Camera, ImageOff, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { FotoAntropometriaDetalleDTO, FotoComidaDetalleDTO } from '@guachafit/shared';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { formatFechaLargaCalendario } from '../../lib/date-format';
import { etiquetaAngulo } from '../../lib/comparador-fotos';
import { etiquetaTipoComida } from '../../lib/nutricion-metas';

/** Cualquiera de las fotos privadas de la bóveda que el visor sabe mostrar. */
export type FotoVisor = FotoAntropometriaDetalleDTO | FotoComidaDetalleDTO;

export interface VisorFotoProps {
  foto: FotoVisor;
  /** Fecha calendario `YYYY-MM-DD` de la toma. */
  fecha: string;
  onCerrar: () => void;
  /** Etiqueta de la toma; por defecto el ángulo (progreso) o la comida (plato). */
  etiqueta?: string;
}

function esFotoCorporal(foto: FotoVisor): foto is FotoAntropometriaDetalleDTO {
  return 'angulo' in foto;
}

/** URL firmada de la foto, según el contrato de cada origen. */
function urlDeFoto(foto: FotoVisor): string | null {
  return esFotoCorporal(foto) ? foto.presignedGetUrl ?? null : foto.fotoUrl ?? null;
}

function etiquetaDeFoto(foto: FotoVisor, etiqueta?: string): string {
  if (etiqueta) return etiqueta;
  return esFotoCorporal(foto) ? etiquetaAngulo(foto.angulo) : etiquetaTipoComida(foto.tipoComida);
}

export function VisorFoto({ foto, fecha, onCerrar, etiqueta }: VisorFotoProps) {
  const refDialogo = useDialogoAccesible({ onCerrar });
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const url = urlDeFoto(foto);
  const fechaLarga = formatFechaLargaCalendario(fecha) ?? fecha;
  const corporal = esFotoCorporal(foto);
  const descripcion = corporal ? 'Foto de progreso' : 'Foto del plato';
  const tituloToma = etiquetaDeFoto(foto, etiqueta);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-label={`${descripcion} ${tituloToma} del ${fechaLarga}`}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl p-4 space-y-3 focus:outline-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-foreground">
              {corporal ? `Perspectiva ${tituloToma}` : tituloToma}
            </h3>
            <p className="text-xs text-muted-foreground">{fechaLarga}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar foto"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-3/4 max-h-[62vh] rounded-2xl overflow-hidden bg-background/60 border border-border">
          {url && !fallo ? (
            <img
              key={intento}
              src={url}
              alt={`${descripcion} ${tituloToma} del ${fechaLarga}`}
              onError={() => setFallo(true)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-2">
              {fallo ? (
                <>
                  <ImageOff className="h-10 w-10 text-warning" />
                  <p className="text-xs font-bold text-foreground">El enlace temporal venció</p>
                  <p className="text-[11px] text-muted-foreground">
                    Las fotos se sirven con URLs firmadas de 15 minutos. Recarga la página para
                    obtener un enlace nuevo.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFallo(false);
                      setIntento((n) => n + 1);
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 min-h-11 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reintentar</span>
                  </button>
                </>
              ) : (
                <>
                  <Camera className="h-10 w-10 text-muted-foreground opacity-40" />
                  <p className="text-xs font-semibold text-muted-foreground">
                    Esta toma no tiene imagen disponible
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Foto privada: se muestra con un enlace temporal seguro.</span>
        </p>
      </div>
    </div>
  );
}
