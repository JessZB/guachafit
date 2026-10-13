import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface IndicadorColaOfflineProps {
  resumen: string;
  rechazados: number;
  sincronizando: boolean;
  onVerDetalles: () => void;
}

/**
 * WU4: indicador discreto de la cola offline; ausente cuando todo está sincronizado.
 * CANDIDATO (R3 duda): mismo dato que `Header.tsx` con UI distinta; se promueve en fase D.
 */
export function IndicadorColaOffline({
  resumen,
  rechazados,
  sincronizando,
  onVerDetalles,
}: IndicadorColaOfflineProps) {
  return (
    <button
      type="button"
      onClick={onVerDetalles}
      title={`${resumen}. Toca para ver qué falta por enviar.`}
      className={`w-full p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer active:scale-[0.99] ${
        rechazados > 0
          ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/15'
          : 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/15'
      }`}
    >
      {rechazados > 0 ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <RefreshCw className={`h-4 w-4 shrink-0 ${sincronizando ? 'animate-spin' : ''}`} />
      )}
      <span>{resumen}</span>
      <span className="ml-auto text-xs uppercase tracking-wider font-bold opacity-80">
        Ver detalles
      </span>
    </button>
  );
}
