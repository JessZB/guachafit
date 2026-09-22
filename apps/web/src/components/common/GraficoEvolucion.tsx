/**
 * RF-004 RN-01: gráfico SVG de evolución corporal multieje, sin dependencias nuevas.
 *
 * Decisión de implementación (documentada): SVG propio en lugar de una librería de charts.
 * El repo no trae ninguna, los tokens semánticos claro/oscuro se consumen directo con clases
 * Tailwind (`stroke-primary`, `fill-warning`, …) y la accesibilidad (role="img" + resumen +
 * tabla alternativa) queda bajo control total sin cargar un runtime extra en la PWA.
 *
 * - Métricas: selector-leyenda con hasta 3 activas y 2 unidades por gráfico (eje Y doble).
 * - Rangos: 1M / 3M / 6M / 1A / Todo, con control táctil ≥44px y estado activo visible.
 * - Eje X en fechas locales (helpers de `date-format`); eje Y con unidad por escala.
 * - Tooltip al hover/tap con fecha larga y el valor de cada métrica activa en esa fecha.
 * - Vacíos honestos y tabla alternativa en `<details>` para lectores de pantalla/teclado.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, LineChart, Table2 } from 'lucide-react';
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import { formatFechaCalendario, formatFechaLargaCalendario } from '../../lib/date-format';
import {
  METRICAS_EVOLUCION,
  RANGOS_EVOLUCION,
  agruparSeriesPorEje,
  alternarMetricaActiva,
  calcularDeltas,
  calcularDominio,
  construirSeries,
  encontrarIndiceMasCercano,
  fechaCalendarioMs,
  fechasOrdenadas,
  filtrarPorRango,
  formatearDeltaMetrica,
  formatearValorMetrica,
  mapearX,
  mapearY,
  metricaPorId,
  resumenAccesible,
  seleccionarTicksX,
  valorEnFecha,
  type ColorMetrica,
  type IdMetricaEvolucion,
  type RangoEvolucion,
  type SerieMetrica,
} from '../../lib/evolucion-graficos';

const CLASES_STROKE: Record<ColorMetrica, string> = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  info: 'stroke-info',
  warning: 'stroke-warning',
  decor: 'stroke-decor',
};

const CLASES_FILL: Record<ColorMetrica, string> = {
  primary: 'fill-primary',
  success: 'fill-success',
  info: 'fill-info',
  warning: 'fill-warning',
  decor: 'fill-decor',
};

const CLASES_PUNTO: Record<ColorMetrica, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  decor: 'bg-decor',
};

const ALTO_GRAFICO = 250;
const MARGENES = { arriba: 18, abajo: 34, izquierda: 46, derecha: 46 };

export interface GraficoEvolucionProps {
  /** Serie cronológica ascendente de controles aprobados (contrato de la API). */
  evaluaciones: ControlAntropometricoDetalleDTO[];
  /** Métricas activas al montar; por defecto el doble eje de RN-01 (peso + % grasa). */
  metricasIniciales?: IdMetricaEvolucion[];
  /** Rango inicial; por defecto `todo` para que la primera vista nunca parezca vacía. */
  rangoInicial?: RangoEvolucion;
  className?: string;
}

/** Mide el ancho real del contenedor para renderizar el SVG a píxeles 1:1 (texto nítido). */
function useAnchoContenedor(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(640);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const medir = () => setAncho(Math.max(280, Math.round(nodo.getBoundingClientRect().width)));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return [ref, ancho];
}

function formatearTick(valor: number): string {
  return Math.abs(valor) >= 100 ? valor.toFixed(0) : valor.toFixed(1);
}

function valoresDeSeries(series: SerieMetrica[]): number[] {
  return series.flatMap((serie) => serie.puntos.map((punto) => punto.valor));
}

function BotonRango({
  activo,
  etiqueta,
  aria,
  onClick,
}: {
  activo: boolean;
  etiqueta: string;
  aria: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={aria}
      className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
        activo
          ? 'bg-primary text-primary-foreground shadow-xs'
          : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {etiqueta}
    </button>
  );
}

