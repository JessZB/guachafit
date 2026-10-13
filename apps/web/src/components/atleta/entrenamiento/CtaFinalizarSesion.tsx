import { Clock } from 'lucide-react';

export interface CtaFinalizarSesionProps {
  onAbrir: () => void;
}

/** CTA "Finalizar entrenamiento" (ÚNICO, ancla de specs). */
export function CtaFinalizarSesion({ onAbrir }: CtaFinalizarSesionProps) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <Clock className="h-4 w-4 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
        </div>
        <span>Entrenamiento activo. Marca tus series y pesos al completarlas.</span>
      </div>
      <button
        type="button"
        onClick={onAbrir}
        className="w-full min-h-11 py-3.5 px-5 rounded-2xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm shadow-md shadow-primary/25 active:scale-98 transition-all cursor-pointer"
      >
        Finalizar entrenamiento
      </button>
    </div>
  );
}
