/**
 * Rejection dialog: a reason is required so the student knows what to fix.
 *
 * Presentational: the container mounts it only while open; the transaction,
 * the reason draft, the in-flight state, the failure, and every callback arrive
 * as props. The failure is shown inside the dialog, no close is accepted while
 * a rejection is in flight, and the reason label is linked to the textarea.
 */
import { useId } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';

export interface ModalRechazoConciliacionProps {
  alumno: string;
  montoTexto: string;
  motivo: string;
  procesando: boolean;
  error: string | null;
  onCambiarMotivo: (valor: string) => void;
  onCerrar: () => void;
  onConfirmar: () => void;
}

export function ModalRechazoConciliacion({
  alumno,
  montoTexto,
  motivo,
  procesando,
  error,
  onCambiarMotivo,
  onCerrar,
  onConfirmar,
}: ModalRechazoConciliacionProps) {
  const idMotivo = useId();
  const refModalRechazo = useDialogoAccesible({
    abierto: true,
    onCerrar: () => {
      if (!procesando) onCerrar();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div
        ref={refModalRechazo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conciliacion-rechazo-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-destructive/30 shadow-2xl w-full max-w-md space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            <h3
              id="conciliacion-rechazo-titulo"
              className="font-bold text-base text-foreground"
            >
              Rechazar pago
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            aria-label="Cerrar rechazo de pago"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Pago de{' '}
          <span className="font-semibold text-foreground">{alumno}</span>
          {' · '}
          {montoTexto}
        </p>

        <p className="text-xs text-muted-foreground">
          Se requiere registrar un motivo para que el alumno conozca la razón y pueda corregir el reporte o comprobante.
        </p>

        <div className="space-y-1">
          <label htmlFor={idMotivo} className="text-xs font-semibold text-foreground">
            Motivo del rechazo
          </label>
          <textarea
            id={idMotivo}
            rows={3}
            required
            disabled={procesando}
            value={motivo}
            onChange={(e) => onCambiarMotivo(e.target.value)}
            placeholder="Ej: La referencia bancaria no coincide con el extracto o el monto recibido fue incompleto."
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-hidden focus:border-destructive resize-none"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="min-h-11 flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!motivo.trim() || procesando}
            aria-busy={procesando}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md disabled:opacity-50"
          >
            {procesando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}
