/**
 * SVG del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:329-463`: rejilla del eje izquierdo, ejes
 * con unidad por escala, marcas del eje X en fechas locales, series por segmentos
 * (la línea se corta donde falta la métrica) y guía vertical del punto activo.
 * Presentacional: recibe geometría y escalas ya calculadas, no pide datos.
 */
import { mapearY, type SerieMetrica } from '../../../lib/evolucion-graficos';
import { formatFechaCalendario } from '../../../lib/date-format';
import { ALTO_GRAFICO, CLASES_FILL, CLASES_STROKE } from './constantes';
import { formatearTickEvolucion } from '../../../lib/grafico-evolucion-formato';

export interface TickEje {
  valor: number;
  y: number;
}

interface SvgEvolucionProps {
  ancho: number;
  areaX: number;
  areaXFin: number;
  areaY: number;
  areaYFin: number;
  series: SerieMetrica[];
  dominioIzquierda: { min: number; max: number } | null;
  dominioDerecha: { min: number; max: number } | null;
  ticksIzquierda: TickEje[];
  ticksDerecha: TickEje[];
  ticksX: string[];
  unidadIzquierda: string | null;
  unidadDerecha: string | null;
  resumen: string;
  fechaActiva: string | null;
  fechasMs: number[];
  xDeFecha: (fecha: string) => number;
}

export function SvgEvolucion({
  ancho,
  areaX,
  areaXFin,
  areaY,
  areaYFin,
  series,
  dominioIzquierda,
  dominioDerecha,
  ticksIzquierda,
  ticksDerecha,
  ticksX,
  unidadIzquierda,
  unidadDerecha,
  resumen,
  fechaActiva,
  fechasMs,
  xDeFecha,
}: SvgEvolucionProps) {
  return (
    <svg
      role="img"
      aria-label={resumen}
      width={ancho}
      height={ALTO_GRAFICO}
      viewBox={`0 0 ${ancho} ${ALTO_GRAFICO}`}
      className="w-full h-auto select-none"
    >
      {/* Rejilla horizontal del eje izquierdo */}
      {ticksIzquierda.map((tick) => (
        <line
          key={`grid-${tick.y}`}
          x1={areaX}
          x2={areaXFin}
          y1={tick.y}
          y2={tick.y}
          className="stroke-border/70"
          strokeWidth={1}
        />
      ))}

      {/* Eje izquierdo */}
      {ticksIzquierda.map((tick) => (
        <text
          key={`tick-izq-${tick.y}`}
          x={areaX - 6}
          y={tick.y + 3.5}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={11}
        >
          {formatearTickEvolucion(tick.valor)}
        </text>
      ))}
      {unidadIzquierda && (
        <text
          x={4}
          y={12}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={11}
          fontWeight={700}
        >
          {unidadIzquierda}
        </text>
      )}

      {/* Eje derecho (segunda unidad) */}
      {ticksDerecha.map((tick) => (
        <text
          key={`tick-der-${tick.y}`}
          x={areaXFin + 6}
          y={tick.y + 3.5}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={11}
        >
          {formatearTickEvolucion(tick.valor)}
        </text>
      ))}
      {unidadDerecha && (
        <text
          x={ancho - 4}
          y={12}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={11}
          fontWeight={700}
        >
          {unidadDerecha}
        </text>
      )}

      {/* Marcas del eje X */}
      {ticksX.map((fecha, indice) => {
        const x = xDeFecha(fecha);
        const esPrimera = indice === 0;
        const esUltima = indice === ticksX.length - 1;
        return (
          <g key={`tick-x-${fecha}`}>
            <line x1={x} x2={x} y1={areaYFin} y2={areaYFin + 4} className="stroke-border" strokeWidth={1} />
            <text
              x={x}
              y={ALTO_GRAFICO - 12}
              textAnchor={esPrimera ? 'start' : esUltima ? 'end' : 'middle'}
              className="fill-muted-foreground"
              fontSize={11}
            >
              {formatFechaCalendario(fecha) ?? fecha}
            </text>
          </g>
        );
      })}

      {/* Series */}
      {series.map((serie) =>
        serie.segmentos.map((segmento, indiceSegmento) => (
          <g key={`${serie.metrica.id}-seg-${indiceSegmento}`}>
            {segmento.length > 1 && (
              <polyline
                points={segmento
                  .map(
                    (punto) =>
                      `${xDeFecha(punto.fecha)},${mapearY(punto.valor, serie.eje === 'izquierda' ? dominioIzquierda! : dominioDerecha!, areaY, areaYFin)}`,
                  )
                  .join(' ')}
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={CLASES_STROKE[serie.color]}
              />
            )}
            {segmento.map((punto) => {
              const dominio = serie.eje === 'izquierda' ? dominioIzquierda! : dominioDerecha!;
              const activo = fechaActiva === punto.fecha;
              return (
                <circle
                  key={`${serie.metrica.id}-${punto.fecha}`}
                  cx={xDeFecha(punto.fecha)}
                  cy={mapearY(punto.valor, dominio, areaY, areaYFin)}
                  r={activo ? 5.5 : 3.5}
                  className={`${CLASES_FILL[serie.color]} ${activo ? '' : 'opacity-90'}`}
                  stroke="var(--color-card)"
                  strokeWidth={activo ? 2 : 1}
                />
              );
            })}
          </g>
        )),
      )}

      {/* Guía vertical del punto activo */}
      {fechaActiva && fechasMs.length > 0 && (
        <line
          x1={xDeFecha(fechaActiva)}
          x2={xDeFecha(fechaActiva)}
          y1={areaY}
          y2={areaYFin}
          className="stroke-foreground/40"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
}
