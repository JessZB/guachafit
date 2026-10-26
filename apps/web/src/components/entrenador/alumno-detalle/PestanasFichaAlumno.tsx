/**
 * Barra de pestañas de la ficha del alumno (molécula ÚNICA, candidata a `BarraTabs` en D).
 *
 * Presentacional: recibe el tab activo, las props APG del hook `useTabsAccesibles` y el saldo
 * deudor para el badge de Pagos. Las claves de `?tab=` no cambian (`resumen`, `finanzas`,
 * `antropometria`, `entrenamiento`, `nutricion`); solo cambian las etiquetas visibles
 * (Perfil, Pagos, Medidas, Entrenos, Nutrición). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-2).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, área táctil `min-h-11`.
 * El badge de deuda se anuncia como "Saldo pendiente N dólares" (sin símbolo, dos decimales).
 */
import { DollarSign, Dumbbell, Scale, User, Utensils } from 'lucide-react';
import type { TabFichaAlumno } from '../../../lib/alumno-detalle-tab';
import type { PropsTab, PropsTablist } from '../../../lib/use-tabs-accesibles';

interface PestanasFichaAlumnoProps {
  activa: TabFichaAlumno;
  propsTablist: PropsTablist;
  propsTab: (clave: TabFichaAlumno) => PropsTab;
  /** Saldo pendiente total en USD; con deuda muestra el badge sobre Pagos. */
  saldoDeudaUsd: string | null;
}

export function PestanasFichaAlumno({
  activa,
  propsTablist,
  propsTab,
  saldoDeudaUsd,
}: PestanasFichaAlumnoProps) {
  const claseTab = (clave: TabFichaAlumno) =>
    `min-h-11 py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
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
        <span>Perfil</span>
      </button>

      <button type="button" {...propsTab('finanzas')} className={claseTab('finanzas')}>
        <DollarSign className="h-4 w-4" />
        <span>Pagos</span>
        {saldoDeudaUsd && Number(saldoDeudaUsd) > 0 && (
          <span
            role="img"
            aria-label={`Saldo pendiente ${Number(saldoDeudaUsd).toFixed(2)} dólares`}
            className="px-1.5 py-0.5 rounded-full text-[11px] bg-danger-strong text-white font-bold font-mono"
          >
            ${Number(saldoDeudaUsd).toFixed(2)}
          </span>
        )}
      </button>

      <button type="button" {...propsTab('antropometria')} className={claseTab('antropometria')}>
        <Scale className="h-4 w-4" />
        <span>Medidas</span>
      </button>

      <button type="button" {...propsTab('entrenamiento')} className={claseTab('entrenamiento')}>
        <Dumbbell className="h-4 w-4" />
        <span>Entrenos</span>
      </button>

      <button type="button" {...propsTab('nutricion')} className={claseTab('nutricion')}>
        <Utensils className="h-4 w-4" />
        <span>Nutrición</span>
      </button>
    </div>
  );
}
