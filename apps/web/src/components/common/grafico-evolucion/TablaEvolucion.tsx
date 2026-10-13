/**
 * Tabla alternativa accesible del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:518-554`: la misma serie en tabla dentro de
 * un `<details>` para lectores de pantalla y teclado. Presentacional, sin datos.
 */
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import { Table2 } from 'lucide-react';
import {
  formatearValorMetrica,
  metricaPorId,
  type SerieMetrica,
} from '../../../lib/evolucion-graficos';
import { formatFechaCalendario } from '../../../lib/date-format';

interface TablaEvolucionProps {
  series: SerieMetrica[];
  evaluacionesFiltradas: ControlAntropometricoDetalleDTO[];
}

export function TablaEvolucion({ series, evaluacionesFiltradas }: TablaEvolucionProps) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 sm:min-h-0 items-center gap-1.5 text-xs font-bold text-primary cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-primary rounded-lg px-1">
        <Table2 className="h-3.5 w-3.5" />
        <span>Ver datos en tabla</span>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-border/80 text-muted-foreground uppercase text-[11px]">
            <tr>
              <th className="py-2 px-2">Fecha</th>
              {series.map((serie) => (
                <th key={`th-${serie.metrica.id}`} className="py-2 px-2">
                  {serie.metrica.etiqueta} ({serie.metrica.unidad})
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 font-mono">
            {evaluacionesFiltradas.map((evaluacion) => (
              <tr key={`fila-${evaluacion.id}`}>
                <td className="py-2 px-2 font-sans font-bold text-foreground">
                  {formatFechaCalendario(evaluacion.fechaEvaluacion) ?? evaluacion.fechaEvaluacion}
                </td>
                {series.map((serie) => {
                  const valor = metricaPorId(serie.metrica.id).extraer(evaluacion);
                  return (
                    <td key={`celda-${serie.metrica.id}-${evaluacion.id}`} className="py-2 px-2">
                      {valor === null ? '—' : formatearValorMetrica(serie.metrica, valor)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
