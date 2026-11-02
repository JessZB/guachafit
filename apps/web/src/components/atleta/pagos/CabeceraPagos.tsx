/**
 * Cabecera de la vista `pagos` (fase B, prompt 54).
 *
 * Extraída tal cual desde `pages/atleta/PagosPage.tsx` (L535–559): título de la
 * vista + chip "Tasa del Día" con etiqueta honesta D6 cuando no hay tasa.
 *
 * R1: componente único de vista (la "Tasa del Día" solo aparece aquí; no cumple
 * R3.1–3). Presentacional: recibe props tipadas, sin `useQuery` ni `api-client`.
 *
 * §6: `text-[11px]` (piso exacto), `font-bold` (700), tokens con variante
 * claro/oscuro, sin pesos > 700.
 */
import { CreditCard, TrendingUp } from 'lucide-react';

export interface CabeceraPagosProps {
  tasaEfectiva?: string | null;
  /** Etiqueta honesta cuando no hay tasa (`Sin tasa configurada` / `Tasa no disponible`). */
  etiquetaSinTasa: string | null;
}

export function CabeceraPagos({ tasaEfectiva, etiquetaSinTasa }: CabeceraPagosProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <CreditCard className="h-3.5 w-3.5" />
          <span>Pagos</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
          Pagos y cuotas
        </h1>
      </div>

      {/* Tasa del Día */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-secondary/70 border border-border/80 self-start sm:self-auto">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <div className="text-right">
          <span className="text-[11px] text-muted-foreground font-semibold uppercase block">
            Tasa del día
          </span>
          <span className="text-xs font-bold font-mono text-foreground">
            {tasaEfectiva ? `1 USD = ${tasaEfectiva} Bs.` : etiquetaSinTasa}
          </span>
        </div>
      </div>
    </div>
  );
}
