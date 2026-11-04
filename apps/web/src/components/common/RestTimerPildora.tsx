import { Pause, Play, Timer, X } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { formatearRestante } from '../../lib/cronometro-descanso';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';
import { AnilloProgreso } from './RestTimerAnillo';

interface RestTimerPildoraProps {
  cronometro: CronometroDescanso;
  onExpandir: () => void;
}

/** Modo compacto: tiempo restante, pausar/reanudar y cerrar, sin tapar la rutina. */
export function RestTimerPildora({ cronometro, onExpandir }: RestTimerPildoraProps) {
  const { restanteMs, duracionMs, pausado, terminado, pausar, reanudar, cerrar } = cronometro;
  const progreso = duracionMs > 0 ? 1 - restanteMs / duracionMs : 1;

  return (
    <div
      className={`flex items-center gap-1 pl-1.5 pr-1 rounded-full border shadow-2xl backdrop-blur-xl select-none bg-card/95 ${
        terminado ? 'border-success text-success animate-pulse' : 'border-primary/40 text-foreground'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          triggerHaptic('selection');
          onExpandir();
        }}
        aria-label="Expandir cronómetro"
        title="Expandir cronómetro"
        className="min-h-11 min-w-11 flex items-center gap-2 pr-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <AnilloProgreso progreso={progreso} terminado={terminado}>
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        </AnilloProgreso>
        <span className="flex flex-col text-left">
          <span className="text-[11px] uppercase font-bold leading-none tracking-wider text-muted-foreground">
            {terminado ? 'Terminado' : pausado ? 'En pausa' : 'Descanso'}
          </span>
          <span className="text-lg font-bold font-mono tabular-nums tracking-tight leading-tight">
            {formatearRestante(restanteMs)}
          </span>
        </span>
      </button>

      {!terminado && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            if (pausado) reanudar();
            else pausar();
          }}
          aria-label={pausado ? 'Reanudar descanso' : 'Pausar descanso'}
          title={pausado ? 'Reanudar descanso' : 'Pausar descanso'}
          className={`min-h-11 min-w-11 h-11 w-11 rounded-full flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            pausado ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'
          }`}
        >
          {pausado ? (
            <Play className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pause className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar cronómetro de descanso"
        title="Cerrar cronómetro de descanso"
        className="min-h-11 min-w-11 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/80 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
