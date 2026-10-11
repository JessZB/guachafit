import React from 'react';
import { CheckCircle2, ListChecks, PlayCircle } from 'lucide-react';
import type { EjercicioSesionDetalleDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  progresoFoco,
  siguienteEjercicioPendiente,
  textoProgresoFoco,
  textoSeriesRestantes,
  type PosicionFoco,
} from '../../lib/modo-foco';
import { textoPrescripcionCompacta } from '../../lib/sesion-vista';
import type { UnidadPeso } from '../../lib/weight-unit';

/**
 * Modo foco (RF-001, lote E5): una sola serie en pantalla, con el avance arriba y solo el
 * siguiente ejercicio debajo. La fila de la serie la pinta la página (`renderSerie`) para
 * reutilizar sus filtros, borradores y envío sin duplicar lógica.
 */
export function ModoFoco({
  sesion,
  posicion,
  unidadPeso,
  rpeSugeridoPorEjercicio,
  renderSerie,
  onVerListaCompleta,
  onVerTecnica,
}: {
  sesion: SesionEntrenamientoDetalleDTO;
  posicion: PosicionFoco | null;
  unidadPeso: UnidadPeso;
  rpeSugeridoPorEjercicio?: Record<string, string | null>;
  renderSerie: (ejercicioIndex: number, serieIndex: number) => React.ReactNode;
  onVerListaCompleta: () => void;
  onVerTecnica?: (ejercicio: EjercicioSesionDetalleDTO) => void;
}) {
  const botonLista = (
    <button
      type="button"
      onClick={onVerListaCompleta}
      className="w-full min-h-11 px-4 py-2.5 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground hover:border-primary/40 inline-flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
      <span>Ver entrenamiento completo</span>
    </button>
  );

  if (!posicion) {
    return (
      <section aria-label="Entrenamiento en foco" className="space-y-4">
        <div className="p-5 rounded-3xl bg-success/10 border border-success/30 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-strong" aria-hidden="true" />
          <div>
            <p className="text-base font-bold text-foreground">Completaste todas las series</p>
            <p className="text-sm text-muted-foreground">
              Pulsa «Finalizar entrenamiento» para guardar la sesión.
            </p>
          </div>
        </div>
        {botonLista}
      </section>
    );
  }

  const ejercicio = sesion.ejercicios[posicion.ejercicioIndex];
  const progreso = progresoFoco(sesion, posicion);
  const nombre = ejercicio?.ejercicio?.nombre || `Ejercicio ${progreso.ejercicioNumero}`;
  const indiceSiguiente = siguienteEjercicioPendiente(sesion, posicion);
  const siguiente = indiceSiguiente !== null ? sesion.ejercicios[indiceSiguiente] : null;
  const rpeDe = (id: string) => rpeSugeridoPorEjercicio?.[id] ?? null;

  return (
    <section aria-label="Entrenamiento en foco" className="space-y-4">
      <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">{textoProgresoFoco(progreso)}</p>
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-xl font-bold text-foreground break-words">{nombre}</h2>
            {onVerTecnica && ejercicio?.ejercicio?.videoUrl && (
              <button
                type="button"
                onClick={() => onVerTecnica(ejercicio)}
                aria-label={`Ver técnica de ${nombre}`}
                className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-xl text-primary hover:bg-primary/10 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PlayCircle className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {textoPrescripcionCompacta(ejercicio, unidadPeso, rpeDe(ejercicio.id))}
          </p>
          <p className="text-sm font-medium text-foreground">
            {textoSeriesRestantes(progreso.seriesRestantes)}
          </p>
        </div>

        {renderSerie(posicion.ejercicioIndex, posicion.serieIndex)}
      </div>

      {siguiente && (
        <p className="px-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Siguiente:</span>{' '}
          <span>{siguiente.ejercicio?.nombre || `Ejercicio ${(indiceSiguiente ?? 0) + 1}`}</span>
          {' · '}
          <span>{textoPrescripcionCompacta(siguiente, unidadPeso, rpeDe(siguiente.id))}</span>
        </p>
      )}

      {botonLista}
    </section>
  );
}
