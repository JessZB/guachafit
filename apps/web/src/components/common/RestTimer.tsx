import React, { useState, useEffect } from 'react';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { formatearSegundos } from '../../lib/sesion-tiempos';

interface RestTimerProps {
  initialSeconds?: number;
  onClose?: () => void;
  isOpen: boolean;
  onDurationChange?: (totalSeconds: number) => void;
}

/**
 * Emite un tono sonoro sintético suave y deportivo (Web Audio API)
 * sin requerir archivos mp3 externos ni descargas de red.
 */
function playGymTimerBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tono 1: 880Hz (La)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    gain1.gain.setValueAtTime(0.18, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.18);

    // Tono 2: 1174Hz (Re agudo de confirmación)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.2);
    gain2.gain.setValueAtTime(0.22, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.5);
  } catch {
    // Ignorar si el navegador bloquea audio antes de interacción
  }
}

export function RestTimer({ initialSeconds = 90, onClose, isOpen, onDurationChange }: RestTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);

  // Reiniciar cuando se abre un nuevo temporizador
  useEffect(() => {
    setSecondsLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    setIsRunning(true);
    setIsFinished(false);
    setIsMinimized(true); // Abre en modo píldora discreta para no tapar la rutina
    onDurationChange?.(initialSeconds);
  }, [initialSeconds, isOpen]);

  // Intervalo del cronómetro
  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && secondsLeft === 0) {
      setIsRunning(false);
      setIsFinished(true);
      triggerHaptic('timer');
      playGymTimerBeep();
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  if (!isOpen) return null;

  const setPreset = (sec: number) => {
    setTotalSeconds(sec);
    setSecondsLeft(sec);
    setIsRunning(true);
    setIsFinished(false);
    triggerHaptic('selection');
    onDurationChange?.(sec);
  };

  const adjustSeconds = (delta: number) => {
    triggerHaptic('light');
    setSecondsLeft((prev) => Math.max(0, prev + delta));
    setTotalSeconds((prev) => {
      const next = Math.max(10, prev + delta);
      onDurationChange?.(next);
      return next;
    });
  };

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ------------------------------------------------------------- */}
      {/* MODO 1: PÍLDORA COMPACTA Y FLOTANTE (No invasiva)              */}
      {/* ------------------------------------------------------------- */}
      {isMinimized ? (
        <div
          className={`flex items-center gap-2 sm:gap-3 px-3.5 py-2 rounded-full border shadow-2xl backdrop-blur-xl transition-all select-none ${
            isFinished
              ? 'bg-card border-destructive/50 text-destructive shadow-lg shadow-destructive/20 animate-pulse'
              : 'bg-card/95 border-primary/40 text-foreground'
          }`}
        >
          {/* Indicador y Tiempo */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsMinimized(false);
            }}
            title="Expandir controles de descanso"
            aria-label={`Descanso: ${formatTime(secondsLeft)}. Expandir controles`}
            className="min-h-11 min-w-11 flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div
              className={`p-1.5 rounded-full ${
                isFinished
                  ? 'bg-destructive/20 text-destructive'
                  : isRunning
                  ? 'bg-primary/20 text-primary animate-pulse'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Timer className="h-4 w-4" />
            </div>
            <div className="flex flex-col text-left">
              <span
                className={`text-[11px] uppercase font-bold leading-none tracking-wider ${
                  isFinished ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {isFinished ? '¡Listo!' : 'Descanso'}
              </span>
              <span className="text-base sm:text-lg font-bold font-mono tracking-tight leading-tight">
                {formatTime(secondsLeft)}
              </span>
            </div>
          </button>

          {/* Botón rápido Play / Pausa */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsRunning(!isRunning);
            }}
            title={isRunning ? 'Pausar descanso' : 'Reanudar descanso'}
            aria-label={isRunning ? 'Pausar descanso' : 'Reanudar descanso'}
            className={`min-h-11 min-w-11 h-11 w-11 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isRunning
                ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                : 'bg-primary text-primary-foreground shadow-xs'
            }`}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          {/* Botón rápido +30 s */}
          <button
            type="button"
            onClick={() => adjustSeconds(30)}
            title="Agregar 30 segundos"
            aria-label="Agregar 30 segundos"
            className="min-h-11 min-w-11 px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground cursor-pointer transition-colors"
          >
            +{formatearSegundos(30)}
          </button>

          {/* Botón Expandir a Pantalla Completa */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsMinimized(false);
            }}
            title="Expandir cronómetro"
            aria-label="Expandir cronómetro"
            className="min-h-11 min-w-11 flex items-center justify-center p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Botón Cerrar */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar cronómetro"
              aria-label="Cerrar cronómetro"
              className="min-h-11 min-w-11 flex items-center justify-center p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        /* ------------------------------------------------------------- */
        /* MODO 2: TARJETA EXPANDIDA (Presets y Ajuste Fino)             */
        /* ------------------------------------------------------------- */
        <div
          className={`p-4 sm:p-5 rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all duration-300 w-80 sm:w-88 ${
            isFinished
              ? 'bg-card/95 border-destructive/50 text-card-foreground animate-pulse'
              : 'bg-card/95 border-primary/40 text-card-foreground'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Timer className={`h-4 w-4 ${isFinished ? 'text-destructive' : 'text-primary'}`} />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isFinished ? 'text-destructive' : ''
                }`}
              >
                {isFinished ? '¡Tiempo cumplido!' : 'Tiempo de descanso'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsMinimized(true);
                }}
                className="min-h-11 min-w-11 flex items-center justify-center p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Minimizar cronómetro"
                aria-label="Minimizar cronómetro"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 min-w-11 flex items-center justify-center p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Cerrar cronómetro"
                  aria-label="Cerrar cronómetro"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Display & Barra de Progreso */}
          <div className="my-4 flex flex-col items-center">
            <div className={`text-5xl font-bold tracking-tight font-mono ${isFinished ? 'text-destructive' : ''}`}>
              {formatTime(secondsLeft)}
            </div>
            <div className="w-full bg-secondary/80 h-2 rounded-full overflow-hidden mt-3.5">
              <div
                className={`h-full ${isFinished ? 'bg-destructive' : 'bg-primary'} transition-all duration-300 rounded-full`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Presets Rápidos */}
          <div className="grid grid-cols-4 gap-2 mb-3.5">
            {[60, 90, 120, 180].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setPreset(sec)}
                aria-pressed={totalSeconds === sec}
                aria-label={`Descanso de ${formatearSegundos(sec)}`}
                className={`min-h-11 min-w-11 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  totalSeconds === sec
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-102'
                    : 'bg-secondary/60 hover:bg-secondary border-border text-foreground'
                }`}
              >
                {formatearSegundos(sec)}
              </button>
            ))}
          </div>

          {/* Controles de Ajuste Fino */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustSeconds(-15)}
                className="min-h-11 min-w-11 px-2.5 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground cursor-pointer"
                title="Quitar 15 segundos"
                aria-label="Quitar 15 segundos"
              >
                -{formatearSegundos(15)}
              </button>
              <button
                type="button"
                onClick={() => adjustSeconds(30)}
                className="min-h-11 min-w-11 px-2.5 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground cursor-pointer"
                title="Agregar 30 segundos"
                aria-label="Agregar 30 segundos"
              >
                +{formatearSegundos(30)}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setIsRunning(!isRunning);
                }}
                aria-label={isRunning ? 'Pausar descanso' : 'Reanudar descanso'}
                className={`min-h-11 min-w-11 py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-md transition-all cursor-pointer ${
                  isRunning
                    ? 'bg-warning/20 text-warning border border-warning/30'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="h-4 w-4" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Reanudar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSecondsLeft(totalSeconds);
                  setIsRunning(false);
                  setIsFinished(false);
                }}
                className="min-h-11 min-w-11 flex items-center justify-center p-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs cursor-pointer"
                title="Reiniciar tiempo"
                aria-label="Reiniciar tiempo"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
