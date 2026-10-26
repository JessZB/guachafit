/**
 * Tarjeta de la cuota mensual con el botón de cobro directo en sala (organismo ÚNICO).
 *
 * Presentacional: recibe el resumen y el callback de apertura del cobro (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-4). Incluye el botón
 * `Cobrar en sala` (mismo comportamiento de cobro directo). Título y badge envuelven en
 * móvil y el vencimiento no se trunca. W-6: conserva `rounded-2xl`
 * en las celdas (`Saldo Restante` se localiza con `.closest('.rounded-2xl')`).
 *
 * §6: táctil en el botón de cobro, 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { CreditCard, DollarSign } from 'lucide-react';
import { formatFechaLocal } from '../../../lib/date-format';

export interface TarjetaCuotaMensualProps {
  finanzas: ResumenFinancieroAlumnoDTO | null;
  onRegistrarCobro: () => void;
}

export function TarjetaCuotaMensual({ finanzas, onRegistrarCobro }: TarjetaCuotaMensualProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase">
            <CreditCard className="h-4 w-4" />
            <span>Estado de la Cuota Mensual</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
            <h3 className="text-lg font-bold text-foreground">
              Periodo:{' '}
              {finanzas?.cuotaMesActual?.periodo || (finanzas ? 'Sin cuota emitida' : '—')}
            </h3>
            {finanzas?.cuotaMesActual && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
                  Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0
                    ? 'bg-success/15 text-success border-success/30'
                    : 'bg-danger/15 text-danger border-danger/30'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0
                      ? 'bg-success'
                      : 'bg-danger animate-pulse motion-reduce:animate-none'
                  }`}
                />
                {Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0 ? 'Liquidada' : 'Pendiente'}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onRegistrarCobro}
          className="min-h-11 py-2.5 px-4 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white font-bold text-xs shadow-md shadow-success-strong/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-success"
        >
          <DollarSign className="h-4 w-4" />
          <span>Cobrar en sala</span>
        </button>
      </div>

      {finanzas?.cuotaMesActual ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Total Cuota</span>
            <p className="font-mono font-bold text-sm text-foreground mt-0.5">
              ${finanzas.cuotaMesActual.montoTotalUsd} USD
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Monto Abonado</span>
            <p className="font-mono font-bold text-sm text-success mt-0.5">
              ${finanzas.cuotaMesActual.montoPagadoUsd} USD
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Saldo Restante</span>
            <p className="font-mono font-bold text-sm text-danger mt-0.5">
              ${finanzas.cuotaMesActual.saldoPendienteUsd} USD
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold">Vencimiento</span>
            <p className="font-mono font-bold text-xs text-foreground mt-0.5">
              {formatFechaLocal(finanzas.cuotaMesActual.fechaVencimiento) ?? '—'}
            </p>
          </div>
        </div>
      ) : !finanzas ? (
        <p className="text-xs text-muted-foreground py-2">
          El estado de la cuota no está disponible porque no se pudo cargar el historial
          financiero.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground py-2">
          No hay cuota emitida para este periodo. Al pulsar <strong>"Cobrar en sala"</strong>, el sistema emitirá la cuota y liquidará el pago en 1 solo paso.
        </p>
      )}
    </div>
  );
}
