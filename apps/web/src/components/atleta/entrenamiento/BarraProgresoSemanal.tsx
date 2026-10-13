import { Calendar } from 'lucide-react';
import type { SemanaEntrenamientoProgresoDTO } from '@guachafit/shared';
import {
  formatearProgresoDias,
  formatearTituloSemana,
} from '../../../lib/entrenamiento-textos';

export interface BarraProgresoSemanalProps {
  semanaProgreso: SemanaEntrenamientoProgresoDTO;
}

/**
 * Barra de progreso semanal (título + "X de Y" + % + barra).
 * REUTILIZABLE (R3.1): duplicada con `AtletaMenuPage.tsx:208-228` (mismo cálculo de ancho
 * y mismos formateadores). Vive en el módulo hasta su promoción en fase D (R6).
 */
export function BarraProgresoSemanal({ semanaProgreso }: BarraProgresoSemanalProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <Calendar className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-xs sm:text-sm font-bold text-foreground">
            {formatearTituloSemana(semanaProgreso.inicioSemana, semanaProgreso.finSemana)}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2.5 self-end sm:self-center">
        <div className="text-right">
          <span className="text-xs font-bold text-foreground">
            {formatearProgresoDias(
              semanaProgreso.bloquesCompletados,
              semanaProgreso.totalBloques
            )}
          </span>
          <span className="text-[11px] text-muted-foreground ml-1.5 font-bold">
            ({semanaProgreso.porcentajeCumplimiento}%)
          </span>
        </div>
        <div className="w-20 sm:w-24 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, parseFloat(semanaProgreso.porcentajeCumplimiento)))}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
