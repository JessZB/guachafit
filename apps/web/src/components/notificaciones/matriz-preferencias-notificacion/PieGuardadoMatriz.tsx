/**
 * RF-015 (Ola 3): save bar of the preferences matrix (status + retry + save).
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:355-404`.
 * Presentational (R1): typed props plus callback, no data fetching.
 * Honest states (§6.6): success is only declared after a 2xx, handled by the caller.
 */
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

export interface PieGuardadoMatrizProps {
  hayCambios: boolean;
  guardando: boolean;
  mensajeExito: string | null;
  errorGuardado: string | null;
  onGuardar: () => void;
}

export function PieGuardadoMatriz({
  hayCambios,
  guardando,
  mensajeExito,
  errorGuardado,
  onGuardar,
}: PieGuardadoMatrizProps) {
  return (
    <div className="border-t border-border/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/20">
      <div className="space-y-1 min-w-0">
        {errorGuardado && (
          <p
            role="alert"
            className="text-[11px] font-semibold text-destructive flex items-start gap-1.5"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {errorGuardado}
          </p>
        )}
        {!errorGuardado && mensajeExito && (
          <p
            role="status"
            className="text-[11px] font-semibold text-success flex items-start gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {mensajeExito}
          </p>
        )}
        {!errorGuardado && !mensajeExito && (
          <p role="status" className="text-[11px] font-semibold text-muted-foreground">
            {hayCambios ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {errorGuardado && (
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            className="h-11 sm:h-9 px-3 rounded-xl bg-secondary border border-border text-foreground font-bold text-[11px] hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${guardando ? 'animate-spin' : ''}`} />
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={onGuardar}
          disabled={!hayCambios || guardando}
          className="h-11 sm:h-9 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:shadow-none"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
