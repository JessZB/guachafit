/**
 * Miniaturas de las fotos de una toma pendiente (RN-04: auditar antes de aprobar).
 *
 * Recorte verbatim: cada miniatura abre el visor accesible con la foto y su fecha.
 * Componente presentacional: recibe el control y callbacks, no pide datos.
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { etiquetaAlumnoPendiente } from "../../../lib/antropometria-filtros";
import { etiquetaAngulo } from "../../../lib/comparador-fotos";
import { formatFechaCalendario } from "../../../lib/date-format";
import { Eye, ImageOff } from "lucide-react";

interface FotosTomaAntropometriaProps {
  control: ControlAntropometricoDetalleDTO;
  fotosConError: string[];
  onFotoError: (fotoId: string) => void;
  onVerFoto: (
    foto: ControlAntropometricoDetalleDTO["fotos"][number],
    fecha: string,
  ) => void;
}

export function FotosTomaAntropometria({
  control,
  fotosConError,
  onFotoError,
  onVerFoto,
}: FotosTomaAntropometriaProps) {
  if (control.fotos.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Fotos de la toma
      </span>
      <div className="flex flex-wrap gap-2">
        {control.fotos.map((foto) => {
          const fallo = fotosConError.includes(foto.id);
          const fechaCorta =
            formatFechaCalendario(control.fechaEvaluacion) ??
            control.fechaEvaluacion;
          return (
            <button
              key={foto.id}
              type="button"
              onClick={() => onVerFoto(foto, control.fechaEvaluacion)}
              aria-label={`Ver foto ${etiquetaAngulo(foto.angulo)} de ${etiquetaAlumnoPendiente(control)} del ${fechaCorta}`}
              className="relative w-20 sm:w-24 aspect-3/4 rounded-2xl overflow-hidden border border-border bg-secondary/40 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            >
              {foto.presignedGetUrl && !fallo ? (
                <img
                  src={foto.presignedGetUrl}
                  alt=""
                  loading="lazy"
                  onError={() => onFotoError(foto.id)}
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
        })}
      </div>
    </div>
  );
}
