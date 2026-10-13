/**
 * Empty tray state: every reported payment has been processed.
 */
import { CheckCircle2 } from 'lucide-react';

export function BandejaVaciaConciliacion() {
  return (
    <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
      <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
      <h3 className="font-bold text-base text-foreground">Bandeja al Día</h3>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
        No hay transacciones pendientes de revisión. Todos los abonos han sido procesados.
      </p>
    </div>
  );
}
