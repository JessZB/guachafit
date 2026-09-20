/**
 * WU15: detalle completo de UNA sesión de entrenamiento (props puras, sin fetch).
 *
 * Reutilizable por el modal de actividad del monitor y por la ficha del alumno. Muestra las
 * series con reps/carga reales vs planificadas, RPE, el valor del TEMPORIZADOR de descanso y los
 * tiempos derivados de las marcas (`Tiempo entre series (aprox.)` / `Tiempo entre ejercicios
 * (aprox.)`), que son cotas entre marcas, nunca "descanso exacto" (ver `lib/sesion-tiempos.ts`).
 * WU17: cuando existen marcas de inicio reales, muestra la MEDICIÓN observada
 * (`Descanso real` / `Duración de la serie`) y deja el tiempo aproximado como respaldo.
 * WU18: copy en lenguaje humano para no técnicos (`Plan:`, `Descanso planificado:`,
 * `Temporizador:`) con el formato de tiempo de `formatearSegundos`.
 */
import React from 'react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  formatDuracionMinutos,
  formatFechaCalendario,
  formatRangoHorasLocal,
} from '../../lib/date-format';
import { etiquetaEstadoSesion, parsearNotasAlumno, type TonoSemaforo } from '../../lib/adherencia';
import {
  deltasEntreEjercicios,
  deltasEntreSeries,
  descansosRealesEntreEjercicios,
  descansosRealesEntreSeries,
  duracionesEjecucionSeries,
  formatearDeltaSegundos,
  formatearSegundos,
} from '../../lib/sesion-tiempos';
import { formatearPesoConUnidad } from '../../lib/weight-unit';
import { Calendar, Clock, Dumbbell, MessageSquare, Timer, Zap } from 'lucide-react';

export interface DetalleSesionEntrenamientoProps {
  sesion: SesionEntrenamientoDetalleDTO;
  /** Título opcional del bloque/rutina que encabeza la sesión (p. ej. en el expediente). */
  titulo?: string | null;
  /**
   * Texto del chip ámbar cuando la sesión se recuperó en un día de descanso (WU16, ficha del
   * alumno: "Recuperada en Lunes (Día de descanso)"). Sin la prop se conserva el texto plano
   * del monitor ("Recuperada en día de descanso").
   */
  chipRecuperada?: string | null;
  /** Acciones extra en la fila de chips de la cabecera (p. ej. el toggle Ver/Ocultar series). */
  accionesCabecera?: React.ReactNode;
  /** Muestra el grupo muscular de cada ejercicio (la ficha del alumno lo usaba; el monitor no). */
  mostrarGrupoMuscular?: boolean;
  /** `false` = acordeón colapsado: solo cabecera, sin la lista de ejercicios. */
  mostrarSeries?: boolean;
  /** `id` del contenedor de ejercicios, para `aria-controls` del toggle externo. */
  idSeries?: string;
  className?: string;
}

/** Misma paleta de chips de estado que el resto del panel del coach. */
const CLASES_TONO_SESION: Record<TonoSemaforo, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

const TITULO_TIMER =
  'Valor del temporizador de descanso configurado en pantalla para esta serie: es un objetivo, no una medición del descanso real.';
const TITULO_DELTA_SERIE =
  'Tiempo aproximado entre esta serie y la anterior del mismo ejercicio: incluye la ejecución de esta serie, así que no es el descanso exacto.';
const TITULO_DELTA_EJERCICIO =
  'Tiempo aproximado entre el ejercicio anterior y este: incluye la ejecución y los traslados, así que no es el descanso exacto.';
const TITULO_DESCANSO_REAL =
  'Medición observada: inicio de esta serie − completada de la serie anterior del mismo ejercicio (reloj del dispositivo).';
const TITULO_DESCANSO_REAL_EJERCICIO =
  'Medición observada: inicio de la primera serie de este ejercicio − completada de la última serie del ejercicio anterior (reloj del dispositivo).';
const TITULO_EJECUCION_SERIE =
  'Duración observada de la ejecución de esta serie: marca de inicio → marca de completada.';

