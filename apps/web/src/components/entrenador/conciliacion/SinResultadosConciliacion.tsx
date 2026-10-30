/**
 * Filtered-empty state: nothing on the queue matches the active filters.
 *
 * Presentational: the clear callback arrives as a prop.
 */
import { RotateCcw, SearchX } from 'lucide-react';

export interface SinResultadosConciliacionProps {
  onLimpiar: () => void;
}

export function SinResultadosConciliacion({ onLimpiar }: SinResultadosConciliacionProps) {
  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
      <SearchX className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
      <h2 className="text-sm font-bold text-foreground">Sin resultados</h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        Ningún pago en cola coincide con la búsqueda o el método seleccionado.
      </p>
      <button
        type="button"
        onClick={onLimpiar}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span>Limpiar filtros</span>
      </button>
    </div>
  );
}
