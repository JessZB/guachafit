/**
 * Miniatura de foto antropométrica con fallback y overlay (SL4, fase B).
 *
 * De `ProgresoPage.tsx:1129-1160`: botón con `aria-label` "Ver foto …",
 * imagen o "Sin imagen" (`ImageOff`) y overlay del ángulo. `aria-label` y
 * fallback idénticos (R5). Matriz 48 fila 19: markup casi idéntico en
 * `AntropometriaPage.tsx:468-497` → se deja como guía de D (R6: B no toca
 * otro módulo); este archivo queda como referencia de promoción.
 * Presentacional: props tipadas y callbacks, sin datos (R1).
 * §6: foco visible, 11px mínimo.
 */
import { Eye, ImageOff } from 'lucide-react';
import { etiquetaAngulo } from '../../../lib/comparador-fotos';
import { formatFechaCalendario } from '../../../lib/date-format';
import type { FotoAntropometriaDetalleDTO } from '@guachafit/shared';

interface MiniaturaFotoProgresoProps {
  foto: FotoAntropometriaDetalleDTO;
  fechaEvaluacion: string;
  conFallo: boolean;
  onVer: () => void;
  onErrorImagen: () => void;
}

export function MiniaturaFotoProgreso({
  foto,
  fechaEvaluacion,
  conFallo,
  onVer,
  onErrorImagen,
}: MiniaturaFotoProgresoProps) {
  const fechaCorta = formatFechaCalendario(fechaEvaluacion) ?? fechaEvaluacion;
  return (
    <button
      type="button"
      onClick={onVer}
      aria-label={`Ver foto ${etiquetaAngulo(foto.angulo)} del ${fechaCorta}`}
      className="relative w-20 sm:w-24 aspect-3/4 rounded-2xl overflow-hidden border border-border bg-secondary/40 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
    >
      {foto.presignedGetUrl && !conFallo ? (
        <img
          src={foto.presignedGetUrl}
          alt=""
          loading="lazy"
          onError={onErrorImagen}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          <span className="text-[11px] font-semibold">Sin imagen</span>
        </span>
      )}
      <span className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur px-1.5 py-1 text-[11px] font-bold text-foreground flex items-center justify-center gap-1">
        <Eye className="h-3 w-3" />
        {etiquetaAngulo(foto.angulo)}
      </span>
    </button>
  );
}
