import { Clock, Dumbbell, Flame } from 'lucide-react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { formatearPesoConUnidad, type UnidadPeso } from '../../../lib/weight-unit';
import { formatDuracionMinutos } from '../../../lib/date-format';

export interface ResumenMetricasSesionProps {
  sesion: SesionEntrenamientoDetalleDTO;
  unidadPeso: UnidadPeso;
  omitida: boolean;
}

/**
 * Métricas del hero: progreso, volumen y duración (chips `p-3`).
 * CANDIDATO (R3 duda): existe `common/MetricCard.tsx` con forma distinta (card `p-5`);
 * alinear en fase D con una variante compacta.
 */
export function ResumenMetricasSesion({ sesion, unidadPeso, omitida }: ResumenMetricasSesionProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
        <Flame
          className={`h-6 w-6 ${
            sesion.cumpleReglaRacha ? 'text-warning fill-warning animate-pulse' : 'text-muted-foreground'
          }`}
        />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
            Progreso
          </span>
          <span className="text-base sm:text-lg font-bold font-mono">
            {omitida ? '—' : `${sesion.porcentajeCumplimiento}%`}
          </span>
        </div>
      </div>

      {sesion.volumenTotalKg && sesion.volumenTotalKg !== '0.00' && (
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
          <Dumbbell className="h-6 w-6 text-primary" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Volumen
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-foreground">
              {formatearPesoConUnidad(sesion.volumenTotalKg, unidadPeso) ??
                `${sesion.volumenTotalKg} ${unidadPeso}`}
            </span>
          </div>
        </div>
      )}

      {/* RN-05: duración real de la sesión (UTC -> formato humano local) */}
      {formatDuracionMinutos(sesion.duracionMinutos) && (
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
          <Clock className="h-6 w-6 text-primary" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
              Duración
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-foreground">
              {formatDuracionMinutos(sesion.duracionMinutos)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
