import React from 'react';
import { Flame } from 'lucide-react';

export interface ChipRachaProps {
  rachaDias: number;
  rachaNoDisponible: boolean;
  cargando?: boolean;
}

/**
 * MEN-01, MEN-06: Chip honesto de racha del alumno.
 * Muestra "—" con subetiqueta clara si está cargando o no disponible, y racha real sin textos de ánimo falsos.
 */
export function ChipRacha({
  rachaDias,
  rachaNoDisponible,
  cargando = false,
}: ChipRachaProps) {
  const tieneRacha = !rachaNoDisponible && !cargando && rachaDias > 0;
  const rachaLabel =
    cargando || rachaNoDisponible
      ? '—'
      : `${rachaDias} ${rachaDias === 1 ? 'día' : 'días'}`;
  const rachaSublabel =
    cargando || rachaNoDisponible
      ? rachaNoDisponible
        ? 'Racha no disponible'
        : 'Cargando racha…'
      : tieneRacha
      ? 'Racha activa'
      : 'Sin racha · completa tu plan';

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-secondary/60 border border-border/80">
      <div
        className={`p-1.5 rounded-xl ${
          tieneRacha ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'
        }`}
      >
        <Flame
          aria-hidden="true"
          className={`h-4 w-4 ${tieneRacha ? 'fill-warning/30' : ''}`}
        />
      </div>
      <div className="text-right">
        <div className="text-xs font-bold font-mono text-foreground">{rachaLabel}</div>
        <div className="text-xs text-muted-foreground">{rachaSublabel}</div>
      </div>
    </div>
  );
}