/** Porcentaje decimal del contrato ('85.00') a texto corto ('85%'); null si no es numérico. */
function porcentajeLegible(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return `${Math.round(numero * 100) / 100}%`;
}

/** Peso del contrato en kg legible; null si falta el dato. 0 se muestra como carga corporal. */
function pesoLegible(peso: string | null | undefined): string | null {
  if (peso === null || peso === undefined || peso === '') return null;
  const numero = Number(peso);
  if (!Number.isFinite(numero)) return null;
  if (numero === 0) return 'Corporal';
  return formatearPesoConUnidad(peso, 'kg');
}

export function DetalleSesionEntrenamiento({
  sesion,
  titulo,
  chipRecuperada,
  accionesCabecera,
  mostrarGrupoMuscular = false,
  mostrarSeries = true,
  idSeries,
  className = '',
}: DetalleSesionEntrenamientoProps) {
  const etiquetaEstado = etiquetaEstadoSesion(sesion.estado, sesion.motivoOmision);
  const fecha = formatFechaCalendario(sesion.fechaProgramada) ?? sesion.fechaProgramada;
  const rangoHoras = formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc);
  const duracion = formatDuracionMinutos(sesion.duracionMinutos);
  const porcentaje = porcentajeLegible(sesion.porcentajeCumplimiento);
  const volumen = pesoLegible(sesion.volumenTotalKg);
  const { etiquetas, textoLibre } = parsearNotasAlumno(sesion.notasAlumno);
  const ejercicios = sesion.ejercicios ?? [];
  const deltasEjercicios = deltasEntreEjercicios(ejercicios);
  const descansosRealesEjercicios = descansosRealesEntreEjercicios(ejercicios);

  return (
    <section className={`space-y-3 ${className}`.trim()}>
      {/* Cabecera: cuándo, cuánto y cómo cerró la sesión */}
      <header className="p-4 rounded-2xl bg-secondary/20 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              {titulo && (
                <p className="text-[10px] font-black uppercase tracking-wider text-primary truncate">
                  {titulo}
                </p>
              )}
              <h4 className="font-extrabold text-sm text-foreground">
                {fecha}
                {rangoHoras ? ` · ${rangoHoras}` : ''}
              </h4>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <Clock className="h-3 w-3" />
                <span>{duracion ? `${duracion} de duración` : 'Sin duración registrada'}</span>
                {chipRecuperada === undefined && sesion.esDiaDescansoOriginal && (
                  <span>· Recuperada en día de descanso</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {volumen && Number(sesion.volumenTotalKg) > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                <Dumbbell className="h-3 w-3" />
                {volumen}
              </span>
            )}
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${CLASES_TONO_SESION[etiquetaEstado.tono]}`}
            >
              {etiquetaEstado.texto}
            </span>
            {porcentaje && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {porcentaje} cumplido
              </span>
            )}
            {chipRecuperada && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Timer className="h-3 w-3" />
                {chipRecuperada}
              </span>
            )}
            {accionesCabecera}
          </div>
        </div>

        {(etiquetas.length > 0 || textoLibre) && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Feedback del alumno
            </span>
            {etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((etiqueta, indice) => (
                  <span
                    key={`${etiqueta.titulo}-${indice}`}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  >
                    {etiqueta.titulo}
                    {etiqueta.valor ? `: ${etiqueta.valor}` : ''}
                  </span>
                ))}
              </div>
            )}
            {textoLibre && <p className="text-[11px] text-foreground/90 leading-relaxed">{textoLibre}</p>}
          </div>
        )}
      </header>

      {/* Ejercicios y series (ocultos cuando el acordeón externo está colapsado) */}
      {mostrarSeries &&
        (ejercicios.length === 0 ? (
          <p className="p-4 rounded-2xl border border-dashed border-border/70 text-[11px] text-muted-foreground text-center">
            Sin series registradas en esta sesión.
          </p>
        ) : (
          <div id={idSeries} className="space-y-3">
            {ejercicios.map((ejercicio, indiceEjercicio) => {
          const deltaEjercicio = deltasEjercicios[indiceEjercicio];
          const descansoRealEjercicio = descansosRealesEjercicios[indiceEjercicio];
          const deltasSeries = deltasEntreSeries(ejercicio.series);
          const descansosReales = descansosRealesEntreSeries(ejercicio.series);
          const duracionesEjecucion = duracionesEjecucionSeries(ejercicio.series);
          return (
            <div key={ejercicio.id} className="space-y-2.5">
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
                      className={`text-[10px] font-mono font-bold ${
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
                    <span className="h-5 w-5 rounded-lg bg-primary/10 text-primary text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                      {indiceEjercicio + 1}
                    </span>
                    <span className="font-bold text-xs text-foreground truncate">
                      {ejercicio.ejercicio?.nombre ?? 'Ejercicio prescrito'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ejercicio.notasCoach && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25"
                        title="Nota del coach para este ejercicio"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Nota del coach
                      </span>
                    )}
                    {mostrarGrupoMuscular && ejercicio.ejercicio?.grupoMuscular && (
                      <span
                        className="inline-flex items-center text-[10px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60"
                        title="Grupo muscular del ejercicio"
                      >
                        {ejercicio.ejercicio.grupoMuscular}
                      </span>
                    )}
                    {ejercicio.descansoPrescritoSegundos != null && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60"
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
                    {ejercicio.series.map((serie, indiceSerie) => {
                      const prescrito = ejercicio.descansoPrescritoSegundos;
                      const timer = serie.descansoSegundos;
                      const desviacion = timer != null && prescrito != null ? timer - prescrito : null;
                      const excesivo = desviacion != null && desviacion > 15;
                      const apurado = desviacion != null && desviacion < -15;
                      const pesoReal = pesoLegible(serie.pesoKg);
                      const pesoPrescrito = pesoLegible(serie.pesoPrescritoKg);

                      return (
                        <div
                          key={serie.id}
                          className={`p-2.5 rounded-xl border space-y-1.5 ${
                            serie.completada
                              ? 'bg-emerald-500/10 border-emerald-500/30'
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
                                  className="text-[10px] font-bold text-amber-400"
                                  title="RPE real registrado por el alumno"
                                >
                                  @{serie.rpe}
                                </span>
                              )}
                              {!serie.completada && (
                                <span className="text-[10px] font-bold text-amber-400 whitespace-nowrap">
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
                              className={pesoReal ? 'text-primary font-black' : 'text-muted-foreground italic'}
                              title={pesoReal ? 'Peso real levantado' : 'Sin peso real registrado'}
                            >
                              {pesoReal ?? 'Sin peso'}
                            </span>
                          </div>

                          <div className="text-[10px] text-muted-foreground font-mono border-t border-border/40 pt-1.5">
                            Plan: {serie.repsObjetivo} reps · {pesoPrescrito ?? 'sin carga'}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                            {timer != null && (
                              <span
                                title={TITULO_TIMER}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border whitespace-nowrap ${
                                  excesivo
                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                    : apurado
                                    ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
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
                            {descansosReales[indiceSerie] !== null ? (
                              <span
                                title={TITULO_DESCANSO_REAL}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-primary/25 bg-primary/10 text-primary whitespace-nowrap"
                              >
                                <Zap className="h-3 w-3" />
                                Descanso real: {formatearDeltaSegundos(descansosReales[indiceSerie])}
                              </span>
                            ) : (
                              <span
                                title={TITULO_DELTA_SERIE}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/60 text-muted-foreground whitespace-nowrap"
                              >
                                Tiempo entre series (aprox.):{' '}
                                {formatearDeltaSegundos(deltasSeries[indiceSerie])}
                              </span>
                            )}
                            {duracionesEjecucion[indiceSerie] !== null && (
                              <span
                                title={TITULO_EJECUCION_SERIE}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-border/60 bg-secondary/60 text-muted-foreground whitespace-nowrap"
                              >
                                Duración de la serie: {formatearDeltaSegundos(duracionesEjecucion[indiceSerie])}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
            })}
          </div>
        ))}
    </section>
  );
}
