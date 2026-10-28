/**
 * Tarjeta del último entrenamiento realizado del alumno (organismo ÚNICO).
 *
 * Presentacional: sesión, etiqueta de estado y callback por props (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-6). `MonitorAdherenciaPage.tsx:747-800` solo
 * muestra un texto de "últ. sesión", no la tarjeta. El `<h3>` es `Último entrenamiento` (o
 * `Entrenamiento en Progreso` mientras la sesión está abierta) y la fecha va en una línea
 * secundaria, fuera del título. Conserva el chip de % cumplido y el botón
 * `Ver historial completo` que consultan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { type EtiquetaVisual, type TonoSemaforo } from '../../../lib/adherencia';
import { Clock, Dumbbell, History } from 'lucide-react';
import {
  formatDuracionMinutos,
  formatFechaCalendario,
  formatRangoHorasLocal,
} from '../../../lib/date-format';
import { FeedbackAlumno } from './FeedbackAlumno';

/** Clases de chip por tono del estado de sesión (comparten paleta con el resto del panel). */
const CLASES_TONO_SESION: Record<TonoSemaforo, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

export interface TarjetaUltimoEntrenamientoProps {
  sesion: SesionEntrenamientoDetalleDTO;
  etiqueta: EtiquetaVisual;
  onVerHistorial: () => void;
}

export function TarjetaUltimoEntrenamiento({
  sesion: ultimoEntrenamiento,
  etiqueta: etiquetaUltimoEntrenamiento,
  onVerHistorial,
}: TarjetaUltimoEntrenamientoProps) {
  return (
    <div
      className="scroll-mt-24 p-6 rounded-3xl bg-card border border-border shadow-md space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-start gap-2">
          <Dumbbell className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <h3 className="font-bold text-sm text-foreground">
              {ultimoEntrenamiento.estado === EstadoSesion.EN_PROGRESO
                ? 'Entrenamiento en Progreso'
                : 'Último entrenamiento'}
            </h3>
            <p className="text-[11px] font-mono text-muted-foreground">
              {formatFechaCalendario(ultimoEntrenamiento.fechaProgramada) ||
                ultimoEntrenamiento.fechaProgramada}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
              CLASES_TONO_SESION[etiquetaUltimoEntrenamiento.tono]
            }`}
          >
            {etiquetaUltimoEntrenamiento.texto}
          </span>
          {ultimoEntrenamiento.estado === EstadoSesion.COMPLETADA && (
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
              {ultimoEntrenamiento.porcentajeCumplimiento}% cumplido
            </span>
          )}
          {/* WU16: acceso directo al historial sin salir de la ficha */}
          <button
            type="button"
            onClick={onVerHistorial}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-[11px] border border-border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <History className="h-3.5 w-3.5 text-primary" />
            Ver historial completo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
        {formatRangoHorasLocal(
          ultimoEntrenamiento.fechaInicioUtc,
          ultimoEntrenamiento.fechaFinUtc
        ) ? (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            {formatRangoHorasLocal(
              ultimoEntrenamiento.fechaInicioUtc,
              ultimoEntrenamiento.fechaFinUtc
            )}{' '}
            (hora local)
          </span>
        ) : (
          ultimoEntrenamiento.estado === EstadoSesion.COMPLETADA && (
            <span>Sin horas de inicio/fin registradas</span>
          )
        )}
        {formatDuracionMinutos(ultimoEntrenamiento.duracionMinutos) && (
          <span>Duración: {formatDuracionMinutos(ultimoEntrenamiento.duracionMinutos)}</span>
        )}
        {ultimoEntrenamiento.volumenTotalKg &&
          ultimoEntrenamiento.volumenTotalKg !== '0.00' && (
            <span>Volumen: {ultimoEntrenamiento.volumenTotalKg} kg</span>
          )}
      </div>

      <FeedbackAlumno notas={ultimoEntrenamiento.notasAlumno} />
    </div>
  );
}
