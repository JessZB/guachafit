import React, { useState, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, Plus, Minus, X, Volume2 } from 'lucide-react';

interface RestTimerProps {
  initialSeconds?: number;
  onClose?: () => void;
  isOpen: boolean;
}

export function RestTimer({ initialSeconds = 90, onClose, isOpen }: RestTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    setIsRunning(true);
    setIsFinished(false);
  }, [initialSeconds]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && secondsLeft === 0) {
      setIsRunning(false);
      setIsFinished(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 300]);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  if (!isOpen) return null;

  const setPreset = (sec: number) => {
    setTotalSeconds(sec);
    setSecondsLeft(sec);
    setIsRunning(true);
    setIsFinished(false);
  };

  const adjustSeconds = (delta: number) => {
    setSecondsLeft((prev) => Math.max(0, prev + delta));
  };

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 sm:right-8 z-50 animate-slide-up shadow-2xl">
      <div
        className={`p-4 rounded-2xl border backdrop-blur-xl transition-all duration-300 w-72 sm:w-80 ${
          isFinished
            ? 'bg-destructive/90 text-destructive-foreground border-destructive animate-pulse'
            : 'bg-card/95 border-primary/30 text-card-foreground'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {isFinished ? '¡Tiempo Cumplido!' : 'Descanso entre Series'}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Display & Circular/Bar Progress */}
        <div className="my-4 flex flex-col items-center">
          <div className="text-4xl font-black tracking-tight font-mono">
            {formatTime(secondsLeft)}
          </div>
          <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[60, 90, 120, 180].map((sec) => (
            <button
              key={sec}
              onClick={() => setPreset(sec)}
              className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                totalSeconds === sec
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-secondary/60 hover:bg-secondary border-border text-foreground'
              }`}
            >
              {sec < 60 ? `${sec}s` : `${sec / 60}m`}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
          <div className="flex items-center gap-1">
            <button
              onClick={() => adjustSeconds(-15)}
              className="px-2 py-1 rounded-lg bg-secondary/70 text-xs font-bold hover:bg-secondary"
              title="-15s"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              onClick={() => adjustSeconds(30)}
              className="px-2 py-1 rounded-lg bg-secondary/70 text-xs font-bold hover:bg-secondary"
              title="+30s"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`p-2 rounded-xl font-bold flex items-center gap-1 text-xs shadow-md transition-all ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <button
              onClick={() => {
                setSecondsLeft(totalSeconds);
                setIsRunning(false);
                setIsFinished(false);
              }}
              className="p-2 rounded-xl bg-secondary/70 hover:bg-secondary text-foreground text-xs"
              title="Reiniciar"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
