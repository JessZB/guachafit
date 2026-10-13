/**
 * Barra de pestañas de la ficha del alumno (molécula ÚNICA, candidata a `BarraTabs` en D).
 *
 * Presentacional: recibe el tab activo, las props APG del hook `useTabsAccesibles` y el saldo
 * deudor para el badge de Finanzas. El mismo patrón se repite en 4 vistas con markup distinto
 * (R3: ante la duda, único). Extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-2).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura. W-1: los tabs conservan `py-2`
 * (la subida a 44px queda para D con revisión visual).
 */
import { DollarSign, Dumbbell, Scale, User, Utensils } from 'lucide-react';
import type { TabFichaAlumno } from '../../../lib/alumno-detalle-tab';
import type { PropsTab, PropsTablist } from '../../../lib/use-tabs-accesibles';

interface PestanasFichaAlumnoProps {
  activa: TabFichaAlumno;
  propsTablist: PropsTablist;
  propsTab: (clave: TabFichaAlumno) => PropsTab;
  /** Saldo pendiente total en USD; con deuda muestra el badge sobre Finanzas. */
  saldoDeudaUsd: string | null;
}

export function PestanasFichaAlumno({
  activa,
  propsTablist,
  propsTab,
  saldoDeudaUsd,
}: PestanasFichaAlumnoProps) {
  const claseTab = (clave: TabFichaAlumno) =>
    `py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
      activa === clave
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
        : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div
      {...propsTablist}
      aria-label="Pestañas de la ficha del alumno"
      className="flex items-center gap-2 border-b border-border/80 pb-2 overflow-x-auto"
    >
      <button type="button" {...propsTab('resumen')} className={claseTab('resumen')}>
        <User className="h-4 w-4" />
        <span>Resumen & Ficha Médica</span>
      </button>

      <button type="button" {...propsTab('finanzas')} className={claseTab('finanzas')}>
        <DollarSign className="h-4 w-4" />
        <span>Finanzas & Pagos</span>
        {saldoDeudaUsd && Number(saldoDeudaUsd) > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-danger-strong text-white font-bold font-mono">
            ${saldoDeudaUsd}
          </span>
        )}
      </button>

      <button type="button" {...propsTab('antropometria')} className={claseTab('antropometria')}>
        <Scale className="h-4 w-4" />
        <span>Antropometría & Medidas</span>
      </button>

      <button type="button" {...propsTab('entrenamiento')} className={claseTab('entrenamiento')}>
        <Dumbbell className="h-4 w-4" />
        <span>Entrenamiento & Rutinas</span>
      </button>

      <button type="button" {...propsTab('nutricion')} className={claseTab('nutricion')}>
        <Utensils className="h-4 w-4" />
        <span>Nutrición y reportes</span>
      </button>
    </div>
  );
}
