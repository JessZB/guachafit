/**
 * Selector de acciones del hub de `pagos` (fase B, prompt 54).
 *
 * Extraído tal cual desde `pages/atleta/PagosPage.tsx` (hub, L674–743): los 2
 * caminos claros (reportar abono / ver historial) como tarjetas-acción.
 *
 * R1: componente único de vista (patrón tarjeta-acción con chevron también en
 * `AtletaMenuPage.tsx:274–360`, indicio insuficiente para promover: ante la
 * duda, único — R3). Presentacional: contador y callbacks por props.
 *
 * R5: conserva `role="button"` en `div` y los textos exactos que consultan los
 * specs ("Reportar pago", "Historial"); los
 * specs consultan por rol y nombre, no por tag.
 *
 * §6: `font-bold` (700), tokens con variante claro/oscuro, `pluralizar` para el
 * contador, `text-[11px]` (piso exacto).
 */
import { ArrowUpRight, ChevronRight, Plus, Receipt } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';

export interface SelectorAccionesPagosProps {
  transaccionesTotal: number;
  onReportar: () => void;
  onVerHistorial: () => void;
}

export function SelectorAccionesPagos({
  transaccionesTotal,
  onReportar,
  onVerHistorial,
}: SelectorAccionesPagosProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
        Selecciona qué deseas hacer
      </h2>

      {/* Opción A: Reportar pago */}
      <div
        onClick={onReportar}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onReportar();
          } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            onReportar();
          }
        }}
        className="group p-5 rounded-3xl bg-gradient-to-br from-card to-primary/10 border-2 border-primary/40 hover:border-primary transition-all duration-200 cursor-pointer shadow-md hover:shadow-primary/5 active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Plus className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                Reportar pago
                <ArrowUpRight className="h-4 w-4 text-primary opacity-80" aria-hidden="true" />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                Paga vía Pago Móvil, Zelle o divisas y adjunta tu comprobante en 30 segundos.
              </p>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Opción B: Ver Historial */}
      <div
        onClick={onVerHistorial}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onVerHistorial();
          } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            onVerHistorial();
          }
        }}
        className="group p-5 rounded-3xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-secondary text-foreground">
              <Receipt className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                  Historial
                </h3>
                {transaccionesTotal > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {pluralizar(transaccionesTotal, 'pago', 'pagos')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                Consulta comprobantes verificados, estados de cuota y aclaratorias de pagos.
              </p>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary transition-colors">
            <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
