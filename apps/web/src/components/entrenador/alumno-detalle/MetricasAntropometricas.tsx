/**
 * Métricas antropométricas actuales con deltas (organismo ÚNICO).
 *
 * Presentacional: recibe los controles ordenados (más reciente primero) y pinta las tarjetas
 * de peso, % grasa, cintura, brazo y pecho (cada una con su etiqueta). Cuadrícula de una
 * columna por debajo de 420px. Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). Los deltas viven en
 * `lib/alumno-detalle-metricas.ts` (`calcularDeltasAntropometricos`). Debe montarse sobre
 * `MetricCard` en la consolidación D; hoy conserva el markup.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { calcularDeltasAntropometricos } from '../../../lib/alumno-detalle-metricas';
import type { ControlAntroFila } from '../../../lib/alumno-detalle-controles';

interface MetricasAntropometricasProps {
  controles: ControlAntroFila[];
}

export function MetricasAntropometricas({ controles }: MetricasAntropometricasProps) {
  if (controles.length === 0) return null;
  const actual = controles[0];
  const anterior = controles[1];
  const { deltaPeso, deltaGrasa, deltaCintura } = calcularDeltasAntropometricos(
    actual,
    anterior
  );

  return (
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
        <span className="text-[11px] uppercase font-bold text-muted-foreground block">Peso Actual</span>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold font-mono text-foreground">{actual.pesoKg} kg</p>
          {deltaPeso && (
            <span
              className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                Number(deltaPeso) <= 0
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-warning/10 text-warning border-warning/20'
              }`}
            >
              {Number(deltaPeso) > 0 ? `+${deltaPeso}` : deltaPeso} kg
            </span>
          )}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
        <span className="text-[11px] uppercase font-bold text-muted-foreground block">% Grasa Estimada</span>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold font-mono text-foreground">
            {actual.grasaPorcentaje ? `${actual.grasaPorcentaje}%` : '—'}
          </p>
          {deltaGrasa && (
            <span
              className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                Number(deltaGrasa) <= 0
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-warning/10 text-warning border-warning/20'
              }`}
            >
              {Number(deltaGrasa) > 0 ? `+${deltaGrasa}` : deltaGrasa}%
            </span>
          )}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
        <span className="text-[11px] uppercase font-bold text-muted-foreground block">Cintura</span>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold font-mono text-foreground">
            {actual.cinturaCm ? `${actual.cinturaCm} cm` : '—'}
          </p>
          {deltaCintura && (
            <span
              className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                Number(deltaCintura) <= 0
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-warning/10 text-warning border-warning/20'
              }`}
            >
              {Number(deltaCintura) > 0 ? `+${deltaCintura}` : deltaCintura} cm
            </span>
          )}
        </div>
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
        <span className="text-[11px] uppercase font-bold text-muted-foreground block">Brazo</span>
        <p className="text-2xl font-bold font-mono text-foreground">
          {actual.brazoCm ? `${actual.brazoCm} cm` : '—'}
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
        <span className="text-[11px] uppercase font-bold text-muted-foreground block">Pecho</span>
        <p className="text-2xl font-bold font-mono text-foreground">
          {actual.pechoCm ? `${actual.pechoCm} cm` : '—'}
        </p>
      </div>
    </div>
  );
}
