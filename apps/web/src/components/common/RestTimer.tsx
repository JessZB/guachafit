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

interface RestTimerProps {
  initialSeconds?: number;
  onClose?: () => void;
  isOpen: boolean;
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

export function RestTimer({ initialSeconds = 90, onClose, isOpen }: RestTimerProps) {
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
  };

  const adjustSeconds = (delta: number) => {
    triggerHaptic('light');
    setSecondsLeft((prev) => Math.max(0, prev + delta));
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
              ? 'bg-rose-600 text-white border-rose-400 animate-bounce'
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
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div
              className={`p-1.5 rounded-full ${
                isFinished
                  ? 'bg-white/20 text-white'
                  : isRunning
                  ? 'bg-primary/20 text-primary animate-pulse'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              <Timer className="h-4 w-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none tracking-wider">
                {isFinished ? '¡Listo!' : 'Descanso'}
              </span>
              <span className="text-base sm:text-lg font-black font-mono tracking-tight leading-tight">
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
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              isRunning
                ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                : 'bg-primary text-primary-foreground shadow-xs'
            }`}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          {/* Botón rápido +30s */}
          <button
            type="button"
            onClick={() => adjustSeconds(30)}
            title="Agregar 30 segundos"
            className="px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground cursor-pointer transition-colors"
          >
            +30s
          </button>

          {/* Botón Expandir a Pantalla Completa */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setIsMinimized(false);
            }}
            title="Expandir cronómetro"
            className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Botón Cerrar */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar cronómetro"
              className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
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
              ? 'bg-rose-600/95 text-white border-rose-400 animate-pulse'
              : 'bg-card/95 border-primary/40 text-card-foreground'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-wider">
                {isFinished ? '¡Tiempo Cumplido!' : 'Tiempo de Descanso'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsMinimized(true);
                }}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Minimizar a píldora"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Display & Barra de Progreso */}
          <div className="my-4 flex flex-col items-center">
            <div className="text-5xl font-black tracking-tight font-mono">
              {formatTime(secondsLeft)}
            </div>
            <div className="w-full bg-secondary/80 h-2 rounded-full overflow-hidden mt-3.5">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
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
                className={`py-2 text-xs font-extrabold rounded-xl border transition-all cursor-pointer ${
                  totalSeconds === sec
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-102'
                    : 'bg-secondary/60 hover:bg-secondary border-border text-foreground'
                }`}
              >
                {sec < 60 ? `${sec}s` : `${sec / 60} min`}
              </button>
            ))}
          </div>

          {/* Controles de Ajuste Fino */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => adjustSeconds(-15)}
                className="px-2.5 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-black text-foreground cursor-pointer"
                title="-15 segundos"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() => adjustSeconds(30)}
                className="px-2.5 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-black text-foreground cursor-pointer"
                title="+30 segundos"
              >
                +30s
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setIsRunning(!isRunning);
                }}
                className={`py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 text-xs shadow-md transition-all cursor-pointer ${
                  isRunning
                    ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
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
                className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs cursor-pointer"
                title="Reiniciar tiempo"
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
