/**
 * Tarjeta de acción del hub de progreso (SL2, fase B). CANDIDATO a `common/`.
 *
 * De `ProgresoPage.tsx:589-615` y `:644-669`: misma estructura (`p-5
 * rounded-3xl`, `ChevronRight` con desplazamiento hover) que
 * `PagosPage.tsx:681-742` (matriz 48 fila 16: composición difiere por rol →
 * CANDIDATO a D, no se promueve en B por R6). `role="button"` + `tabIndex` +
 * Enter idénticos; el teclado completo se unifica al promover (SUGGESTION
 * del inventario 44). Presentacional: props tipadas y callback (R1).
 * §6: 11px mínimo, foco visible.
 */
import type { ReactNode } from 'react';
import { ArrowUpRight, ChevronRight } from 'lucide-react';

interface TarjetaOpcionHubProgresoProps {
  icono: ReactNode;
  titulo: string;
  descripcion: string;
  onActivar: () => void;
  /** Resalta la acción principal (gradiente info); por defecto tarjeta neutra. */
  destacada?: boolean;
}

export function TarjetaOpcionHubProgreso({
  icono,
  titulo,
  descripcion,
  onActivar,
  destacada = false,
}: TarjetaOpcionHubProgresoProps) {
  return (
    <div
      onClick={onActivar}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onActivar()}
      className={
        destacada
          ? 'group p-5 rounded-3xl bg-gradient-to-br from-card to-info/10 border-2 border-info/30 hover:border-info/70 transition-all duration-200 cursor-pointer shadow-md hover:shadow-info/5 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary'
          : 'group p-5 rounded-3xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary'
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {icono}
          <div>
            <h3
              className={
                destacada
                  ? 'text-base font-bold text-foreground group-hover:text-info transition-colors flex items-center gap-1.5'
                  : 'text-base font-bold text-foreground group-hover:text-primary transition-colors'
              }
            >
              {titulo}
              {destacada && <ArrowUpRight className="h-4 w-4 text-info opacity-80" />}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{descripcion}</p>
          </div>
        </div>
        <div
          className={
            destacada
              ? 'p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-info group-hover:bg-info/15 transition-colors'
              : 'p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary transition-colors'
          }
        >
          <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}
