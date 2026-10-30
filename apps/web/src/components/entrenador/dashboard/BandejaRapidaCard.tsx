import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Tono del contador: advertencia (pagos por conciliar) o primario (evaluaciones por validar). */
export type TonoBandejaRapida = 'warning' | 'primary';

const CLASES_CONTADOR: Record<TonoBandejaRapida, string> = {
  warning: 'bg-warning/15 text-warning border border-warning/20',
  primary: 'bg-primary/15 text-primary border border-primary/20',
};

export interface BandejaRapidaCardProps {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  /** Cifra real de la bandeja. `null` mientras no hay datos: no se muestra contador. */
  conteo: number | null;
  unidadConteo: string;
  tono: TonoBandejaRapida;
  enlace: { to: string; texto: string };
}

/** Tarjeta de bandeja rápida del Dashboard: cifra real, descripción y enlace de revisión. */
export function BandejaRapidaCard({
  icono: Icono,
  titulo,
  descripcion,
  conteo,
  unidadConteo,
  tono,
  enlace,
}: BandejaRapidaCardProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icono className="h-5 w-5 text-primary shrink-0" />
          <h2 className="font-bold text-base text-foreground">{titulo}</h2>
        </div>
        {conteo !== null && (
          <span
            className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${CLASES_CONTADOR[tono]}`}
          >
            {`${conteo} ${unidadConteo}`}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{descripcion}</p>

      <Link
        to={enlace.to}
        className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs flex items-center justify-between transition-colors"
      >
        <span>{enlace.texto}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
