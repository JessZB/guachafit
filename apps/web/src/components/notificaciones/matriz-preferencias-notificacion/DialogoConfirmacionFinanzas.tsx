/**
 * RF-015 RN-02 (Ola 3): finance minimum-channel warning dialog.
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:407-463`.
 * Presentational (R1): typed props plus callbacks, no data fetching. The
 * `useDialogoAccesible` hook only manages focus/Escape/restore (same pattern
 * as `common/DialogoConfirmacion.tsx`); it is always called at the top level
 * and the dialog returns `null` while closed.
 */
import { AlertTriangle } from 'lucide-react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import { TEXTO_ADVERTENCIA_FINANZAS } from '../../../lib/preferencias-notificacion';

export interface DialogoConfirmacionFinanzasProps {
  abierto: boolean;
  guardando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function DialogoConfirmacionFinanzas({
  abierto,
  guardando,
  onCancelar,
  onConfirmar,
}: DialogoConfirmacionFinanzasProps) {
  const { saliendo, cerrar } = useSalidaModal(onCancelar);
  const refModalConfirmacion = useDialogoAccesible({
    abierto,
    onCerrar: cerrar,
  });

  if (!abierto) return null;

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refModalConfirmacion}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rn02-finanzas-titulo"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-3">
          <span className="p-2.5 rounded-xl bg-warning/15 text-warning shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3
              id="rn02-finanzas-titulo"
              className="font-bold text-base text-foreground leading-tight"
            >
              ¿Desactivar todos los avisos de pagos?
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5">{TEXTO_ADVERTENCIA_FINANZAS}</p>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Si desactivas ambos canales no recibirás recordatorios de cuotas ni confirmaciones de
          pago. Puedes reactivarlos cuando quieras.
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-border/70">
          <button
            type="button"
            onClick={cerrar}
            className="h-11 sm:h-9 px-4 rounded-xl bg-secondary border border-border text-foreground font-bold text-xs hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer"
          >
            Mantener canales activos
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={guardando}
            className="h-11 sm:h-9 px-4 rounded-xl bg-destructive text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            Sí, desactivar de todos modos
          </button>
        </div>
      </div>
    </div>
  );
}
