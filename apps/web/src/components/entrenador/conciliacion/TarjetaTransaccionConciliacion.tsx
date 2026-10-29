/**
 * One pending payment of the tray: identity, receipt access, amounts with the
 * pre-approval surplus warning, and the approve / reject actions.
 *
 * Presentational: the transaction and every callback arrive as props.
 */
import { Eye, FileText } from 'lucide-react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario } from '../../../lib/date-format';
import { avisoExcedenteAprobacion } from '../../../lib/saldo-a-favor';
import { BadgeEstado } from '../../ui/BadgeEstado';
import { BotonTactil } from '../../ui/BotonTactil';

export interface TarjetaTransaccionConciliacionProps {
  tx: TransaccionPagoDetalleDTO;
  onVerComprobante: (tx: TransaccionPagoDetalleDTO) => void;
  onRechazar: (tx: TransaccionPagoDetalleDTO) => void;
  onAprobar: (tx: TransaccionPagoDetalleDTO) => void;
}

export function TarjetaTransaccionConciliacion({
  tx,
  onVerComprobante,
  onRechazar,
  onAprobar,
}: TarjetaTransaccionConciliacionProps) {
  const nombre = tx.clienteNombre || 'Alumno';

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4 hover:border-primary/40 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="font-bold text-lg text-foreground line-clamp-2 break-words min-w-0">
              {nombre}
            </h2>
            <BadgeEstado tono="neutral">{etiquetaMetodoPago(tx.metodoPago)}</BadgeEstado>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-xs text-muted-foreground">
              Ref: <span className="font-mono font-bold text-foreground break-all">{tx.referenciaBancaria}</span> •
              Fecha Operación:{' '}
              {formatFechaCalendario(tx.fechaOperacion) ?? tx.fechaOperacion}
            </p>
            {tx.comprobanteUrl || tx.comprobanteStorageKey ? (
              <button
                type="button"
                onClick={() => onVerComprobante(tx)}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-11 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold transition-all cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ver Comprobante</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground text-[11px] font-medium">
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span>Sin captura digital</span>
              </span>
            )}
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="text-xs text-muted-foreground font-medium block">
            Abono en Dólares
          </span>
          <span className="text-2xl font-bold font-mono text-primary">
            +${tx.montoEquivalenteUsd} USD
          </span>
          <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
            {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
          </span>
        </div>
      </div>

      {avisoExcedenteAprobacion(tx.montoEquivalenteUsd, tx.saldoPendienteCuotaUsd) && (
        <p
          role="note"
          className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-xs font-semibold text-foreground"
        >
          {avisoExcedenteAprobacion(tx.montoEquivalenteUsd, tx.saldoPendienteCuotaUsd)}
        </p>
      )}

      {/* Short labels: the approval dialog explains the debt discount. The accessible
          name carries the student so the 25 cards on a page stay distinguishable. */}
      <div className="flex flex-col sm:flex-row items-center sm:justify-end gap-3 pt-1">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
          <BotonTactil
            variante="peligro-contorno"
            className="w-full sm:w-auto"
            onClick={() => onRechazar(tx)}
            etiquetaAccesible={`Rechazar pago de ${nombre}`}
          >
            Rechazar
          </BotonTactil>
          <BotonTactil
            variante="primaria"
            className="w-full sm:w-auto"
            onClick={() => onAprobar(tx)}
            etiquetaAccesible={`Aprobar pago de ${nombre}`}
          >
            Aprobar
          </BotonTactil>
        </div>
      </div>
    </div>
  );
}
