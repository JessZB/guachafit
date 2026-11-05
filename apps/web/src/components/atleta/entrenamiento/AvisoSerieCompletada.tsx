import { CheckCircle2 } from 'lucide-react';
import { BotonTactil } from '../../ui/BotonTactil';

export interface AvisoSerieCompletadaProps {
  numeroSerie: number;
  onDeshacer: () => void;
}

/**
 * Franja temporal tras marcar una serie: confirma el marcado y ofrece «Deshacer» sin diálogo.
 * Presentacional: el plazo de visibilidad lo gestiona `useAvisoSerieCompletada`. `role="status"`
 * ya anuncia el texto; entra solo con opacidad y fluye con el contenido (nunca fixed).
 */
export function AvisoSerieCompletada({ numeroSerie, onDeshacer }: AvisoSerieCompletadaProps) {
  return (
    <div
      role="status"
      className="animate-fade-in flex items-center justify-between gap-3 p-3 rounded-3xl bg-success/10 border border-success/30"
    >
      <p className="flex items-center gap-2 min-w-0 text-sm font-bold text-foreground">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
        <span>Serie {numeroSerie} completada</span>
      </p>
      <BotonTactil variante="secundaria" onClick={onDeshacer} className="shrink-0">
        Deshacer
      </BotonTactil>
    </div>
  );
}
