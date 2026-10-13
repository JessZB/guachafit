/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote B, presentacional).
 *
 * Error de envío + pie con Cancelar/Asignar. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:482-515`. No pide datos.
 */
import { AlertCircle, Loader2 } from 'lucide-react';

export function PieAsignacion({
  errorAsignacion,
  seleccionados,
  isAsignando,
  onCancelar,
  onConfirmar,
}: {
  errorAsignacion: string | null;
  seleccionados: number;
  isAsignando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <>
      {errorAsignacion && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorAsignacion}</span>
        </div>
      )}

      <div className="pt-3 border-t border-border/80 flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onCancelar}
          disabled={isAsignando}
          className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={seleccionados === 0 || isAsignando}
          aria-busy={isAsignando}
          className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          {isAsignando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          <span>
            {isAsignando
              ? 'Asignando...'
              : `Asignar a ${seleccionados} alumno${seleccionados === 1 ? '' : 's'}`}
          </span>
        </button>
      </div>
    </>
  );
}

