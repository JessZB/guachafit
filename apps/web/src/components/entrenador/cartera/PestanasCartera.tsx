/**
 * Prompt 73 (Ola 2, módulo `cartera`): pestañas del RF-009 con contadores reales.
 *
 * Recorte verbatim de `CarteraPage.tsx` (tablist + criterio + `tabpanel`). El patrón APG
 * (`useTabsAccesibles`, roving tabindex y enlace con el panel) vive aquí; el estado sigue
 * viviendo en la URL (`?pestana=`) vía `onCambiar`. ÚNICO (R3): pestañas propias de la cartera
 * (los chips de Conciliación usan otro marcado sin patrón tab, no sustituibles).
 */
import type { ReactNode } from 'react';
import { PESTANAS_CARTERA, contadorPestana } from '../../../lib/cartera';
import { useTabsAccesibles } from '../../../lib/use-tabs-accesibles';
import type {
  PestanaCarteraDTO,
  ResumenCarteraDTO,
} from '@guachafit/shared';

export interface PestanasCarteraProps {
  pestana: PestanaCarteraDTO;
  resumen: ResumenCarteraDTO | null;
  onCambiar: (nueva: PestanaCarteraDTO) => void;
  children: ReactNode;
}

export function PestanasCartera({ pestana, resumen, onCambiar, children }: PestanasCarteraProps) {
  // U3b: patrón APG de las pestañas de estado (roving tabindex, flechas, Home/End y enlace con
  // el `tabpanel` del contenido). El estado sigue viviendo en la URL (`?pestana=`).
  const tabsCartera = useTabsAccesibles<PestanaCarteraDTO>({
    claves: PESTANAS_CARTERA.map((item) => item.clave),
    activa: pestana,
    onActivar: onCambiar,
    idBase: 'cartera-estados',
  });
  const pestanaActiva = PESTANAS_CARTERA.find((p) => p.clave === pestana)!;

  return (
    <>
      <div className="space-y-2">
        <div
          {...tabsCartera.propsTablist}
          className="flex flex-wrap gap-2"
          aria-label="Estados de cartera"
        >
          {PESTANAS_CARTERA.map((pestanaItem) => {
            const activa = pestanaItem.clave === pestana;
            return (
              <button
                key={pestanaItem.clave}
                type="button"
                {...tabsCartera.propsTab(pestanaItem.clave)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activa
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/70'
                }`}
              >
                <span>{pestanaItem.etiqueta}</span>
                <span
                  className={`min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                    activa
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-background/60 text-foreground border border-border/60'
                  }`}
                >
                  {contadorPestana(resumen, pestanaItem.clave)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{pestanaActiva.criterio}</p>
      </div>

      {/* U3b: el contenido de la pestaña activa es el `tabpanel` enlazado por `aria-controls`. */}
      <div {...tabsCartera.propsPanel(pestana)} className="space-y-6">
        {children}
      </div>
    </>
  );
}
