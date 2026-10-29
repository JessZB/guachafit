/**
 * Barra de pestañas segmentada (átomo UI reutilizable, UX-01 · ADR-022).
 *
 * Nace de la barra de la ficha del alumno (T6 de `00_Inbox/Auditoria_UX_Vistas_2026-10-28.md`)
 * y se extrae para que otras vistas con pestañas segmentadas la reutilicen: Ajustes (UX-17),
 * Cartera (UX-07) y Antropometría (UX-15).
 *
 * Presentacional y agnóstico de dominio: no conoce saldos, fichas ni claves de negocio. Recibe
 * los ítems, la pestaña activa y las props APG de `useTabsAccesibles` (roving tabindex, ids,
 * `aria-selected` y teclado), y se limita a pintarlos.
 *
 * Indicador por ítem (`indicador.variante`):
 * - `alerta` (por defecto, comportamiento heredado): punto de aviso con `role="img"` que en
 *   móvil es un punto absoluto y desde `sm` muestra el texto dentro del tab.
 * - `contador` (UX-07b): número siempre visible en todos los tamaños, sin `role`; el nombre
 *   accesible lo aporta el `ariaLabel` del propio tab.
 *
 * Columnas por mapa fijo: Tailwind v4 solo genera las clases que encuentra como literales en el
 * código fuente, así que una clase construida como `grid-cols-${n}` no produciría CSS. El número
 * de ítems se acota al rango [2, 6] y se traduce a una de las cinco clases literales del mapa.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, área táctil `min-h-11`.
 */
import type { LucideIcon } from 'lucide-react';
import type { PropsTab, PropsTablist } from '../../lib/use-tabs-accesibles';

export interface ItemTab<K extends string> {
  clave: K;
  etiqueta: string;
  icono: LucideIcon;
  /** Nombre accesible del tab; si no existe, se usa la etiqueta visible. */
  ariaLabel?: string;
  /**
   * Badge compacto dentro del tab. `texto` es el valor mostrado y `ariaLabel` el nombre que se
   * anuncia. `variante` por defecto es `alerta`; `contador` muestra el número siempre visible.
   */
  indicador?: {
    texto: string;
    ariaLabel: string;
    variante?: 'alerta' | 'contador';
  } | null;
}

export interface BarraTabsSegmentadaProps<K extends string> {
  items: readonly ItemTab<K>[];
  activa: K;
  propsTablist: PropsTablist;
  propsTab: (clave: K) => PropsTab;
  /** Nombre accesible de la barra (`aria-label` del tablist). */
  ariaLabel: string;
}

type ColumnasPermitidas = 2 | 3 | 4 | 5 | 6;

const CLASE_COLUMNAS: Record<ColumnasPermitidas, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const claseIcono = 'h-4 w-4 shrink-0';
const claseEtiqueta = 'text-[11px] sm:text-xs truncate max-w-full';

export function BarraTabsSegmentada<K extends string>({
  items,
  activa,
  propsTablist,
  propsTab,
  ariaLabel,
}: BarraTabsSegmentadaProps<K>) {
  const columnas = Math.min(6, Math.max(2, items.length)) as ColumnasPermitidas;

  const claseTab = (clave: K) =>
    `relative min-h-11 min-w-0 px-1 py-1.5 sm:px-3 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 font-bold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
      activa === clave
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
    }`;

  const claseContador = (activo: boolean) =>
    `min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
      activo
        ? 'bg-primary-foreground/20 text-primary-foreground'
        : 'bg-background/60 text-foreground border border-border/60'
    }`;

  return (
    <div
      {...propsTablist}
      aria-label={ariaLabel}
      className={`grid ${CLASE_COLUMNAS[columnas]} gap-1 p-1 rounded-2xl bg-secondary/60 border border-border/60`}
    >
      {items.map(({ clave, etiqueta, icono: Icono, ariaLabel: nombreAccesible, indicador }) => {
        const activo = activa === clave;
        return (
          <button
            key={clave}
            type="button"
            {...propsTab(clave)}
            aria-label={nombreAccesible}
            className={claseTab(clave)}
          >
            <Icono className={claseIcono} aria-hidden="true" />
            <span className={claseEtiqueta}>{etiqueta}</span>
            {indicador &&
              (indicador.variante === 'contador' ? (
                <span className={claseContador(activo)}>{indicador.texto}</span>
              ) : (
                <span
                  role="img"
                  aria-label={indicador.ariaLabel}
                  className="absolute top-1 right-1 sm:static h-2.5 w-2.5 sm:h-auto sm:w-auto rounded-full bg-danger-strong text-white font-bold font-mono sm:px-1.5 sm:py-0.5 sm:text-[11px]"
                >
                  <span className="hidden sm:inline">
                    <span>{indicador.texto}</span>
                  </span>
                </span>
              ))}
          </button>
        );
      })}
    </div>
  );
}
