import { Link } from 'react-router-dom';
import { useTransicionVista } from '../../../lib/use-transicion-vista';
import { ArrowRight, LucideIcon } from 'lucide-react';

/** WU20: tope de filas visibles por bandeja de riesgo; el resto se ve en su sección completa. */
const TOPE_FILAS_RIESGO = 5;

export interface FilaRiesgoDashboard {
  id: string;
  nombre: string;
  detalle: string;
  valor: string;
  /** Ruta de la ficha del alumno. */
  to: string;
}

export interface ListaRiesgoDashboardProps {
  titulo: string;
  icono: LucideIcon;
  tono: 'warning' | 'destructive';
  filas: FilaRiesgoDashboard[];
  textoVacio: string;
  rutaVerTodos: string;
}

const CLASES_ICONO_TONO: Record<ListaRiesgoDashboardProps['tono'], string> = {
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/** Bandeja de riesgo del Dashboard. Solo presentación: recibe filas ya mapeadas. */
export function ListaRiesgoDashboard({
  titulo,
  icono: Icono,
  tono,
  filas,
  textoVacio,
  rutaVerTodos,
}: ListaRiesgoDashboardProps) {
  const viewTransition = useTransicionVista();
  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
      <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
        <Icono className={`h-4 w-4 ${CLASES_ICONO_TONO[tono]} shrink-0`} />
        <span>{titulo}</span>
      </h3>

      {filas.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">{textoVacio}</p>
      )}

      <div className="space-y-2">
        {filas.slice(0, TOPE_FILAS_RIESGO).map((fila) => (
          <Link
            viewTransition={viewTransition}
            key={fila.id}
            to={fila.to}
            className="min-h-11 p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-3 hover:border-primary/40 transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            <div className="min-w-0">
              <p className="font-bold text-xs text-foreground truncate">{fila.nombre}</p>
              <p className="text-[11px] text-muted-foreground">{fila.detalle}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="font-mono font-bold text-xs text-foreground">{fila.valor}</span>
            </div>
          </Link>
        ))}
      </div>

      {filas.length > TOPE_FILAS_RIESGO && (
        <Link
          viewTransition={viewTransition}
          to={rutaVerTodos}
          className="w-full min-h-11 py-2 px-3 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground font-bold text-[11px] flex items-center justify-between transition-colors"
        >
          <span>Ver todos ({filas.length})</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
