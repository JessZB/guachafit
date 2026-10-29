/**
 * Prompt 73 (Ola 2, módulo `cartera`): búsqueda server-side + aviso honesto sin tasa.
 *
 * Recorte verbatim de `CarteraPage.tsx`. Presentacional puro: recibe valores y callbacks.
 * ÚNICO (R3): copy y destino propios de la cartera.
 */
import { Link } from 'react-router-dom';
import { Info, Search } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';

export interface BuscadorCarteraProps {
  busqueda: string;
  onCambiarBusqueda: (valor: string) => void;
  isLoading: boolean;
  /** Se conserva para no tocar `CarteraPage`; el texto de estado usa solo `total` (UX-07b). */
  visibles: number;
  total: number;
  etiquetaPestana: string;
  sinTasa: boolean;
}

export function BuscadorCartera({
  busqueda,
  onCambiarBusqueda,
  isLoading,
  total,
  etiquetaPestana,
  sinTasa,
}: BuscadorCarteraProps) {
  return (
    <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => onCambiarBusqueda(evento.target.value)}
            placeholder="Buscar alumno por nombre..."
            aria-label="Buscar alumno por nombre"
            autoComplete="off"
            className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-background border border-border text-base sm:text-sm font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
          />
        </div>
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] text-muted-foreground font-mono sm:ml-auto"
        >
          {isLoading
            ? 'Cargando cartera...'
            : `${pluralizar(total, 'registro', 'registros')} · ${etiquetaPestana}`}
        </p>
      </div>

      {sinTasa && (
        <div className="flex items-start gap-2 p-3 rounded-2xl bg-secondary/40 border border-border/60">
          <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Sin tasa de cambio configurada: la columna en bolívares se muestra como «—»
              para no inventar montos.
            </p>
            {/* U2 (Ola 4): destino real como botón táctil (≥44px), no un enlace de 15px */}
            <Link
              to="/coach/ajustes?tab=tasas"
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
            >
              Ajustes → Tasas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
