/**
 * Paso actual del formulario de asignación ("Paso N de 3 · Título", enfocable y anunciado)
 * con su barra de progreso. Lo comparten la asignación individual (`CabeceraPasos`) y la
 * masiva (lote E10). Presentacional.
 */
import type { RefObject } from 'react';
import { PASOS_ASIGNACION, textoPaso, type PasoAsignacion } from '../../../lib/asignacion-pasos';

export function IndicadorPasos({
  paso,
  pasos = PASOS_ASIGNACION,
  indicePaso,
  tituloRef,
}: {
  paso: PasoAsignacion;
  /** Pasos del flujo (por defecto, los de la asignación individual). */
  pasos?: readonly PasoAsignacion[];
  indicePaso: number;
  tituloRef: RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <div className="space-y-1.5">
      <p
        ref={tituloRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="text-sm font-semibold text-foreground focus:outline-hidden"
      >
        {textoPaso(paso, pasos)}
      </p>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {pasos.map((p, i) => (
          <span
            key={p}
            className={`h-1.5 rounded-full ${i <= indicePaso ? 'bg-primary' : 'bg-secondary'}`}
          />
        ))}
      </div>
    </div>
  );
}
