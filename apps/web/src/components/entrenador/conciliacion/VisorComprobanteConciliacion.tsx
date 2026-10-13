/**
 * Bank receipt inspection viewer: cross-referenced details bar, the receipt
 * image (or its honest placeholder), and direct approve / reject actions.
 *
 * Presentational: the container mounts it only while open; the transaction,
 * the demo flag, the image-error state, and every callback arrive as props.
 */
import { ExternalLink, Image as ImageIcon, Receipt, X } from 'lucide-react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import { formatFechaCalendario } from '../../../lib/date-format';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { COMPROBANTE_DEMO_URL } from '../../../lib/conciliacion-demo';

export interface VisorComprobanteConciliacionProps {
  tx: TransaccionPagoDetalleDTO;
  isDemoMode: boolean;
  imagenFallida: boolean;
  onImagenError: () => void;
  onCerrar: () => void;
  onRechazar: (tx: TransaccionPagoDetalleDTO) => void;
  onAprobar: (tx: TransaccionPagoDetalleDTO) => void;
}

export function VisorComprobanteConciliacion({
  tx,
  isDemoMode,
  imagenFallida,
  onImagenError,
  onCerrar,
  onRechazar,
  onAprobar,
}: VisorComprobanteConciliacionProps) {
  const refModalComprobante = useDialogoAccesible({
    abierto: true,
    onCerrar,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
      <div
        ref={refModalComprobante}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conciliacion-comprobante-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-2xl space-y-4 max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="conciliacion-comprobante-titulo"
                className="font-bold text-base text-foreground"
              >
                Auditoría de Comprobante Bancario
              </h3>
              <p className="text-xs text-muted-foreground">
                Alumno: <span className="font-bold text-foreground">{tx.clienteNombre || 'Alumno'}</span> • {etiquetaMetodoPago(tx.metodoPago).toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar auditoría de comprobante"
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cross-Referenced Transaction Details Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-secondary/30 border border-border text-xs">
          <div>
            <span className="text-[11px] text-muted-foreground uppercase font-bold">Monto Declarado</span>
            <p className="font-mono font-bold text-foreground mt-0.5">
              {tx.montoOriginal} {tx.monedaOriginal}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground uppercase font-bold">Equivalente USD</span>
            <p className="font-mono font-bold text-primary mt-0.5">
              +${tx.montoEquivalenteUsd}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground uppercase font-bold">Referencia</span>
            <p className="font-mono font-bold text-foreground mt-0.5">
              {tx.referenciaBancaria || 'Sin referencia'}
            </p>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground uppercase font-bold">Fecha Operación</span>
            <p className="font-medium text-foreground mt-0.5">
              {formatFechaCalendario(tx.fechaOperacion) ??
                tx.fechaOperacion}
            </p>
          </div>
        </div>

        {/* High-Resolution Receipt Image Frame */}
        <div className="flex-1 overflow-auto rounded-2xl border border-border bg-black/50 flex flex-col items-center justify-center p-3 relative min-h-[280px]">
          {tx.comprobanteUrl && !imagenFallida ? (
            <img
              src={tx.comprobanteUrl}
              alt="Comprobante Bancario"
              className="max-h-[48vh] max-w-full rounded-xl object-contain shadow-lg"
              onError={onImagenError}
            />
          ) : isDemoMode && !tx.comprobanteUrl ? (
            // N2: la foto stock SOLO vive en modo demo explícito.
            <img
              src={COMPROBANTE_DEMO_URL}
              alt="Comprobante Bancario (demostración)"
              className="max-h-[48vh] max-w-full rounded-xl object-contain shadow-lg opacity-80"
            />
          ) : (
            // N2: en sesión real nunca se muestra una imagen ajena como si fuera el comprobante.
            <div className="text-center space-y-2 px-6">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-bold text-foreground">
                {tx.comprobanteUrl
                  ? 'No se pudo cargar la imagen del comprobante'
                  : 'Sin comprobante disponible'}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-sm">
                {tx.comprobanteUrl
                  ? 'El enlace temporal de lectura falló o expiró. Cierra el visor e inténtalo de nuevo.'
                  : 'El servidor no generó una URL de lectura para este pago (por ejemplo, almacenamiento R2 no configurado).'}
              </p>
            </div>
          )}
          {tx.comprobanteUrl && (
            <a
              href={tx.comprobanteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-4 right-2 p-2 rounded-xl bg-background/80 hover:bg-background text-foreground text-xs font-bold backdrop-blur-md shadow-md flex items-center gap-1.5 transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Abrir original</span>
            </a>
          )}
        </div>

        {/* Direct Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/80">
          <span className="text-[11px] text-muted-foreground">
            {tx.comprobanteUrl
              ? 'Presigned URL segura temporal de lectura (TTL 15 min, ADR-007)'
              : 'Sin captura digital verificable para este pago'}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => onRechazar(tx)}
              className="flex-1 sm:flex-initial py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors cursor-pointer"
            >
              Rechazar Pago
            </button>
            <button
              onClick={() => onAprobar(tx)}
              className="flex-1 sm:flex-initial py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Aprobar y Descontar Saldo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
