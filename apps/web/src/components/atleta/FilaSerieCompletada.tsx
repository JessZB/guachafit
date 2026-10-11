import React from 'react';
import { Check, Pencil } from 'lucide-react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { textoSerieCompletada } from '../../lib/sesion-vista';
import type { UnidadPeso } from '../../lib/weight-unit';

/**
 * Serie completada en una línea (RF-001, lote E4): libera espacio en pantalla sin ocultar el
 * progreso. Tocarla abre la fila completa para corregir los datos o desmarcarla.
 */
export function FilaSerieCompletada({
  serie,
  unidadPeso,
  onCorregir,
}: {
  serie: SerieRegistroDetalleDTO;
  unidadPeso: UnidadPeso;
  onCorregir: () => void;
}) {
  const texto = textoSerieCompletada(serie, unidadPeso);

  return (
    <button
      type="button"
      onClick={onCorregir}
      aria-label={`${texto}. Completada, toca para corregir`}
      className="w-full min-h-11 px-3 py-2 rounded-2xl border border-success/30 bg-success/10 flex items-center gap-2.5 text-left text-sm text-foreground hover:border-success/60 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        aria-hidden="true"
        className="h-6 w-6 shrink-0 rounded-full bg-success-strong text-white flex items-center justify-center"
      >
        <Check className="h-4 w-4 stroke-[3]" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{texto}</span>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
