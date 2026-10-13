/**
 * Rejection dialog: a reason is required so the student knows what to fix.
 *
 * Presentational: the container mounts it only while open; the transaction,
 * the reason draft, and every callback arrive as props.
 */
import { AlertCircle, X } from 'lucide-react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';

export interface ModalRechazoConciliacionProps {
  motivo: string;
  onCambiarMotivo: (valor: string) => void;
  onCerrar: () => void;
  onConfirmar: () => void;
}

export function ModalRechazoConciliacion({
  motivo,
  onCambiarMotivo,
  onCerrar,
  onConfirmar,
}: ModalRechazoConciliacionProps) {
  const refModalRechazo = useDialogoAccesible({
    abierto: true,
    onCerrar,
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
            <AlertCircle className="h-5 w-5" />
            <h3
              id="conciliacion-rechazo-titulo"
              className="font-bold text-base text-foreground"
            >
              Rechazar Transacción
            </h3>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar rechazo de transacción"
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Se requiere registrar un motivo para que el alumno conozca la razón y pueda corregir el reporte o comprobante.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">Motivo del Rechazo</label>
          <textarea
            rows={3}
            required
            value={motivo}
            onChange={(e) => onCambiarMotivo(e.target.value)}
            placeholder="Ej: La referencia bancaria no coincide con el extracto o el monto recibido fue incompleto."
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-destructive resize-none"
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onCerrar}
            className="flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={!motivo.trim()}
            className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md disabled:opacity-50"
          >
            Confirmar Rechazo
          </button>
        </div>
      </div>
    </div>
  );
}
