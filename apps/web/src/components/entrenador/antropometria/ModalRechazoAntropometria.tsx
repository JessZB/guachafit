/**
 * Dialogo de rechazo con motivo libre (RN-04; antes: textos fijos prefabricados).
 *
 * Recorte verbatim: el `useDialogoAccesible` vivia en la pagina con
 * `abierto: controlARechazar !== null`; aqui el modal solo se monta abierto y el hook
 * conserva el mismo `onCerrar` (foco, Escape y restore identicos). El motivo vive en el
 * contenedor para que el error honesto D5 sobreviva al ciclo abrir/cerrar.
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { useDialogoAccesible } from "../../../lib/use-dialogo-accesible";
import { AlertCircle, X } from "lucide-react";

interface ModalRechazoAntropometriaProps {
  control: ControlAntropometricoDetalleDTO;
  alumnoEtiqueta: string;
  motivo: string;
  error: string | null;
  isRechazando: boolean;
  onCambiarMotivo: (motivo: string) => void;
  onCerrar: () => void;
  onConfirmar: (id: string, motivo: string) => void;
}

export function ModalRechazoAntropometria({
  control,
  alumnoEtiqueta,
  motivo,
  error,
  isRechazando,
  onCambiarMotivo,
  onCerrar,
  onConfirmar,
}: ModalRechazoAntropometriaProps) {
  const refModalRechazo = useDialogoAccesible({ abierto: true, onCerrar });

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRechazando) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refModalRechazo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-rechazo-antro-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <h3
              id="modal-rechazo-antro-title"
              className="font-bold text-base text-foreground"
            >
              Rechazar evaluación
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={isRechazando}
            aria-label="Cerrar rechazo"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Escribe el motivo del rechazo para{" "}
          <span className="font-bold text-foreground">{alumnoEtiqueta}</span>.
          Quedará registrado en el control como retroalimentación (RN-04).
        </p>

        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="motivo-rechazo-antro"
          >
            Motivo del rechazo
          </label>
          <textarea
            id="motivo-rechazo-antro"
            rows={4}
            value={motivo}
            onChange={(e) => {
              onCambiarMotivo(e.target.value);
            }}
            placeholder="Ej. Las fotos salieron borrosas y no permiten validar la postura; repite la toma con mejor luz."
            aria-invalid={Boolean(error)}
            className={`w-full px-3 py-2 rounded-xl bg-background border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none ${
              error ? "border-destructive" : "border-border"
            }`}
          />
          {error && (
            <p
              role="alert"
              className="text-[11px] font-semibold text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={isRechazando}
            className="min-h-11 py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(control.id, motivo)}
            disabled={isRechazando || motivo.trim().length === 0}
            className="min-h-11 py-2.5 px-4 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRechazando ? "Rechazando..." : "Confirmar rechazo"}
          </button>
        </div>
      </div>
    </div>
  );
}
