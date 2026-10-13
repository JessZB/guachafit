/**
 * Ficha médica confidencial del alumno (molécula ÚNICA, superficie solo-coach).
 *
 * Presentacional: valor y callback por props (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-3).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { Lock } from 'lucide-react';

interface FichaMedicaConfidencialProps {
  valor: string;
  onCambiar: (valor: string) => void;
}

export function FichaMedicaConfidencial({ valor, onCambiar }: FichaMedicaConfidencialProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2 text-primary">
          <Lock className="h-4 w-4" />
          <h3 className="font-bold text-sm text-foreground">Ficha Médica Confidencial</h3>
        </div>
        <span className="text-xs text-muted-foreground">Se guarda cifrada</span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Anotaciones privadas sobre patologías, hernias, cirugías previas y limitaciones biomecánicas.
        Este campo es <strong className="text-foreground">estrictamente invisible</strong> para el alumno.
      </p>

      <textarea
        rows={4}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Lesiones previas, dolor lumbar, contraindicaciones específicas..."
        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
      />
    </div>
  );
}