export function GraficoEvolucion({
  evaluaciones,
  metricasIniciales = ['peso', 'grasa'],
  rangoInicial = 'todo',
  className = '',
}: GraficoEvolucionProps) {
  const [contenedorRef, ancho] = useAnchoContenedor();
  const [idsActivos, setIdsActivos] = useState<IdMetricaEvolucion[]>(metricasIniciales);
  const [rango, setRango] = useState<RangoEvolucion>(rangoInicial);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [fechaActiva, setFechaActiva] = useState<string | null>(null);

  const evaluacionesFiltradas = useMemo(
    () => filtrarPorRango(evaluaciones, rango),
    [evaluaciones, rango]
  );
  const series = useMemo(
    () => construirSeries(evaluacionesFiltradas, idsActivos),
    [evaluacionesFiltradas, idsActivos]
  );
  const deltas = useMemo(
    () => calcularDeltas(evaluacionesFiltradas, idsActivos),
    [evaluacionesFiltradas, idsActivos]
  );
  const fechas = useMemo(() => fechasOrdenadas(evaluacionesFiltradas), [evaluacionesFiltradas]);

  const maxPuntos = series.reduce((maximo, serie) => Math.max(maximo, serie.puntos.length), 0);
  const hayMediciones = series.some((serie) => serie.puntos.length > 0);
  const puedeGraficar = maxPuntos >= 2;

  const { izquierda, derecha } = useMemo(() => agruparSeriesPorEje(series), [series]);

  /** Color RESUELTO por métrica activa: el chip de leyenda nunca miente sobre el color de la línea. */
  const colorResuelto = useMemo(() => {
    const mapa = new Map<IdMetricaEvolucion, ColorMetrica>();
    for (const serie of series) mapa.set(serie.metrica.id, serie.color);
    return mapa;
  }, [series]);
  const dominioIzquierda = useMemo(() => calcularDominio(valoresDeSeries(izquierda)), [izquierda]);
  const dominioDerecha = useMemo(
    () => (derecha.length > 0 ? calcularDominio(valoresDeSeries(derecha)) : null),
    [derecha]
  );

  const margenDerecha = derecha.length > 0 ? MARGENES.derecha : 18;
  const areaX = MARGENES.izquierda;
  const areaXFin = Math.max(areaX + 10, ancho - margenDerecha);
  const areaY = MARGENES.arriba;
  const areaYFin = ALTO_GRAFICO - MARGENES.abajo;

  const fechasMs = useMemo(() => fechas.map((fecha) => fechaCalendarioMs(fecha)), [fechas]);
  const minMs = fechasMs.length > 0 ? Math.min(...fechasMs) : 0;
  const maxMs = fechasMs.length > 0 ? Math.max(...fechasMs) : 1;

  const ticksX = useMemo(() => seleccionarTicksX(fechas, ancho < 480 ? 3 : 4), [fechas, ancho]);

  const ticksIzquierda = useMemo(() => {
    if (!dominioIzquierda) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const valor = dominioIzquierda.min + ((dominioIzquierda.max - dominioIzquierda.min) * i) / 4;
      return { valor, y: mapearY(valor, dominioIzquierda, areaY, areaYFin) };
    });
  }, [dominioIzquierda, areaY, areaYFin]);

  const ticksDerecha = useMemo(() => {
    if (!dominioDerecha) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const valor = dominioDerecha.min + ((dominioDerecha.max - dominioDerecha.min) * i) / 4;
      return { valor, y: mapearY(valor, dominioDerecha, areaY, areaYFin) };
    });
  }, [dominioDerecha, areaY, areaYFin]);

  const resumen = useMemo(
    () => resumenAccesible(evaluacionesFiltradas, deltas, formatFechaLargaCalendario),
    [evaluacionesFiltradas, deltas]
  );

  const xDeFecha = (fecha: string) =>
    mapearX(fechaCalendarioMs(fecha), minMs, maxMs, areaX, areaXFin);

  const alMoverPuntero = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (!puedeGraficar || fechasMs.length === 0) return;
    const rect = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - rect.left;
    const indice = encontrarIndiceMasCercano(fechasMs, x);
    if (indice >= 0) setFechaActiva(fechas[indice]);
  };

  const alternarMetrica = (id: IdMetricaEvolucion) => {
    const resultado = alternarMetricaActiva(idsActivos, id);
    setMotivo(resultado.motivo);
    if (resultado.cambio) setIdsActivos(resultado.activas);
  };

  const unidadIzquierda = izquierda[0]?.metrica.unidad ?? null;
  const unidadDerecha = derecha[0]?.metrica.unidad ?? null;

  return (
    <section
      className={`p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4 ${className}`}
      aria-label="Evolución corporal"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Evolución corporal</h3>
        </div>

        <div
          role="group"
          aria-label="Rango de fechas"
          className="flex flex-wrap items-center gap-1.5"
        >
          {RANGOS_EVOLUCION.map((opcion) => (
            <BotonRango
              key={opcion.id}
              activo={rango === opcion.id}
              etiqueta={opcion.etiqueta}
              aria={opcion.aria}
              onClick={() => setRango(opcion.id)}
            />
          ))}
        </div>
      </div>

      {/* Selector-leyenda de métricas: el mismo chip identifica la serie en el gráfico. */}
      <div role="group" aria-label="Métricas del gráfico" className="flex flex-wrap items-center gap-1.5">
        {METRICAS_EVOLUCION.map((metrica) => {
          const activa = idsActivos.includes(metrica.id);
          const color = colorResuelto.get(metrica.id) ?? metrica.colorPreferido;
          return (
            <button
              key={metrica.id}
              type="button"
              onClick={() => alternarMetrica(metrica.id)}
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
                <span className="ml-1 font-mono text-[11px] text-muted-foreground">{metrica.unidad}</span>
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

      {evaluaciones.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <LineChart className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Aún no hay mediciones aprobadas para graficar. Cuando tu entrenador valide tu primer
            check-in, aquí verás tu evolución.
          </p>
        </div>
      ) : !puedeGraficar ? (
        <div className="py-10 text-center space-y-2">
          <LineChart className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {hayMediciones
              ? 'Aún no hay mediciones suficientes para graficar en este rango (mínimo dos). Cambia el rango o registra un nuevo check-in.'
              : 'No hay mediciones de las métricas elegidas en este rango. Cambia el rango o activa otra métrica.'}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={contenedorRef}
            className="relative w-full touch-none"
            onPointerMove={alMoverPuntero}
            onPointerDown={alMoverPuntero}
            onPointerLeave={(evento) => {
              if (evento.pointerType === 'mouse') setFechaActiva(null);
            }}
            onPointerCancel={() => setFechaActiva(null)}
          >
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
                  {formatearTick(tick.valor)}
                </text>
              ))}
              {unidadIzquierda && (
                <text x={4} y={12} textAnchor="start" className="fill-muted-foreground" fontSize={11} fontWeight={700}>
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
                  {formatearTick(tick.valor)}
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
                          .map((punto) => `${xDeFecha(punto.fecha)},${mapearY(punto.valor, serie.eje === 'izquierda' ? dominioIzquierda! : dominioDerecha!, areaY, areaYFin)}`)
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
                ))
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

            {/* Tooltip hover/tap */}
            {fechaActiva && (
              <div
                role="status"
                className="pointer-events-none absolute top-1 z-10 w-max max-w-[220px] -translate-x-1/2 rounded-2xl border border-border bg-popover/95 px-3 py-2 shadow-xl backdrop-blur"
                style={{ left: Math.min(Math.max(xDeFecha(fechaActiva), 80), Math.max(ancho - 80, 80)) }}
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
            )}
          </div>

          {/* Deltas del rango por métrica activa (Gherkin Escenario 1) */}
          <div className="flex flex-wrap gap-2">
            {deltas.map((delta) => (
              <div
                key={`delta-${delta.metrica.id}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/50 border border-border"
              >
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${CLASES_PUNTO[colorResuelto.get(delta.metrica.id) ?? delta.metrica.colorPreferido]}`} />
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

          {/* Alternativa accesible simple: la misma serie en tabla */}
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
        </>
      )}
    </section>
  );
}
