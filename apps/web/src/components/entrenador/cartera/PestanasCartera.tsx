/**
 * Prompt 73 (Ola 2, módulo `cartera`): pestañas del RF-009 con contadores reales.
 *
 * Recorte verbatim de `CarteraPage.tsx` (tablist + criterio + `tabpanel`). El patrón APG
 * (`useTabsAccesibles`, roving tabindex y enlace con el panel) vive aquí; el estado sigue
 * viviendo en la URL (`?pestana=`) vía `onCambiar`. ÚNICO (R3): pestañas propias de la cartera.
 *
 * UX-07b: la barra es el átomo `ui/BarraTabsSegmentada` con cuatro columnas fijas, etiquetas
 * cortas visibles y contador siempre visible (`variante="contador"`). El nombre accesible de cada
 * tab lleva el nombre completo y el contador, p. ej. "En mora, 3". Los iconos viven aquí porque
 * `lib/cartera.ts` no importa React.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CalendarClock, CheckCircle2, Receipt } from 'lucide-react';
import { PESTANAS_CARTERA, contadorPestana } from '../../../lib/cartera';
import { useTabsAccesibles } from '../../../lib/use-tabs-accesibles';
import { BarraTabsSegmentada, type ItemTab } from '../../ui/BarraTabsSegmentada';
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

const ICONO_PESTANA: Record<PestanaCarteraDTO, LucideIcon> = {
  mora: AlertTriangle,
  por_vencer: CalendarClock,
  revision: Receipt,
  al_dia: CheckCircle2,
};

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

  const items: ItemTab<PestanaCarteraDTO>[] = PESTANAS_CARTERA.map(
    (definicion): ItemTab<PestanaCarteraDTO> => {
      // Sin `resumen` (carga o error) no hay contadores reales: no se muestra número para no
      // anunciar un "0" falso (misma regla de honestidad que UX-05).
      const contador = resumen ? contadorPestana(resumen, definicion.clave) : null;
      return {
        clave: definicion.clave,
        etiqueta: definicion.etiquetaCorta,
        icono: ICONO_PESTANA[definicion.clave],
        ariaLabel: contador === null ? definicion.etiqueta : `${definicion.etiqueta}, ${contador}`,
        indicador:
          contador === null
            ? null
            : {
                texto: String(contador),
                ariaLabel: String(contador),
                variante: 'contador',
              },
      };
    }
  );

  return (
    <>
      <div className="space-y-2">
        <BarraTabsSegmentada
          items={items}
          activa={pestana}
          propsTablist={tabsCartera.propsTablist}
          propsTab={tabsCartera.propsTab}
          ariaLabel="Estados de cartera"
        />
        <p className="text-[11px] text-muted-foreground">{pestanaActiva.criterio}</p>
      </div>

      {/* U3b: el contenido de la pestaña activa es el `tabpanel` enlazado por `aria-controls`. */}
      <div {...tabsCartera.propsPanel(pestana)} className="space-y-6">
        {children}
      </div>
    </>
  );
}
