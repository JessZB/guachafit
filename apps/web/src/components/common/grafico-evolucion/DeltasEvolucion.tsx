/**
 * Deltas del rango por métrica activa (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:497-515` (Gherkin Escenario 1).
 * Presentacional: recibe deltas y colores ya resueltos, no pide datos.
 */
import {
  formatearDeltaMetrica,
  formatearValorMetrica,
  type ColorMetrica,
  type DeltaMetrica,
  type IdMetricaEvolucion,
} from '../../../lib/evolucion-graficos';
import { CLASES_PUNTO } from './constantes';

interface DeltasEvolucionProps {
  deltas: DeltaMetrica[];
  colorResuelto: Map<IdMetricaEvolucion, ColorMetrica>;
}

export function DeltasEvolucion({ deltas, colorResuelto }: DeltasEvolucionProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {deltas.map((delta) => (
        <div
          key={`delta-${delta.metrica.id}`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/50 border border-border"
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${CLASES_PUNTO[colorResuelto.get(delta.metrica.id) ?? delta.metrica.colorPreferido]}`}
          />
          <span className="text-[11px] font-bold text-foreground">{delta.metrica.etiqueta}</span>
          <span className="font-mono text-xs font-bold text-foreground">
            {delta.valorFinal === null ? '—' : formatearValorMetrica(delta.metrica, delta.valorFinal)}
          </span>
          <span className="font-mono text-[11px] font-bold text-muted-foreground">
            {delta.diferencia === null
              ? 'sin delta (una sola medición)'
              : `en el rango: ${formatearDeltaMetrica(delta.metrica, delta.diferencia)}`}
          </span>
        </div>
      ))}
    </div>
  );
}
