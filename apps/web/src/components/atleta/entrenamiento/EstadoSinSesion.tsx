import type {
  BloqueSemanaProgresoDTO,
  SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';
import { formatFechaCalendario } from '../../../lib/date-format';
import { ArrowRight, Coffee, Dumbbell, Info, Loader2, Play } from 'lucide-react';

export interface EstadoSinSesionProps {
  semanaProgreso: SemanaEntrenamientoProgresoDTO | null;
  selectedBloque: BloqueSemanaProgresoDTO | null;
  pendientes: BloqueSemanaProgresoDTO[];
  isSwitchingBloque: boolean;
  onEntrenarBloque: (bloqueId: string) => void;
}

/** Sin sesión activa: sin rutina, día de descanso o bloque pendiente de instanciar (ÚNICO). */
export function EstadoSinSesion({
  semanaProgreso,
  selectedBloque,
  pendientes,
  isSwitchingBloque,
  onEntrenarBloque,
}: EstadoSinSesionProps) {
  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-5">
      <div className="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
        {semanaProgreso?.esDiaDescansoHoy ? (
          <Coffee className="h-8 w-8" />
        ) : (
          <Dumbbell className="h-8 w-8" />
        )}
      </div>

      <div className="max-w-md mx-auto space-y-1.5">
        <h3 className="text-xl font-bold text-foreground">
          {!semanaProgreso || semanaProgreso.totalBloques === 0
            ? 'Aún no tienes rutina asignada para hoy'
            : semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
            ? '¡Semana completada!'
            : semanaProgreso.esDiaDescansoHoy
            ? 'Día de descanso según tu plan'
            : selectedBloque
            ? selectedBloque.titulo
            : 'No hay sesión activa seleccionada'}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {!semanaProgreso || semanaProgreso.totalBloques === 0
            ? 'Tu entrenador aún no ha preparado tu rutina de la semana. Cuando la asigne, aparecerá aquí.'
            : semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
            ? '¡Excelente trabajo! Hiciste todos los entrenamientos de la semana. Disfruta tu recuperación o repite uno si te queda energía.'
            : semanaProgreso.esDiaDescansoHoy
            ? 'Hoy toca recuperación. Si quieres adelantar o recuperar trabajo, elige un entrenamiento pendiente y empiézalo.'
            : 'Elige un entrenamiento pendiente y pulsa "Hacer este entrenamiento hoy". Mirar tu rutina no cambia nada.'}
        </p>
      </div>

      {/* CTA informativo cuando aún no hay rutina publicada */}
      {(!semanaProgreso || semanaProgreso.totalBloques === 0) && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Tu entrenador aún no ha publicado tu plan de la semana
        </span>
      )}

      {/* CTA explícita del bloque seleccionado (acción, no consulta).
          C9: un solo paso — crea la sesión y la deja iniciada (`iniciarInmediato`). */}
      {selectedBloque && !selectedBloque.completado && (
        <div className="max-w-lg mx-auto pt-1">
          <button
            type="button"
            disabled={isSwitchingBloque}
            aria-busy={isSwitchingBloque}
            onClick={() => onEntrenarBloque(selectedBloque.bloqueId)}
            className="w-full min-h-11 py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSwitchingBloque ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-primary-foreground" aria-hidden="true" />
            )}
            <span>{isSwitchingBloque ? 'Preparando tu entrenamiento...' : 'Hacer este entrenamiento hoy'}</span>
          </button>
          {selectedBloque.enfoque && (
            <p className="text-[11px] text-muted-foreground mt-2">{selectedBloque.enfoque}</p>
          )}
        </div>
      )}

      {/* Bloques Pendientes con acción explícita (excluye el ya seleccionado) */}
      {semanaProgreso && pendientes.length > 0 && (
        <div className="pt-3 border-t border-border/60 max-w-lg mx-auto space-y-2.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Otros entrenamientos pendientes de esta semana
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {pendientes.map((b) => (
              <button
                key={b.bloqueId}
                type="button"
                disabled={isSwitchingBloque}
                onClick={() => onEntrenarBloque(b.bloqueId)}
                className="p-3.5 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 text-left transition-all duration-200 active:scale-98 cursor-pointer flex flex-col justify-between group disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {b.titulo}
                  </span>
                  {b.esSugeridoHoy && (
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                      Sugerido
                    </span>
                  )}
                </div>
                {b.enfoque && (
                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                    {b.enfoque}
                  </span>
                )}
                {b.fechaProgramada && (
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Programado: {formatFechaCalendario(b.fechaProgramada)}
                  </span>
                )}
                <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-primary">
                  <span>Hacer este entrenamiento hoy</span>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
