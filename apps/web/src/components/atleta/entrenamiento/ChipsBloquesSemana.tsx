import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  Sparkles,
  Zap,
} from 'lucide-react';
import { EstadoSesion, MotivoOmision, type SemanaEntrenamientoProgresoDTO } from '@guachafit/shared';
import {
  formatFechaCalendario,
  formatFechaHoraLocal,
  formatFechaLocal,
} from '../../../lib/date-format';

export interface ChipsBloquesSemanaProps {
  semanaProgreso: SemanaEntrenamientoProgresoDTO;
  bloqueActivoId?: string | null;
  deshabilitado: boolean;
  onSelect: (bloqueId: string) => void;
}

/** Chips de bloques de la semana (ÚNICO: estados completado/omitido/sugerido + consulta). */
export function ChipsBloquesSemana({
  semanaProgreso,
  bloqueActivoId,
  deshabilitado,
  onSelect,
}: ChipsBloquesSemanaProps) {
  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 pr-10 sm:pr-2 scrollbar-thin"
        aria-label="Entrenamientos de la semana"
        role="group"
      >
        {semanaProgreso.bloques.map((b) => {
          const esActivo = bloqueActivoId === b.bloqueId;
          const esCompletado = b.completado;
          const esOmitido = !esCompletado && b.estadoSesion === EstadoSesion.OMITIDA;
          const esSugerido = b.esSugeridoHoy;
          const etiquetaOmision =
            b.motivoOmision === MotivoOmision.DESCANSO ? 'Descansado' : 'Incompleto';
          const detalleFecha = b.fechaCompletadaUtc
            ? `Completado: ${formatFechaHoraLocal(b.fechaCompletadaUtc) ?? ''}`
            : b.fechaProgramada
            ? `Programado: ${formatFechaCalendario(b.fechaProgramada) ?? ''}`
            : null;
          // RN-05: fecha local visible en la tarjeta del bloque (UTC -> Intl del dispositivo)
          const fechaVisible = b.fechaCompletadaUtc
            ? formatFechaLocal(b.fechaCompletadaUtc)
            : formatFechaCalendario(b.fechaProgramada);

          let badgeStyle =
            'bg-secondary/60 text-muted-foreground border-border hover:bg-secondary hover:text-foreground';
          if (esCompletado) {
            badgeStyle = esActivo
              ? 'bg-success/20 text-success border-success/40 ring-2 ring-success/30 font-bold'
              : 'bg-success/10 text-success border-success/30 hover:bg-success/20 font-bold';
          } else if (esOmitido) {
            badgeStyle =
              'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20 font-bold';
          } else if (esActivo) {
            badgeStyle =
              'bg-primary text-primary-foreground border-primary font-bold shadow-md shadow-primary/25 ring-2 ring-primary/30';
          } else if (esSugerido) {
            badgeStyle =
              'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25 font-bold';
          }

          return (
            <button
              key={b.bloqueId}
              type="button"
              disabled={deshabilitado}
              onClick={() => onSelect(b.bloqueId)}
              className={`min-h-11 py-2 px-3.5 rounded-2xl border text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 ${badgeStyle}`}
              title={
                detalleFecha ? `Consultar ${b.titulo} · ${detalleFecha}` : `Consultar ${b.titulo}`
              }
            >
              {esCompletado ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
              ) : esOmitido ? (
                b.motivoOmision === MotivoOmision.DESCANSO ? (
                  <Coffee className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                )
              ) : esActivo ? (
                <Zap className="h-3.5 w-3.5 shrink-0 fill-current" />
              ) : esSugerido ? (
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
              )}
              <span className="font-semibold">{b.titulo.split(':')[0]}</span>
              {esCompletado && <span className="text-[11px] font-bold opacity-80">✓</span>}
              {esOmitido && (
                <span className="text-[11px] font-bold opacity-90">{etiquetaOmision}</span>
              )}
              {fechaVisible && (esCompletado || esOmitido) && (
                <span className="text-[11px] font-medium opacity-70">{fechaVisible}</span>
              )}
              {esActivo && <span className="text-[11px] font-mono uppercase tracking-wider ml-0.5">Hoy</span>}
              {!esCompletado && !esOmitido && !esActivo && esSugerido && (
                <span className="text-[11px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                  Sugerido
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end pr-0.5 bg-gradient-to-l from-card via-card/70 to-transparent sm:hidden"
        aria-hidden="true"
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
      </div>
    </div>
  );
}
