/**
 * Tooltip del punto activo del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:466-493`. Presentacional: recibe la fecha
 * activa ya resuelta, su posición y las series; no pide datos.
 */
import { valorEnFecha, formatearValorMetrica, type SerieMetrica } from '../../../lib/evolucion-graficos';
import { formatFechaLargaCalendario } from '../../../lib/date-format';
import { CLASES_PUNTO } from './constantes';

interface TooltipEvolucionProps {
  fechaActiva: string;
  izquierdaPx: number;
  series: SerieMetrica[];
}

export function TooltipEvolucion({ fechaActiva, izquierdaPx, series }: TooltipEvolucionProps) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 w-max max-w-[220px] -translate-x-1/2 rounded-2xl border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur"
      style={{ left: izquierdaPx }}
    >
      <p className="text-[11px] font-bold text-foreground">
        {formatFechaLargaCalendario(fechaActiva) ?? fechaActiva}
      </p>
      <ul className="mt-1 space-y-0.5">
        {series.map((serie) => {
          const valor = valorEnFecha(serie, fechaActiva);
          return (
            <li key={`tooltip-${serie.metrica.id}`} className="flex items-center gap-2 text-[11px]">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${CLASES_PUNTO[serie.color]}`}
              />
              <span className="text-muted-foreground">{serie.metrica.etiqueta}</span>
              <span className="ml-auto font-mono font-bold text-foreground">
                {valor === null ? '—' : formatearValorMetrica(serie.metrica, valor)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
