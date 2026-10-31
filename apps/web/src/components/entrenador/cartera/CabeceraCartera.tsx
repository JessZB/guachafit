/**
 * Prompt 73 (Ola 2, módulo `cartera`): cabecera de la página.
 *
 * Recorte verbatim de `CarteraPage.tsx` (bloque Header). Presentacional puro: sin datos ni
 * estado. ÚNICO (R3): copy y destino propios de la cartera.
 */
import { Link } from 'react-router-dom';
import { Receipt, Wallet } from 'lucide-react';
import { DESTINOS_ENTRENADOR } from '../../../lib/etiquetas-dominio';

export function CabeceraCartera() {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
        <Wallet className="h-4 w-4" />
        <span>Cobros</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {DESTINOS_ENTRENADOR.controlCobros.etiqueta}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quién debe, quién está por vencer y a quién ya le recordaste.
          </p>
        </div>
        <Link
          to="/coach/conciliacion"
          className="shrink-0 inline-flex min-h-11 items-center gap-2 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Receipt className="h-4 w-4 text-primary" />
          <span>Pagos por validar</span>
        </Link>
      </div>
    </div>
  );
}
