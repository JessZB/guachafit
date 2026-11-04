import type { ReactNode } from 'react';

interface AnilloProgresoProps {
  /** Fracción transcurrida del descanso, de 0 a 1. */
  progreso: number;
  terminado: boolean;
  children?: ReactNode;
}

const RADIO = 15;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Anillo de progreso decorativo (el tiempo ya se anuncia por texto y por `role="timer"`). */
export function AnilloProgreso({ progreso, terminado, children }: AnilloProgresoProps) {
  const acotado = Math.min(1, Math.max(0, progreso));
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={RADIO} fill="none" strokeWidth="3" className="stroke-secondary" />
        <circle
          cx="18"
          cy="18"
          r={RADIO}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * acotado}
          className={`transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none ${
            terminado ? 'stroke-success' : 'stroke-primary'
          }`}
        />
      </svg>
      {children}
    </span>
  );
}
