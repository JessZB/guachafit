import React from 'react';
import { Loader2, Play } from 'lucide-react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { resumirSesionParaVistaPrevia, textoPrescripcionCompacta } from '../../lib/sesion-vista';
import type { UnidadPeso } from '../../lib/weight-unit';

/**
 * Vista previa del plan antes de iniciar (RF-001, lote E4): solo lectura, una fila por
 * ejercicio y un único botón para empezar. Sin inputs: no hay nada que marcar hasta iniciar.
 */
export function VistaPreviaSesion({
  sesion,
  unidadPeso,
  rpeSugeridoPorEjercicio,
  onIniciar,
  iniciando = false,
}: {
  sesion: SesionEntrenamientoDetalleDTO;
  unidadPeso: UnidadPeso;
  rpeSugeridoPorEjercicio?: Record<string, string | null>;
  onIniciar: () => void;
  iniciando?: boolean;
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
        {sesion.ejercicios.map((ejercicio, indice) => (
          <li key={ejercicio.id} className="flex items-start gap-3 py-3">
            <span
              aria-hidden="true"
              className="mt-0.5 w-6 shrink-0 text-right font-mono text-sm font-semibold text-muted-foreground"
            >
              {indice + 1}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground break-words">
                {ejercicio.ejercicio?.nombre || `Ejercicio ${indice + 1}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {textoPrescripcionCompacta(
                  ejercicio,
                  unidadPeso,
                  rpeSugeridoPorEjercicio?.[ejercicio.id] ?? null
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Botón principal fijo sobre la barra inferior del móvil. */}
      <div className="sticky bottom-20 lg:bottom-4 z-30 pt-2">
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
