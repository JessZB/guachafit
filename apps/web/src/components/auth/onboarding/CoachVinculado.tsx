/**
 * Onboarding (D17, RF-011): bloque de solo lectura con el entrenador al que se vincula el alumno.
 *
 * Reemplaza a `CodigoCoachBloque`: el código ya no se escribe ni se edita, viene del enlace y
 * se validó contra la API antes de mostrar el formulario.
 *
 * Presentacional (R1/ADR-022): solo props.
 */
import type { CoachPublicoDTO } from '@guachafit/shared';
import { UserCheck } from 'lucide-react';

export interface CoachVinculadoProps {
  coachInfo: CoachPublicoDTO;
}

export function CoachVinculado({ coachInfo }: CoachVinculadoProps) {
  return (
    <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
      <p className="flex items-center gap-1.5 text-xs text-success font-semibold">
        <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Te vincularás con: {coachInfo.nombre}
          {coachInfo.nombreComercial ? ` · ${coachInfo.nombreComercial}` : ''}
        </span>
      </p>
    </div>
  );
}
