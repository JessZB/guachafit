/**
 * RF-004 RN-01: gráfico SVG de evolución corporal multieje, sin dependencias nuevas.
 *
 * Decisión de implementación (documentada): SVG propio en lugar de una librería de charts.
 * El repo no trae ninguna, los tokens semánticos claro/oscuro se consumen directo con clases
 * Tailwind (`stroke-primary`, `fill-warning`, …) y la accesibilidad (role="img" + resumen +
 * tabla alternativa) queda bajo control total sin cargar un runtime extra en la PWA.
 *
 * Contenedor compartido (R11/R16, Ola 3): conserva ruta, export y API de props — lo usan
 * `PestanaAntropometriaAlumno` y `ProgresoPage`. Orquesta estado y escalas; el JSX vive
 * en `grafico-evolucion/` y la lógica pura en `lib/` (`evolucion-graficos`,
 * `grafico-evolucion-formato`).
 *
 * - Métricas: selector-leyenda con hasta 3 activas y 2 unidades por gráfico (eje Y doble).
 * - Rangos: 1M / 3M / 6M / 1A / Todo, con control táctil ≥44px y estado activo visible.
 * - Eje X en fechas locales (helpers de `date-format`); eje Y con unidad por escala.
 * - Tooltip al hover/tap con fecha larga y el valor de cada métrica activa en esa fecha.
 * - Vacíos honestos y tabla alternativa en `<details>` para lectores de pantalla/teclado.
 */
import React, { useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import type { ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import { formatFechaLargaCalendario } from '../../lib/date-format';
import { valoresDeSeriesEvolucion } from '../../lib/grafico-evolucion-formato';
import {
  agruparSeriesPorEje,
  alternarMetricaActiva,
  calcularDeltas,
  calcularDominio,
  construirSeries,
  encontrarIndiceMasCercano,
  fechaCalendarioMs,
  fechasOrdenadas,
  filtrarPorRango,
  mapearX,
  mapearY,
  resumenAccesible,
  seleccionarTicksX,
  type ColorMetrica,
  type IdMetricaEvolucion,
  type RangoEvolucion,
} from '../../lib/evolucion-graficos';
import { ALTO_GRAFICO, MARGENES } from './grafico-evolucion/constantes';
import { useAnchoContenedor } from './grafico-evolucion/use-ancho-contenedor';
import { SelectorRango } from './grafico-evolucion/SelectorRango';
import { SelectorMetricas } from './grafico-evolucion/SelectorMetricas';
import { EstadosGraficoEvolucion } from './grafico-evolucion/EstadosGraficoEvolucion';
import { SvgEvolucion } from './grafico-evolucion/SvgEvolucion';
import { TooltipEvolucion } from './grafico-evolucion/TooltipEvolucion';
import { DeltasEvolucion } from './grafico-evolucion/DeltasEvolucion';
import { TablaEvolucion } from './grafico-evolucion/TablaEvolucion';

export interface GraficoEvolucionProps {
  /** Serie cronológica ascendente de controles aprobados (contrato de la API). */
  evaluaciones: ControlAntropometricoDetalleDTO[];
  /** Métricas activas al montar; por defecto el doble eje de RN-01 (peso + % grasa). */
  metricasIniciales?: IdMetricaEvolucion[];
  /** Rango inicial; por defecto `todo` para que la primera vista nunca parezca vacía. */
  rangoInicial?: RangoEvolucion;
  className?: string;
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
  const dominioIzquierda = useMemo(
    () => calcularDominio(valoresDeSeriesEvolucion(izquierda)),
    [izquierda]
  );
  const dominioDerecha = useMemo(
    () => (derecha.length > 0 ? calcularDominio(valoresDeSeriesEvolucion(derecha)) : null),
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
  const tooltipIzquierda =
    fechaActiva === null
      ? 0
      : Math.min(Math.max(xDeFecha(fechaActiva), 80), Math.max(ancho - 80, 80));

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

        <SelectorRango rango={rango} onCambiar={setRango} />
      </div>

      <SelectorMetricas
        idsActivos={idsActivos}
        colorResuelto={colorResuelto}
        motivo={motivo}
        onAlternar={alternarMetrica}
      />

      {evaluaciones.length === 0 || !puedeGraficar ? (
        <EstadosGraficoEvolucion
          sinEvaluaciones={evaluaciones.length === 0}
          hayMediciones={hayMediciones}
        />
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
            <SvgEvolucion
              ancho={ancho}
              areaX={areaX}
              areaXFin={areaXFin}
              areaY={areaY}
              areaYFin={areaYFin}
              series={series}
              dominioIzquierda={dominioIzquierda}
              dominioDerecha={dominioDerecha}
              ticksIzquierda={ticksIzquierda}
              ticksDerecha={ticksDerecha}
              ticksX={ticksX}
              unidadIzquierda={unidadIzquierda}
              unidadDerecha={unidadDerecha}
              resumen={resumen}
              fechaActiva={fechaActiva}
              fechasMs={fechasMs}
              xDeFecha={xDeFecha}
            />

            {/* Tooltip hover/tap */}
            {fechaActiva && (
              <TooltipEvolucion
                fechaActiva={fechaActiva}
                izquierdaPx={tooltipIzquierda}
                series={series}
              />
            )}
          </div>

          {/* Deltas del rango por métrica activa (Gherkin Escenario 1) */}
          <DeltasEvolucion deltas={deltas} colorResuelto={colorResuelto} />

          {/* Alternativa accesible simple: la misma serie en tabla */}
          <TablaEvolucion series={series} evaluacionesFiltradas={evaluacionesFiltradas} />
        </>
      )}
    </section>
  );
}
