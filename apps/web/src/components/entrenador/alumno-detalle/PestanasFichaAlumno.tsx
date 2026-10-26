/**
 * Barra de pestañas de la ficha del alumno (molécula ÚNICA, candidata a `BarraTabs` en D).
 *
 * Presentacional: recibe el tab activo, las props APG del hook `useTabsAccesibles` y el saldo
 * deudor para el badge de Pagos. Las claves de `?tab=` no cambian (`resumen`, `finanzas`,
 * `antropometria`, `entrenamiento`, `nutricion`); solo cambian las etiquetas visibles
 * (Perfil, Pagos, Medidas, Entrenos, Nutrición). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-2).
 *
 * Control segmentado de 5 columnas, sin scroll horizontal: en móvil cada pestaña apila el icono
 * sobre una etiqueta de 11px; desde `sm` el icono va a la izquierda de la etiqueta (12px).
 * El badge de deuda de Pagos es un punto en la esquina superior derecha en móvil y muestra el
 * importe desde `sm`.
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

const claseIcono = 'h-4 w-4 shrink-0';
const claseEtiqueta = 'text-[11px] sm:text-xs truncate max-w-full';

export function PestanasFichaAlumno({
  activa,
  propsTablist,
  propsTab,
  saldoDeudaUsd,
}: PestanasFichaAlumnoProps) {
  const claseTab = (clave: TabFichaAlumno) =>
    `relative min-h-11 min-w-0 px-1 py-1.5 sm:px-3 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 font-bold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
      activa === clave
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
    }`;

  return (
    <div
      {...propsTablist}
      aria-label="Pestañas de la ficha del alumno"
      className="grid grid-cols-5 gap-1 p-1 rounded-2xl bg-secondary/60 border border-border/60"
    >
      <button type="button" {...propsTab('resumen')} className={claseTab('resumen')}>
        <User className={claseIcono} aria-hidden="true" />
        <span className={claseEtiqueta}>Perfil</span>
      </button>

      <button type="button" {...propsTab('finanzas')} className={claseTab('finanzas')}>
        <DollarSign className={claseIcono} aria-hidden="true" />
        <span className={claseEtiqueta}>Pagos</span>
        {saldoDeudaUsd && Number(saldoDeudaUsd) > 0 && (
          <span
            role="img"
            aria-label={`Saldo pendiente ${Number(saldoDeudaUsd).toFixed(2)} dólares`}
            className="absolute top-1 right-1 sm:static h-2.5 w-2.5 sm:h-auto sm:w-auto rounded-full bg-danger-strong text-white font-bold font-mono sm:px-1.5 sm:py-0.5 sm:text-[11px]"
          >
            <span className="hidden sm:inline">
              <span>${Number(saldoDeudaUsd).toFixed(2)}</span>
            </span>
          </span>
        )}
      </button>

      <button type="button" {...propsTab('antropometria')} className={claseTab('antropometria')}>
        <Scale className={claseIcono} aria-hidden="true" />
        <span className={claseEtiqueta}>Medidas</span>
      </button>

      <button type="button" {...propsTab('entrenamiento')} className={claseTab('entrenamiento')}>
        <Dumbbell className={claseIcono} aria-hidden="true" />
        <span className={claseEtiqueta}>Entrenos</span>
      </button>

      <button type="button" {...propsTab('nutricion')} className={claseTab('nutricion')}>
        <Utensils className={claseIcono} aria-hidden="true" />
        <span className={claseEtiqueta}>Nutrición</span>
      </button>
    </div>
  );
}
