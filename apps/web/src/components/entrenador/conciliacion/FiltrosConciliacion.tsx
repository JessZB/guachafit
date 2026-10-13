/**
 * Tray filters: method chips plus free-text search over the loaded page.
 *
 * Presentational: every value and callback arrives as props. The scope note
 * ("on this page") stays because the endpoint accepts no filters.
 */
import { Search } from 'lucide-react';
import type { MetodoPago } from '@guachafit/shared';
import {
  etiquetaMetodoPago,
  type FiltroMetodoPago,
} from '../../../lib/conciliacion-filtros';
import { pluralizar } from '../../../lib/pluralizar';

export interface FiltrosConciliacionProps {
  metodosPresentes: MetodoPago[];
  filtroMetodo: FiltroMetodoPago;
  onCambiarMetodo: (metodo: FiltroMetodoPago) => void;
  busqueda: string;
  onCambiarBusqueda: (valor: string) => void;
  visibles: number;
  enPagina: number;
  total: number;
  hayFiltroActivo: boolean;
  onLimpiar: () => void;
}

export function FiltrosConciliacion({
  metodosPresentes,
  filtroMetodo,
  onCambiarMetodo,
  busqueda,
  onCambiarBusqueda,
  visibles,
  enPagina,
  total,
  hayFiltroActivo,
  onLimpiar,
}: FiltrosConciliacionProps) {
  return (
    <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onCambiarMetodo('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filtroMetodo === 'todos'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {metodosPresentes.map((metodo) => {
            const activo = filtroMetodo === metodo;
            return (
              <button
                key={metodo}
                type="button"
                onClick={() => onCambiarMetodo(metodo)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activo
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="capitalize">{etiquetaMetodoPago(metodo)}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => onCambiarBusqueda(e.target.value)}
            placeholder="Buscar por alumno o referencia..."
            aria-label="Buscar pago por alumno o referencia"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground font-mono">
          Mostrando {visibles} de {enPagina} en esta página ·{' '}
          {pluralizar(total, 'transacción en cola', 'transacciones en cola')}
        </p>
        {hayFiltroActivo && (
          <button
            type="button"
            onClick={onLimpiar}
            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
