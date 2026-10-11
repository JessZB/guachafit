import React from 'react';
import { AlertTriangle, Loader2, Play, PlayCircle } from 'lucide-react';
import type { EjercicioSesionDetalleDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { resumirSesionParaVistaPrevia, textoPrescripcionCompacta } from '../../lib/sesion-vista';
import type { UnidadPeso } from '../../lib/weight-unit';

/**
 * Vista previa del plan antes de iniciar (RF-001, lote E4): solo lectura, una fila por
 * ejercicio y un único botón para empezar. Sin inputs: no hay nada que marcar hasta iniciar.
 * El video de técnica sigue a mano para repasar antes de empezar.
 */
export function VistaPreviaSesion({
  sesion,
  unidadPeso,
  rpeSugeridoPorEjercicio,
  onIniciar,
  iniciando = false,
  error = null,
  onVerTecnica,
}: {
  sesion: SesionEntrenamientoDetalleDTO;
  unidadPeso: UnidadPeso;
  rpeSugeridoPorEjercicio?: Record<string, string | null>;
  onIniciar: () => void;
  iniciando?: boolean;
  /** Error al iniciar: se muestra junto al botón, donde el alumno lo pulsó. */
  error?: string | null;
  onVerTecnica?: (ejercicio: EjercicioSesionDetalleDTO) => void;
}) {
  const resumen = resumirSesionParaVistaPrevia(sesion);

  return (
    <section aria-labelledby="vista-previa-titulo" className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="vista-previa-titulo" className="text-lg font-bold text-foreground">
          Tu plan de hoy
        </h2>
        <span className="text-sm text-muted-foreground">{resumen.texto}</span>
      </div>

      <ol className="divide-y divide-border/70 border-y border-border/70">
        {sesion.ejercicios.map((ejercicio, indice) => {
          const nombre = ejercicio.ejercicio?.nombre || `Ejercicio ${indice + 1}`;
          const tieneVideo = Boolean(onVerTecnica && ejercicio.ejercicio?.videoUrl);
          return (
            <li key={ejercicio.id} className="flex items-start gap-3 py-3">
              <span
                aria-hidden="true"
                className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm font-semibold text-muted-foreground"
              >
                {indice + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-foreground break-words">{nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {textoPrescripcionCompacta(
                    ejercicio,
                    unidadPeso,
                    rpeSugeridoPorEjercicio?.[ejercicio.id] ?? null
                  )}
                </p>
              </div>
              {tieneVideo && (
                <button
                  type="button"
                  onClick={() => onVerTecnica?.(ejercicio)}
                  aria-label={`Ver técnica de ${nombre}`}
                  className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <PlayCircle className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {/* Botón principal fijo sobre la barra inferior del móvil (respeta el área segura). */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-[45] pt-2 space-y-2">
        {error && (
          <p
            role="alert"
            className="px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onIniciar}
          disabled={iniciando}
          aria-busy={iniciando}
          className="w-full min-h-12 py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          {iniciando ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5 fill-primary-foreground" aria-hidden="true" />
          )}
          <span>{iniciando ? 'Iniciando…' : 'Iniciar entrenamiento'}</span>
        </button>
      </div>
    </section>
  );
}
