/**
 * Fila de un ejercicio prescrito en lectura (molécula ÚNICA).
 *
 * Solo-lectura de la rutina asignada; no se halló equivalente (`PlantillasPage` no renderiza
 * fichas de ejercicio). Extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-6).
 * Conserva idénticos los chips de prescripción (`4 series × 8-10`, `60 kg`, `RPE 8`) que
 * consultan los specs. Los chips envuelven en móvil; el descanso usa un icono SVG decorativo
 * (`Timer`, `aria-hidden`) en lugar de un emoji.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { Timer } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import { formatearSegundos } from '../../../lib/sesion-tiempos';

export type EjercicioPrescritoLectura = BloqueDiaRutinaDTO['ejercicios'][number];

interface FilaEjercicioPrescritoProps {
  ejercicio: EjercicioPrescritoLectura;
  indice: number;
}

export function FilaEjercicioPrescrito({ ejercicio: ej, indice: ejIdx }: FilaEjercicioPrescritoProps) {
  return (
    <div
      key={ej.id}
      className="p-3 rounded-2xl bg-secondary/20 hover:bg-secondary/35 transition-colors border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="h-5 w-5 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-[11px] shrink-0">
          {ejIdx + 1}
        </span>
        <span className="font-bold text-foreground break-words">{ej.nombre}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 min-w-0 font-mono text-[11px] text-muted-foreground self-end sm:self-center">
        <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
          {pluralizar(ej.series, 'serie', 'series')} × {ej.reps}
        </span>
        <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 font-bold text-primary">
          {ej.peso}
        </span>
        <span className="text-[11px]">RPE {ej.rpe}</span>
        <span className="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-mono font-bold text-[11px] border border-border/60 flex items-center gap-1">
          <Timer className="h-3 w-3 shrink-0" aria-hidden="true" />
          {formatearSegundos(ej.descansoSegundos || 90)}
        </span>
      </div>
    </div>
  );
}
