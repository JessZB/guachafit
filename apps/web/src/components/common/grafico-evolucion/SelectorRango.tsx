/**
 * Selector de rango del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:245-259`. Presentacional: recibe el rango
 * activo y el callback, no pide datos.
 */
import { RANGOS_EVOLUCION, type RangoEvolucion } from '../../../lib/evolucion-graficos';
import { BotonRango } from './BotonRango';

interface SelectorRangoProps {
  rango: RangoEvolucion;
  onCambiar: (rango: RangoEvolucion) => void;
}

export function SelectorRango({ rango, onCambiar }: SelectorRangoProps) {
  return (
    <div role="group" aria-label="Rango de fechas" className="flex flex-wrap items-center gap-1.5">
      {RANGOS_EVOLUCION.map((opcion) => (
        <BotonRango
          key={opcion.id}
          activo={rango === opcion.id}
          etiqueta={opcion.etiqueta}
          aria={opcion.aria}
          onClick={() => onCambiar(opcion.id)}
        />
      ))}
    </div>
  );
}
