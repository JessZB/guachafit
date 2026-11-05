import { AlertTriangle, ArrowRight, Camera, Receipt, UserX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTransicionVista } from '../../../lib/use-transicion-vista';
import type { DashboardComandoDTO } from '@guachafit/shared';
import { pluralizar } from '../../../lib/pluralizar';

export interface FranjaAtencionDashboardProps {
  dashboard: DashboardComandoDTO | null;
}

type TonoCifra = 'warning' | 'primary' | 'danger';

interface ItemAtencion {
  etiqueta: string;
  /** Cifra ya formateada; `null` mientras no hay datos (se muestra "—"). */
  cifra: string | null;
  accion: string;
  to: string;
  icono: LucideIcon;
  tono: TonoCifra;
}

const CLASES_TONO_CIFRA: Record<TonoCifra, string> = {
  warning: 'text-warning',
  primary: 'text-primary',
  danger: 'text-danger',
};

/** D4 (UX-13): las cuatro cosas que el entrenador debe atender hoy, en orden fijo. */
function construirItems(dashboard: DashboardComandoDTO | null): ItemAtencion[] {
  const bandejas = dashboard?.bandejasRapidas;
  const kpis = dashboard?.kpisMacro;
  return [
    {
      etiqueta: 'Pagos por revisar',
      cifra: bandejas ? pluralizar(bandejas.pagosPorConciliar, 'pendiente', 'pendientes') : null,
      accion: 'Revisar pagos',
      to: '/coach/conciliacion',
      icono: Receipt,
      tono: 'warning',
    },
    {
      etiqueta: 'Evaluaciones por revisar',
      cifra: bandejas ? `${bandejas.checkinsAntropometricosPendientes} por validar` : null,
      accion: 'Revisar evaluaciones',
      to: '/coach/antropometria',
      icono: Camera,
      tono: 'primary',
    },
    {
      etiqueta: 'En riesgo deportivo',
      cifra: kpis ? pluralizar(kpis.alumnosEnRiesgoDeportivo, 'alumno', 'alumnos') : null,
      accion: 'Ver monitor',
      to: '/coach/monitor-adherencia',
      icono: UserX,
      tono: 'danger',
    },
    {
      etiqueta: 'En mora',
      cifra: kpis ? pluralizar(kpis.alumnosEnMoraFinanciera, 'alumno', 'alumnos') : null,
      accion: 'Cobrar',
      to: '/coach/cartera?pestana=mora',
      icono: AlertTriangle,
      tono: 'warning',
    },
  ];
}

/** Franja «Requiere tu atención»: cuatro enlaces accionables con su cifra real. */
export function FranjaAtencionDashboard({ dashboard }: FranjaAtencionDashboardProps) {
  const viewTransition = useTransicionVista();
  return (
    <section className="space-y-3">
      <h2 className="font-bold text-base text-foreground">Requiere tu atención</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {construirItems(dashboard).map((item) => {
          const Icono = item.icono;
          return (
            <Link
              viewTransition={viewTransition}
              key={item.to}
              to={item.to}
              className="flex flex-col gap-2 min-h-11 p-4 sm:p-6 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {item.etiqueta}
                </span>
                <Icono className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              </span>
              <span className={`font-mono text-xl font-bold ${CLASES_TONO_CIFRA[item.tono]}`}>
                {item.cifra ?? '—'}
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 text-xs font-bold text-foreground">
                <span>{item.accion}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
