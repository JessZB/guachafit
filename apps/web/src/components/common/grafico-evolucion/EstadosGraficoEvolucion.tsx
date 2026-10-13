/**
 * Vacíos honestos del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:300-316`: cada rama tiene copy propio
 * (sin mediciones aprobadas / rango con menos de dos / métricas sin datos) y por eso
 * no sustituye mecánicamente al átomo `EstadoVacio` (CANDIDATO no promovido, R3).
 * Presentacional, sin datos.
 */
import { LineChart } from 'lucide-react';

interface EstadosGraficoEvolucionProps {
  sinEvaluaciones: boolean;
  hayMediciones: boolean;
}

export function EstadosGraficoEvolucion({
  sinEvaluaciones,
  hayMediciones,
}: EstadosGraficoEvolucionProps) {
  if (sinEvaluaciones) {
    return (
      <div className="py-10 text-center space-y-2">
        <LineChart className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Aún no hay mediciones aprobadas para graficar. Cuando tu entrenador valide tu primer
          check-in, aquí verás tu evolución.
        </p>
      </div>
    );
  }
  return (
    <div className="py-10 text-center space-y-2">
      <LineChart className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
        {hayMediciones
          ? 'Aún no hay mediciones suficientes para graficar en este rango (mínimo dos). Cambia el rango o registra un nuevo check-in.'
          : 'No hay mediciones de las métricas elegidas en este rango. Cambia el rango o activa otra métrica.'}
      </p>
    </div>
  );
}
