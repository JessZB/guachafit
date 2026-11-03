/**
 * Panel de solo lectura del alumno presencial (SL2, fase B).
 *
 * De `ProgresoPage.tsx:401-436` (RN-03): render-función usada en 2 sitios
 * (hub y formulario). Textos, roles e iconos idénticos (R5). Presentacional:
 * props tipadas y callback, sin datos (R1). §6: botón `min-h-11`, 11px mínimo.
 */
import { Lock, ShieldCheck, TrendingUp } from 'lucide-react';

interface PanelSoloLecturaProgresoProps {
  mensajeServidor?: string | null;
  onVerHistorial: () => void;
}

export function PanelSoloLecturaProgreso({
  mensajeServidor,
  onVerHistorial,
}: PanelSoloLecturaProgresoProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-primary/30 shadow-md space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-2xl bg-primary/15 text-primary shrink-0">
          <Lock className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">
            Tus medidas las registra tu entrenador
          </h3>
          <p className="text-xs text-muted-foreground">
            En modalidad presencial tus medidas se toman en sala y quedan verificadas por tu
            entrenador. Puedes consultar tu historial y tu evolución cuando quieras.
          </p>
          {mensajeServidor && (
            <p
              role="alert"
              className="text-[11px] font-semibold text-warning flex items-start gap-1.5 pt-1"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{mensajeServidor}</span>
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onVerHistorial}
        className="w-full min-h-11 py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <TrendingUp className="h-4 w-4 text-primary" />
        <span>Ver evolución</span>
      </button>
    </div>
  );
}
