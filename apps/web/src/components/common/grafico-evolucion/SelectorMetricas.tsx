/**
 * Selector-leyenda de métricas del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:262-298`: el mismo chip identifica la serie
 * en el gráfico, más el aviso `motivo` cuando un tope rechaza el cambio (nunca se falla
 * en silencio). Presentacional: recibe props y callback, no pide datos.
 */
import { AlertCircle } from 'lucide-react';
import {
  METRICAS_EVOLUCION,
  type ColorMetrica,
  type IdMetricaEvolucion,
} from '../../../lib/evolucion-graficos';
import { CLASES_PUNTO } from './constantes';

interface SelectorMetricasProps {
  idsActivos: IdMetricaEvolucion[];
  colorResuelto: Map<IdMetricaEvolucion, ColorMetrica>;
  motivo: string | null;
  onAlternar: (id: IdMetricaEvolucion) => void;
}

export function SelectorMetricas({
  idsActivos,
  colorResuelto,
  motivo,
  onAlternar,
}: SelectorMetricasProps) {
  return (
    <>
      {/* Selector-leyenda de métricas: el mismo chip identifica la serie en el gráfico. */}
      <div
        role="group"
        aria-label="Métricas del gráfico"
        className="flex flex-wrap items-center gap-1.5"
      >
        {METRICAS_EVOLUCION.map((metrica) => {
          const activa = idsActivos.includes(metrica.id);
          const color = colorResuelto.get(metrica.id) ?? metrica.colorPreferido;
          return (
            <button
              key={metrica.id}
              type="button"
              onClick={() => onAlternar(metrica.id)}
              aria-pressed={activa}
              title={`${metrica.etiqueta} (${metrica.unidad})`}
              className={`min-h-11 sm:min-h-0 inline-flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                activa
                  ? 'bg-secondary border-border text-foreground'
                  : 'bg-transparent border-dashed border-border/70 text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${CLASES_PUNTO[color]} ${activa ? '' : 'opacity-40'}`}
              />
              <span>
                {metrica.etiqueta}
                <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                  {metrica.unidad}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {motivo && (
        <p role="status" className="text-[11px] font-semibold text-warning flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{motivo}</span>
        </p>
      )}
    </>
  );
}
