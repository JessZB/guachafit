/**
 * Módulo `detalle-sesion-entrenamiento` · bloque de un ejercicio con sus series
 * (presentacional ÚNICO).
 *
 * Extraído verbatim de `components/entrenador/DetalleSesionEntrenamiento.tsx:202-280`
 * (separador entre ejercicios + tarjeta del ejercicio) y `:404-407`. Calcula los
 * derivados entre marcas de sus propias series con las funciones puras de
 * `lib/sesion-tiempos` y compone `TarjetaSerie`. Solo tiene sentido dentro de
 * este detalle (R3).
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro. Sin llamadas a
 * `useQuery` ni a `api-client` (R1).
 */
import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';
import {
  deltasEntreSeries,
  descansosRealesEntreSeries,
  duracionesEjecucionSeries,
  formatearDeltaSegundos,
  formatearSegundos,
} from '../../../lib/sesion-tiempos';
import { MessageSquare, Timer } from 'lucide-react';
import { TarjetaSerie } from './TarjetaSerie';

const TITULO_DELTA_EJERCICIO =
  'Tiempo aproximado entre el ejercicio anterior y este: incluye la ejecución y los traslados, así que no es el descanso exacto.';
const TITULO_DESCANSO_REAL_EJERCICIO =
  'Medición observada: inicio de la primera serie de este ejercicio − completada de la última serie del ejercicio anterior (reloj del dispositivo).';

export interface BloqueEjercicioProps {
  ejercicio: EjercicioSesionDetalleDTO;
  indiceEjercicio: number;
  mostrarGrupoMuscular?: boolean;
  /** Cota entre marcas con el ejercicio anterior; `null` = sin separador. */
  deltaEjercicio: number | null | undefined;
  /** Medición observada con el ejercicio anterior; `null` = cae al aproximado. */
  descansoRealEjercicio: number | null;
}

export function BloqueEjercicio({
  ejercicio,
  indiceEjercicio,
  mostrarGrupoMuscular = false,
  deltaEjercicio,
  descansoRealEjercicio,
}: BloqueEjercicioProps) {
  const deltasSeries = deltasEntreSeries(ejercicio.series);
  const descansosReales = descansosRealesEntreSeries(ejercicio.series);
  const duracionesEjecucion = duracionesEjecucionSeries(ejercicio.series);

  return (
    <div className="space-y-2.5">
      {indiceEjercicio > 0 &&
        (descansoRealEjercicio !== null || deltaEjercicio !== null) && (
          <div
            className="flex items-center gap-2 px-1 pt-1"
            title={
              descansoRealEjercicio !== null
                ? TITULO_DESCANSO_REAL_EJERCICIO
                : TITULO_DELTA_EJERCICIO
            }
          >
            <span className="h-px flex-1 bg-border/60" />
            <span
              className={`text-[11px] font-mono font-bold ${
                descansoRealEjercicio !== null ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {descansoRealEjercicio !== null
                ? `Descanso real: ${formatearDeltaSegundos(descansoRealEjercicio)}`
                : `Tiempo entre ejercicios (aprox.): ${formatearDeltaSegundos(deltaEjercicio)}`}
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
        )}

      <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/50 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-5 w-5 rounded-lg bg-primary/10 text-primary text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
              {indiceEjercicio + 1}
            </span>
            <span className="font-bold text-xs text-foreground truncate">
              {ejercicio.ejercicio?.nombre ?? 'Ejercicio prescrito'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ejercicio.notasCoach && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25"
                title="Nota del coach para este ejercicio"
              >
                <MessageSquare className="h-3 w-3" />
                Nota del coach
              </span>
            )}
            {mostrarGrupoMuscular && ejercicio.ejercicio?.grupoMuscular && (
              <span
                className="inline-flex items-center text-[11px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60"
                title="Grupo muscular del ejercicio"
              >
                {ejercicio.ejercicio.grupoMuscular}
              </span>
            )}
            {ejercicio.descansoPrescritoSegundos != null && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60"
                title="Descanso planificado por el coach para este ejercicio"
              >
                <Timer className="h-3 w-3" />
                Descanso planificado: {formatearSegundos(ejercicio.descansoPrescritoSegundos)}
              </span>
            )}
          </div>
        </div>

        {ejercicio.notasCoach && (
          <p className="text-[11px] text-muted-foreground bg-background/40 rounded-lg px-2.5 py-1.5 border border-border/40 leading-relaxed">
            {ejercicio.notasCoach}
          </p>
        )}

        {ejercicio.series.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Sin series registradas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {ejercicio.series.map((serie, indiceSerie) => (
              <TarjetaSerie
                key={serie.id}
                serie={serie}
                descansoPrescritoSegundos={ejercicio.descansoPrescritoSegundos}
                descansoReal={descansosReales[indiceSerie]}
                deltaSerie={deltasSeries[indiceSerie]}
                duracionEjecucion={duracionesEjecucion[indiceSerie]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
