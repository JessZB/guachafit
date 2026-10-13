/**
 * Honest load error with a retry action (no demo queue outside demo mode).
 *
 * Presentational: the message and the retry callback arrive as props.
 */
import { AlertCircle } from 'lucide-react';

export interface ErrorBandejaConciliacionProps {
  mensaje: string;
  onReintentar: () => void;
}

export function ErrorBandejaConciliacion({ mensaje, onReintentar }: ErrorBandejaConciliacionProps) {
  return (
    <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
      <p className="text-xs text-muted-foreground">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
      >
        Reintentar
      </button>
    </div>
  );
}
