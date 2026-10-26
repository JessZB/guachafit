/**
 * Módulo `detalle-sesion-entrenamiento` · cabecera de la sesión (presentacional ÚNICO).
 *
 * Extraído verbatim de `components/entrenador/DetalleSesionEntrenamiento.tsx:117-192`
 * (cuándo, cuánto y cómo cerró la sesión + feedback del alumno). Solo tiene sentido
 * dentro de este detalle (R3): no hay duplicado verificable en otra vista.
 * CANDIDATO para el cierre: `BadgeEstado` de `ui/` consolida este mismo mapa de
 * tonos (`BadgeEstado.tsx:5` lo cita); no se sustituye aquí por R5/R6.
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro. Sin llamadas a
 * `useQuery` ni a `api-client` (R1).
 */
import type { ReactNode } from 'react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  formatDuracionMinutos,
  formatFechaCalendario,
  formatRangoHorasLocal,
} from '../../../lib/date-format';
import { etiquetaEstadoSesion, parsearNotasAlumno, type TonoSemaforo } from '../../../lib/adherencia';
import {
  porcentajeLegible,
  pesoLegible,
} from '../../../lib/detalle-sesion-entrenamiento-formato';
import { Calendar, Clock, Dumbbell, MessageSquare, Timer } from 'lucide-react';

/** Misma paleta de chips de estado que el resto del panel del coach. */
const CLASES_TONO_SESION: Record<TonoSemaforo, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

export interface CabeceraSesionProps {
  sesion: SesionEntrenamientoDetalleDTO;
  titulo?: string | null;
  chipRecuperada?: string | null;
  accionesCabecera?: ReactNode;
}

export function CabeceraSesion({
  sesion,
  titulo,
  chipRecuperada,
  accionesCabecera,
}: CabeceraSesionProps) {
  const etiquetaEstado = etiquetaEstadoSesion(sesion.estado, sesion.motivoOmision);
  const fecha = formatFechaCalendario(sesion.fechaProgramada) ?? sesion.fechaProgramada;
  const rangoHoras = formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc);
  const duracion = formatDuracionMinutos(sesion.duracionMinutos);
  const porcentaje = porcentajeLegible(sesion.porcentajeCumplimiento);
  const volumen = pesoLegible(sesion.volumenTotalKg);
  const { etiquetas, textoLibre } = parsearNotasAlumno(sesion.notasAlumno);

  return (
    <header className="p-4 rounded-2xl bg-secondary/20 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            {titulo && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary truncate">
                {titulo}
              </p>
            )}
            <h4 className="font-bold text-sm text-foreground">
              {fecha}
              {rangoHoras ? ` · ${rangoHoras}` : ''}
            </h4>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <Clock className="h-3 w-3" />
              <span>{duracion ? `${duracion} de duración` : 'Sin duración registrada'}</span>
              {chipRecuperada === undefined && sesion.esDiaDescansoOriginal && (
                <span>Recuperada · día de descanso</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {volumen && Number(sesion.volumenTotalKg) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              <Dumbbell className="h-3 w-3" />
              {volumen}
            </span>
          )}
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${CLASES_TONO_SESION[etiquetaEstado.tono]}`}
          >
            {etiquetaEstado.texto}
          </span>
          {porcentaje && (
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
              {porcentaje} cumplido
            </span>
          )}
          {chipRecuperada && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
              <Timer className="h-3 w-3" />
              {chipRecuperada}
            </span>
          )}
          {accionesCabecera}
        </div>
      </div>

      {(etiquetas.length > 0 || textoLibre) && (
        <div className="p-3 rounded-xl bg-warning/10 border border-warning/25 space-y-2">
          <span className="text-[11px] font-bold text-warning uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Feedback del alumno
          </span>
          {etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((etiqueta, indice) => (
                <span
                  key={`${etiqueta.titulo}-${indice}`}
                  className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30"
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
  );
}
