import type { ReactNode } from 'react';
import { ClipboardList, Info, Timer, Video } from 'lucide-react';
import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';
import { formatearSegundos } from '../../../lib/sesion-tiempos';
import {
  calcularResumenPrescripcion,
  formatearPrescripcion,
} from '../../../lib/entrenamiento-prescripcion';
import {
  formatearPesoConUnidad,
  formatearPesoDesdeKg,
  type UnidadPeso,
} from '../../../lib/weight-unit';
import {
  indicacionesDelEntrenador,
  notaResumenEntrenador,
  textoEsfuerzoSugerido,
} from '../../../lib/entrenamiento-textos';

export interface TarjetaEjercicioSesionProps {
  ejercicioSesion: EjercicioSesionDetalleDTO;
  indice: number;
  unidadPeso: UnidadPeso;
  rpeSugerido: string | null;
  enProgreso: boolean;
  hayPendientes: boolean;
  onHacerAhora: () => void;
  onVerTecnica: () => void;
  renderSerie: (ejercicioIndex: number, serieIndex: number) => ReactNode;
}

/**
 * Cabecera + prescripción + rejilla de series de un ejercicio (ÚNICO).
 * R5: el `h3` y los botones de marcar/corregir conservan el mismo anidamiento que
 * espera `tarjetaDe()` (`entrenamiento.spec-helper.ts`).
 */
export function TarjetaEjercicioSesion({
  ejercicioSesion,
  indice,
  unidadPeso,
  rpeSugerido,
  enProgreso,
  hayPendientes,
  onHacerAhora,
  onVerTecnica,
  renderSerie,
}: TarjetaEjercicioSesionProps) {
  const prescripcion = calcularResumenPrescripcion(ejercicioSesion);
  // Esfuerzo e indicaciones del entrenador en campos propios (con respaldo
  // para sesiones anteriores: RPE capturado al cargar y la nota de siempre).
  const indicaciones = indicacionesDelEntrenador(ejercicioSesion);
  const notaResumen = notaResumenEntrenador(ejercicioSesion);
  const pesoPrescritoTexto =
    prescripcion.pesosKg.length === 0
      ? null
      : prescripcion.pesosKg.length === 1
      ? formatearPesoConUnidad(prescripcion.pesosKg[0], unidadPeso)
      : `${formatearPesoDesdeKg(prescripcion.pesosKg[0], unidadPeso)}–${formatearPesoConUnidad(
          prescripcion.pesosKg[prescripcion.pesosKg.length - 1],
          unidadPeso
        )}`;
  const nombreEjercicio = ejercicioSesion.ejercicio?.nombre || `Ejercicio #${indice + 1}`;
  const videoUrl = ejercicioSesion.ejercicio?.videoUrl || null;

  return (
    <div
      key={ejercicioSesion.id}
      className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
    >
      {/* Exercise Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-border/50 pb-3">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-primary">
            Ejercicio {indice + 1}
          </span>
          <h3 className="font-bold text-lg sm:text-xl text-foreground tracking-tight mt-0.5 break-words">
            {nombreEjercicio}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs sm:text-sm text-muted-foreground font-semibold">
              {ejercicioSesion.ejercicio?.grupoMuscular}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border">
              <Timer className="h-3 w-3 text-primary" />
              <span>Descanso: {formatearSegundos(ejercicioSesion.descansoPrescritoSegundos || 90)}</span>
            </span>
            {/* Escenario 1: video demostrativo del catálogo (si existe) */}
            {videoUrl && (
              <button
                type="button"
                onClick={onVerTecnica}
                aria-label={`Ver video demostrativo de ${nombreEjercicio}`}
                className="min-h-11 inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-xl bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors cursor-pointer active:scale-95"
              >
                <Video className="h-3 w-3" />
                <span>Ver técnica</span>
              </button>
            )}
          </div>
        </div>
        {enProgreso && hayPendientes && (
          <button
            type="button"
            onClick={onHacerAhora}
            aria-label={`Hacer ahora: ${nombreEjercicio}`}
            className="min-h-11 shrink-0 self-start px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
          >
            Hacer ahora
          </button>
        )}
        {notaResumen && (
          <div className="p-2.5 rounded-2xl bg-secondary/60 text-muted-foreground flex items-center gap-2 sm:max-w-xs text-xs min-w-0">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{notaResumen}</span>
          </div>
        )}
      </div>

      {/* WU3b: Referencia PRESCRITA (solo lectura) — nunca se edita desde el checklist */}
      <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-primary/5 border border-primary/15">
        <ClipboardList className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary block leading-none mb-1">
            Lo que te indicó tu entrenador
          </span>
          <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">
            {formatearPrescripcion(prescripcion, unidadPeso)}
            {rpeSugerido && (
              <span className="text-muted-foreground font-semibold">
                {` · ${textoEsfuerzoSugerido(rpeSugerido)}`}
              </span>
            )}
            {!pesoPrescritoTexto && !rpeSugerido && (
              <span className="text-muted-foreground font-semibold">
                {` · ${notaResumen ? 'mira la nota de tu entrenador' : 'peso a tu criterio'}`}
              </span>
            )}
          </p>
          {indicaciones && (
            <p className="mt-1.5 text-[11px] sm:text-xs text-foreground leading-snug">
              <span className="font-bold">Indicaciones de tu entrenador: </span>
              <span className="font-semibold">{indicaciones}</span>
            </p>
          )}
        </div>
      </div>

      {/* Sets Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Lo que hiciste
          </span>
          <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
        </div>
        {/* Cabecera de columnas: solo desde sm; en móvil cada campo lleva su propio label */}
        <div className="hidden sm:grid grid-cols-12 gap-1.5 sm:gap-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider px-2">
          <span className="col-span-1 text-center">#</span>
          <span className="col-span-4 text-center">Peso ({unidadPeso})</span>
          <span className="col-span-3 text-center">Repeticiones</span>
          <span className="col-span-2 text-center" title="Qué tan duro fue, de 1 a 10">Esfuerzo (1-10)</span>
          <span className="col-span-2 text-center">Listo</span>
        </div>

        {ejercicioSesion.series.map((_serie, sIdx) => renderSerie(indice, sIdx))}
      </div>
    </div>
  );
}
