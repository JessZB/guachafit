/**
 * Onboarding (WU-E RF-011): bloque del codigo de coach con sus cuatro estados.
 *
 * Presentacional (R1/ADR-022): recibe props y un callback; no pide datos (la resolucion
 * vive en `useValidacionCoach`). Recorte verbatim del contenedor: mismos ids, textos,
 * roles y clases (§6: `min-h-11`, `text-xs`, pesos ≤ 700).
 */
import type { CoachPublicoDTO } from '@guachafit/shared';
import { MENSAJE_COACH_NO_DISPONIBLE } from '../../../lib/onboarding-links';
import type { EstadoValidacionCoach } from './use-validacion-coach';
import { Loader2, ShieldAlert, UserCheck } from 'lucide-react';

export interface CodigoCoachBloqueProps {
  coachCode: string;
  estado: EstadoValidacionCoach;
  coachInfo: CoachPublicoDTO | null;
  onCambiar: (valor: string) => void;
}

export function CodigoCoachBloque({
  coachCode,
  estado,
  coachInfo,
  onCambiar,
}: CodigoCoachBloqueProps) {
  return (
    <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
      <label htmlFor="onboarding-coach" className="text-xs font-bold text-primary">
        Código de tu entrenador
      </label>
      <input
        id="onboarding-coach"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        required
        value={coachCode}
        onChange={(e) => onCambiar(e.target.value.toUpperCase())}
        placeholder="Código de tu entrenador"
        className="w-full min-h-11 px-3 py-1.5 rounded-lg bg-background border border-primary/40 font-mono font-bold text-sm tracking-wider uppercase text-foreground focus:outline-hidden"
      />

      {estado === 'validando' && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Verificando código...</span>
        </p>
      )}

      {estado === 'valido' && coachInfo && (
        <p className="flex items-center gap-1.5 text-xs text-success font-semibold">
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          <span>
            Te vincularás con: {coachInfo.nombre}
            {coachInfo.nombreComercial ? ` · ${coachInfo.nombreComercial}` : ''}
          </span>
        </p>
      )}

      {estado === 'invalido' && (
        <p className="flex items-center gap-1.5 text-xs text-danger font-semibold">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{MENSAJE_COACH_NO_DISPONIBLE}</span>
        </p>
      )}

      {estado === 'vacio' && (
        <p className="text-xs text-muted-foreground">
          Pega o escribe el código que te compartió tu entrenador.
        </p>
      )}
    </div>
  );
}
