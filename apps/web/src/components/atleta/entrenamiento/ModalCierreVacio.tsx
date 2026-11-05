import { AlertTriangle, Coffee, X } from 'lucide-react';
import { TipoCierreSesion } from '@guachafit/shared';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';

export interface ModalCierreVacioProps {
  isFinishing: boolean;
  onClose: () => void;
  onConfirm: (tipo: TipoCierreSesion) => void;
}

/**
 * Modal RF-001 Escenario 5: cierre de sesión sin series completadas.
 * CANDIDATO (R3 duda): similitud con `common/DialogoConfirmacion.tsx` sin encaje 1:1
 * (2 opciones + cancelar). Se decide en fase D.
 */
export function ModalCierreVacio({ isFinishing, onClose, onConfirm }: ModalCierreVacioProps) {
  const { saliendo, cerrar } = useSalidaModal(onClose);
  const refDialogo = useDialogoAccesible({ abierto: true, onCerrar: cerrar });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-empty-close-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-md space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-warning/15 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="modal-empty-close-title"
                className="font-bold text-base text-foreground leading-tight"
              >
                No has marcado ninguna serie
              </h3>
              <p className="text-xs text-muted-foreground">
                ¿Quieres registrar este día como descansado o incompleto?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Ninguna opción suma racha. Si registras el día como descansado o incompleto, la sesión
          queda en tu historial y puedes repetir el entrenamiento más tarde.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isFinishing}
            onClick={() => onConfirm(TipoCierreSesion.DESCANSADA)}
            className="min-h-11 py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 border border-border font-bold text-xs text-foreground transition-all active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Coffee className="h-4 w-4 text-warning" />
            <span>Registrar como descansado</span>
          </button>
          <button
            type="button"
            disabled={isFinishing}
            onClick={() => onConfirm(TipoCierreSesion.INCOMPLETA)}
            className="min-h-11 py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 border border-border font-bold text-xs text-foreground transition-all active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span>Registrar como incompleto</span>
          </button>
        </div>

        <button
          type="button"
          onClick={cerrar}
          className="w-full min-h-11 py-2.5 rounded-2xl bg-transparent text-muted-foreground hover:text-foreground text-xs font-bold transition-colors cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
