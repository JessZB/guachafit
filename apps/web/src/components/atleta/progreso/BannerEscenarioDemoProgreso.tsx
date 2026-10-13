/**
 * Conmutador de escenarios demo antropométricos (SL2, fase B).
 *
 * De `ProgresoPage.tsx:459-491` (solo `isDemoMode`): único conmutador de
 * escenarios de la app. Botones con `aria-pressed` idénticos (R5).
 * Presentacional: props tipadas y callback, sin datos (R1).
 * §6: botones `min-h-11`, 11–12px.
 */
import {
  ESCENARIOS_DEMO_ANTROPOMETRIA,
  ETIQUETAS_ESCENARIO_DEMO_ANTROPOMETRIA,
  type EscenarioDemoAntropometria,
} from '../../../lib/demo-antropometria';

interface BannerEscenarioDemoProgresoProps {
  escenarioActivo: EscenarioDemoAntropometria;
  onCambiar: (escenario: EscenarioDemoAntropometria) => void;
}

export function BannerEscenarioDemoProgreso({
  escenarioActivo,
  onCambiar,
}: BannerEscenarioDemoProgresoProps) {
  return (
    <div className="p-4 rounded-3xl bg-secondary/40 border border-border space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Escenario demo (datos sintéticos)
      </span>
      <div className="flex flex-wrap gap-2">
        {ESCENARIOS_DEMO_ANTROPOMETRIA.map((escenario) => {
          const activo = escenarioActivo === escenario;
          return (
            <button
              key={escenario}
              type="button"
              aria-pressed={activo}
              onClick={() => onCambiar(escenario)}
              className={`min-h-11 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                activo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {ETIQUETAS_ESCENARIO_DEMO_ANTROPOMETRIA[escenario]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
