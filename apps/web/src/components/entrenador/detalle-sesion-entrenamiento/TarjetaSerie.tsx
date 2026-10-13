/**
 * Módulo `detalle-sesion-entrenamiento` · tarjeta de una serie (presentacional ÚNICO).
 *
 * Extraído verbatim de `components/entrenador/DetalleSesionEntrenamiento.tsx:284-400`:
 * reps/carga reales vs planificadas, RPE, temporizador con su desviación frente al
 * descanso planificado (WU18, copy humano) y medición observada cuando hay marcas
 * de inicio reales (WU17), con el tiempo aproximado como respaldo. Solo tiene
 * sentido dentro de este detalle (R3).
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro, `formatearSegundos`.
 * Sin llamadas a `useQuery` ni a `api-client` (R1).
 */
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import {
  formatearDeltaSegundos,
  formatearSegundos,
} from '../../../lib/sesion-tiempos';
import { pesoLegible } from '../../../lib/detalle-sesion-entrenamiento-formato';
import { Timer, Zap } from 'lucide-react';

const TITULO_TIMER =
  'Valor del temporizador de descanso configurado en pantalla para esta serie: es un objetivo, no una medición del descanso real.';
const TITULO_DELTA_SERIE =
  'Tiempo aproximado entre esta serie y la anterior del mismo ejercicio: incluye la ejecución de esta serie, así que no es el descanso exacto.';
const TITULO_DESCANSO_REAL =
  'Medición observada: inicio de esta serie − completada de la serie anterior del mismo ejercicio (reloj del dispositivo).';
const TITULO_EJECUCION_SERIE =
  'Duración observada de la ejecución de esta serie: marca de inicio → marca de completada.';

export interface TarjetaSerieProps {
  serie: SerieRegistroDetalleDTO;
  descansoPrescritoSegundos?: number | null;
  /** Medición observada entre marcas; `null` = cae al tiempo aproximado. */
  descansoReal: number | null;
  /** Cota entre marcas (respaldo cuando no hay medición real). */
  deltaSerie: number | null | undefined;
  /** Duración observada de la ejecución; `null` = sin marca de inicio. */
  duracionEjecucion: number | null;
}

export function TarjetaSerie({
  serie,
  descansoPrescritoSegundos: prescrito,
  descansoReal,
  deltaSerie,
  duracionEjecucion,
}: TarjetaSerieProps) {
  const timer = serie.descansoSegundos;
  const desviacion = timer != null && prescrito != null ? timer - prescrito : null;
  const excesivo = desviacion != null && desviacion > 15;
  const apurado = desviacion != null && desviacion < -15;
  const pesoReal = pesoLegible(serie.pesoKg);
  const pesoPrescrito = pesoLegible(serie.pesoPrescritoKg);

  return (
    <div
      className={`p-2.5 rounded-xl border space-y-1.5 ${
        serie.completada
          ? 'bg-success/10 border-success/30'
          : 'bg-card border-border/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-bold text-muted-foreground">
          S{serie.numeroSerie}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {serie.rpe && (
            <span
              className="text-[11px] font-bold text-warning"
              title="RPE real registrado por el alumno"
            >
              @{serie.rpe}
            </span>
          )}
          {!serie.completada && (
            <span className="text-[11px] font-bold text-warning whitespace-nowrap">
              No completada
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
        <span
          className={serie.repsLogradas == null ? 'text-muted-foreground italic' : 'text-foreground font-bold'}
          title={serie.repsLogradas == null ? 'Sin repeticiones reales registradas' : 'Repeticiones logradas'}
        >
          {serie.repsLogradas == null ? 'Sin reps' : `${serie.repsLogradas} reps`}
          <span className="text-muted-foreground font-normal"> / objetivo: {serie.repsObjetivo}</span>
        </span>
        <span
          className={pesoReal ? 'text-primary font-bold' : 'text-muted-foreground italic'}
          title={pesoReal ? 'Peso real levantado' : 'Sin peso real registrado'}
        >
          {pesoReal ?? 'Sin peso'}
        </span>
      </div>

      <div className="text-[11px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
        Plan: {serie.repsObjetivo} reps · {pesoPrescrito ?? 'sin carga'}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
        {timer != null && (
          <span
            title={TITULO_TIMER}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border whitespace-nowrap ${
              excesivo
                ? 'bg-warning/15 text-warning border-warning/30'
                : apurado
                ? 'bg-info/15 text-info border-info/30'
                : 'bg-secondary text-muted-foreground border-border/60'
            }`}
          >
            <Timer className="h-3 w-3" />
            Temporizador: {formatearSegundos(timer)}
            {desviacion != null &&
              (desviacion > 0
                ? ` (+${formatearSegundos(desviacion)})`
                : desviacion < 0
                ? ` (-${formatearSegundos(-desviacion)})`
                : ' (en meta)')}
          </span>
        )}
        {prescrito != null && (
          <span
            title="Descanso planificado por el coach para este ejercicio"
            className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/60 text-muted-foreground whitespace-nowrap"
          >
            Descanso planificado: {formatearSegundos(prescrito)}
          </span>
        )}
        {descansoReal !== null ? (
          <span
            title={TITULO_DESCANSO_REAL}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-primary/25 bg-primary/10 text-primary whitespace-nowrap"
          >
            <Zap className="h-3 w-3" />
            Descanso real: {formatearDeltaSegundos(descansoReal)}
          </span>
        ) : (
          <span
            title={TITULO_DELTA_SERIE}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/60 text-muted-foreground whitespace-nowrap"
          >
            Tiempo entre series (aprox.):{' '}
            {formatearDeltaSegundos(deltaSerie)}
          </span>
        )}
        {duracionEjecucion !== null && (
          <span
            title={TITULO_EJECUCION_SERIE}
            className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/60 text-muted-foreground whitespace-nowrap"
          >
            Duración de la serie: {formatearDeltaSegundos(duracionEjecucion)}
          </span>
        )}
      </div>
    </div>
  );
}
