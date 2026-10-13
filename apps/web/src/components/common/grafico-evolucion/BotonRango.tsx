/**
 * Botón de rango del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:109-135`. Presentacional: recibe props y
 * callback, no pide datos. §6: área táctil `min-h-11 min-w-11` en móvil.
 */
interface BotonRangoProps {
  activo: boolean;
  etiqueta: string;
  aria: string;
  onClick: () => void;
}

export function BotonRango({ activo, etiqueta, aria, onClick }: BotonRangoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={aria}
      className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
        activo
          ? 'bg-primary text-primary-foreground shadow-xs'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {etiqueta}
    </button>
  );
}
