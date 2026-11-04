import { ChevronDown, Minus, Pause, Play, Plus, RotateCcw, Timer, X } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { formatearRestante } from '../../lib/cronometro-descanso';
import { formatearSegundos } from '../../lib/sesion-tiempos';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';

interface RestTimerPanelProps {
  cronometro: CronometroDescanso;
  onMinimizar: () => void;
}

const PRESETS_SEGUNDOS = [60, 90, 120, 180];
const BOTON_SECUNDARIO =
  'min-h-11 min-w-11 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground flex items-center justify-center gap-1 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const BOTON_ICONO =
  'min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Modo expandido: tiempo grande, progreso, presets y ajuste fino de ±15 s. */
export function RestTimerPanel({ cronometro, onMinimizar }: RestTimerPanelProps) {
  const { restanteMs, duracionMs, pausado, terminado } = cronometro;
  const { pausar, reanudar, ajustar, elegirPreset, reiniciar, cerrar } = cronometro;
  const porcentaje =
    duracionMs > 0 ? Math.min(100, Math.max(0, (1 - restanteMs / duracionMs) * 100)) : 100;
  const segundosObjetivo = Math.round(duracionMs / 1000);

  return (
    <div
      className={`w-80 max-w-full p-4 rounded-3xl border shadow-2xl backdrop-blur-2xl bg-card/95 text-card-foreground ${
        terminado ? 'border-success' : 'border-primary/40'
      }`}
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
        <div className={`flex items-center gap-2 ${terminado ? 'text-success' : ''}`}>
          <Timer className={`h-4 w-4 ${terminado ? '' : 'text-primary'}`} aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider">
            {terminado ? 'Tiempo cumplido' : pausado ? 'Descanso en pausa' : 'Tiempo de descanso'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onMinimizar();
            }}
            aria-label="Minimizar cronómetro"
            title="Minimizar cronómetro"
            className={BOTON_ICONO}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar cronómetro"
            title="Cerrar cronómetro"
            className={BOTON_ICONO}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="my-4 flex flex-col items-center">
        <div
          className={`text-5xl font-bold tracking-tight font-mono tabular-nums ${
            terminado ? 'text-success' : ''
          }`}
        >
          {formatearRestante(restanteMs)}
        </div>
        <div
          className="w-full bg-secondary/80 h-2 rounded-full overflow-hidden mt-3.5"
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${
              terminado ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3.5">
        {PRESETS_SEGUNDOS.map((segundos) => (
          <button
            key={segundos}
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              elegirPreset(segundos);
            }}
            aria-pressed={segundosObjetivo === segundos}
            aria-label={`Descanso de ${formatearSegundos(segundos)}`}
            className={`min-h-11 min-w-11 py-2 text-xs font-bold rounded-xl border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              segundosObjetivo === segundos
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-secondary/60 hover:bg-secondary border-border text-foreground'
            }`}
          >
            {formatearSegundos(segundos)}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              ajustar(-15);
            }}
            aria-label="Restar 15 segundos"
            title="Restar 15 segundos"
            className={BOTON_SECUNDARIO}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            {formatearSegundos(15)}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              ajustar(15);
            }}
            aria-label="Sumar 15 segundos"
            title="Sumar 15 segundos"
            className={BOTON_SECUNDARIO}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {formatearSegundos(15)}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!terminado && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                if (pausado) reanudar();
                else pausar();
              }}
              aria-label={pausado ? 'Reanudar descanso' : 'Pausar descanso'}
              className={`min-h-11 min-w-11 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                pausado
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              {pausado ? (
                <Play className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Pause className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{pausado ? 'Reanudar' : 'Pausar'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              reiniciar();
            }}
            aria-label="Reiniciar descanso"
            title="Reiniciar descanso"
            className={BOTON_SECUNDARIO}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground text-center">
        Con la pantalla bloqueada no podemos avisarte
      </p>
    </div>
  );
}
