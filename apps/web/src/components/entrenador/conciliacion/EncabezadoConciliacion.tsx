/**
 * Tray header: section label, title, subtitle, and the live queue count.
 *
 * Presentational: the count arrives as a prop; no data fetching here.
 * Con `total` en `null` (la bandeja aún no ha respondido) no se pinta el contador: nunca se
 * muestra un "0 transacciones en cola" falso durante la carga o tras un error sin datos.
 */
import { DollarSign } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import { DESTINOS_ENTRENADOR } from '../../../lib/etiquetas-dominio';

export interface EncabezadoConciliacionProps {
  total: number | null;
}

export function EncabezadoConciliacion({ total }: EncabezadoConciliacionProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
        <DollarSign className="h-4 w-4" />
        <span>Cobros</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {DESTINOS_ENTRENADOR.pagosPorValidar.etiqueta}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aprueba o rechaza los pagos que reportan tus alumnos.
          </p>
        </div>
        {total !== null && (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-warning/15 text-warning border border-warning/20">
            {pluralizar(total, 'transacción en cola', 'transacciones en cola')}
          </span>
        )}
      </div>
    </div>
  );
}
