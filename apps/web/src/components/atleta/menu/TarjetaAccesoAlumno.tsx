import React from 'react';
import { Link } from 'react-router-dom';
import { useTransicionVista } from '../../../lib/use-transicion-vista';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { BadgeEstado } from '../../ui/BadgeEstado';
import type { BadgeCuota, TonoCuota } from '../../../lib/estado-cuota';

export interface TarjetaAccesoAlumnoProps {
  to: string;
  icono: LucideIcon;
  claseColorIcono: string;
  titulo: string;
  descripcion: string;
  ceja?: string;
  textoAccion?: string;
  badgeCuota?: BadgeCuota | null;
  variante?: 'simple' | 'completa';
}

const ICONO_TONO_CUOTA: Record<TonoCuota, LucideIcon | null> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertTriangle,
  info: Clock,
  neutral: null,
};

/**
 * MEN-01, MEN-04, MEN-06: Tarjeta de acceso reutilizable para el Bento Grid del alumno.
 * Soporta variantes de 1 columna (Nutrición, Progreso) y ancho completo con BadgeEstado (Pagos).
 */
export function TarjetaAccesoAlumno({
  to,
  icono: Icono,
  claseColorIcono,
  titulo,
  descripcion,
  ceja,
  textoAccion,
  badgeCuota,
  variante = 'simple',
}: TarjetaAccesoAlumnoProps) {
  const viewTransition = useTransicionVista();
  if (variante === 'completa') {
    const IconoBadgeCuota = badgeCuota ? ICONO_TONO_CUOTA[badgeCuota.tono] : null;

    return (
      <Link
        viewTransition={viewTransition}
        to={to}
        className="sm:col-span-2 group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl ${claseColorIcono}`}>
              <Icono className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  {titulo}
                </h3>
                {badgeCuota && (
                  <BadgeEstado tono={badgeCuota.tono}>
                    {IconoBadgeCuota && (
                      <IconoBadgeCuota className="h-2.5 w-2.5" aria-hidden="true" />
                    )}
                    {badgeCuota.texto}
                  </BadgeEstado>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{descripcion}</p>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors">
            <ChevronRight
              className="h-5 w-5 group-hover:translate-x-0.5 transition-transform"
              aria-hidden="true"
            />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      viewTransition={viewTransition}
      to={to}
      className="group block p-5 rounded-2xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${claseColorIcono}`}>
            <Icono className="h-6 w-6" aria-hidden="true" />
          </div>
          {ceja && (
            <span className="text-xs font-medium text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
              {ceja}
            </span>
          )}
        </div>
        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
          {titulo}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{descripcion}</p>
      </div>

      {textoAccion && (
        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-primary">
          <span>{textoAccion}</span>
          <ChevronRight
            className="h-4 w-4 group-hover:translate-x-1 transition-transform"
            aria-hidden="true"
          />
        </div>
      )}
    </Link>
  );
}
