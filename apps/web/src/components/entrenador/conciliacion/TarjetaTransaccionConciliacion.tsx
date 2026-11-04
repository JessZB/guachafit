/**
 * One pending payment of the tray: identity, receipt access, amounts with the
 * pre-approval surplus warning, and the approve / reject actions.
 *
 * Presentational: the transaction and every callback arrive as props. Los montos
 * usan `useFormatoNumero()` (§6.17). La tarjeta es un `article` nombrado por el alumno.
 */
import { useId } from 'react';
import { Eye, FileText } from 'lucide-react';
import { Moneda, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario } from '../../../lib/date-format';
import { avisoExcedenteAprobacion } from '../../../lib/saldo-a-favor';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
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
  const idNombre = useId();
  const { formatMonto, formatDecimal } = useFormatoNumero();
  const esVes = tx.monedaOriginal === Moneda.VES;
  // Sin monto válido formatMonto devuelve '—': no se antepone el signo.
  const abonoUsd = formatMonto(tx.montoEquivalenteUsd, 'USD', { conCodigo: true });
  const aviso = avisoExcedenteAprobacion(
    tx.montoEquivalenteUsd,
    tx.saldoPendienteCuotaUsd,
    tx.clienteNombre
  );

  return (
    <article
      aria-labelledby={idNombre}
      className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4 hover:border-primary/40 transition-all"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2
              id={idNombre}
              className="font-bold text-lg text-foreground line-clamp-2 break-words min-w-0"
            >
              {nombre}
            </h2>
            <BadgeEstado tono="neutral">{etiquetaMetodoPago(tx.metodoPago)}</BadgeEstado>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-xs text-muted-foreground">
              Ref: <span className="font-mono font-bold text-foreground break-all">{tx.referenciaBancaria}</span> •
              Fecha de operación:{' '}
              {formatFechaCalendario(tx.fechaOperacion) ?? tx.fechaOperacion}
            </p>
            {tx.comprobanteUrl ? (
              <button
                type="button"
                onClick={() => onVerComprobante(tx)}
                aria-label={`Ver comprobante de ${nombre}`}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-11 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold transition-all cursor-pointer"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ver comprobante</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground text-[11px] font-medium">
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span>
                  {tx.comprobanteStorageKey
                    ? 'Comprobante no disponible por ahora'
                    : 'Sin captura digital'}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="text-xs text-muted-foreground font-medium block">
            Abono en dólares
          </span>
          <span className="text-2xl font-bold font-mono text-primary">
            {abonoUsd === '—' ? abonoUsd : `+${abonoUsd}`}
          </span>
          {esVes && (
            <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
              {formatMonto(tx.montoOriginal, 'VES')} (Tasa: {formatDecimal(tx.tasaCambioFijada)} Bs/USD)
            </span>
          )}
        </div>
      </div>

      {aviso && (
        <p
          role="note"
          className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-xs font-semibold text-foreground"
        >
          {aviso}
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
    </article>
  );
}
