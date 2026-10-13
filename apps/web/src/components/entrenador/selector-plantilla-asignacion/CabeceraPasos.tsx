/**
 * Cabecera del selector: título, alumno, botón de cierre y paso actual
 * con su barra de progreso.
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 */
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { PASOS_ASIGNACION, textoPaso, type PasoAsignacion } from '../../../lib/asignacion-pasos';

export function CabeceraPasos({
  alumnoNombre,
  paso,
  indicePaso,
  tituloRef,
  onCerrar,
}: {
  alumnoNombre: string;
  paso: PasoAsignacion;
  indicePaso: number;
  tituloRef: RefObject<HTMLParagraphElement | null>;
  onCerrar: () => void;
}) {
  return (
    <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/80 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="modal-plantilla-asignar-title" className="text-lg font-bold text-foreground">
            Cargar desde plantilla
          </h2>
          <p className="text-sm text-muted-foreground break-words">Para {alumnoNombre}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Cerrar selector de plantilla"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-1.5">
        <p
          ref={tituloRef}
          tabIndex={-1}
          aria-live="polite"
          aria-atomic="true"
          className="text-sm font-semibold text-foreground focus:outline-hidden"
        >
          {textoPaso(paso)}
        </p>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
          {PASOS_ASIGNACION.map((p, i) => (
            <span
              key={p}
              className={`h-1.5 rounded-full ${i <= indicePaso ? 'bg-primary' : 'bg-secondary'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
