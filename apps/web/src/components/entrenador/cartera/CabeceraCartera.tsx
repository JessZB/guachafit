/**
 * Prompt 73 (Ola 2, módulo `cartera`): cabecera de la página.
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque Header). Presentacional puro: sin datos ni
 * estado. ÚNICO (R3): copy y destino propios de la cartera.
 */
import { Link } from 'react-router-dom';
import { Receipt, Wallet } from 'lucide-react';

export function CabeceraCartera() {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
        <Wallet className="h-4 w-4" />
        <span>Cobranza y Cartera</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Control de Cobros
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quién te debe, quién está por vencer y a quién ya le recordaste. Todo en un lugar.
          </p>
        </div>
        <Link
          to="/coach/conciliacion"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
        >
          <Receipt className="h-4 w-4 text-primary" />
          <span>Bandeja de validación</span>
        </Link>
      </div>
    </div>
  );
}
