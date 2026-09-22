/**
 * RF-004 RN-03: visor accesible de una foto de progreso.
 *
 * Reutiliza el patrón de diálogo del repo (`useDialogoAccesible`: Escape, trampa de Tab y
 * restauración del foco). Solo consume la URL presignada del DTO; si el enlace temporal venció,
 * lo declara y permite reintentar (nunca muestra una imagen rota en silencio).
 */
import React, { useState } from 'react';
import { Camera, ImageOff, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { FotoAntropometriaDetalleDTO } from '@guachafit/shared';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { formatFechaLargaCalendario } from '../../lib/date-format';
import { etiquetaAngulo } from '../../lib/comparador-fotos';

export interface VisorFotoProps {
  foto: FotoAntropometriaDetalleDTO;
  /** Fecha calendario `YYYY-MM-DD` del control al que pertenece la foto. */
  fecha: string;
  onCerrar: () => void;
}

export function VisorFoto({ foto, fecha, onCerrar }: VisorFotoProps) {
  const refDialogo = useDialogoAccesible({ onCerrar });
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const url = foto.presignedGetUrl ?? null;
  const fechaLarga = formatFechaLargaCalendario(fecha) ?? fecha;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-label={`Foto de progreso ${etiquetaAngulo(foto.angulo)} del ${fechaLarga}`}
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl p-4 space-y-3 focus:outline-hidden"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-base text-foreground">
              Perspectiva {etiquetaAngulo(foto.angulo)}
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
              alt={`Foto de progreso ${etiquetaAngulo(foto.angulo)} del ${fechaLarga}`}
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
