/**
 * Módulo 6 · Nutrición: tolerancia del día registrado contra las metas (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). La vista del entrenador muestra
 * la tolerancia en fila de día, no en tarjeta: no es reutilizable (R3).
 *
 * Nota sobre `ui/BadgeEstado` (48 §M6): NO se adopta tal cual — impone `uppercase`,
 * `text-[11px]` y `info→primary`, cambios observables prohibidos por R5. Queda para la fase D.
 * §6: chip y filas ≥11px, tokens con variante clara/oscura.
 */
import { Gauge } from 'lucide-react';
import {
  formatearDesviacionPct,
  type ClasificacionTolerancia,
} from '../../../lib/nutricion-metas';
import type {
  CheckinNutricionalDetalleDTO,
  MetasNutricionalesDetalleDTO,
  ToleranciaNutricionalDTO,
} from '@guachafit/shared';

export interface ToleranciaDelDiaProps {
  checkin: CheckinNutricionalDetalleDTO;
  tolerancia: ToleranciaNutricionalDTO;
  clasificacion: ClasificacionTolerancia;
  metas: MetasNutricionalesDetalleDTO | null;
}

export function ToleranciaDelDia({ checkin, tolerancia, clasificacion, metas }: ToleranciaDelDiaProps) {
  return (
    <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border space-y-2">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-primary shrink-0" />
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            clasificacion.tono === 'success'
              ? 'bg-success/15 text-success border-success/30'
              : clasificacion.tono === 'warning'
              ? 'bg-warning/15 text-warning border-warning/30'
              : clasificacion.tono === 'danger'
              ? 'bg-destructive/15 text-destructive border-destructive/30'
              : 'bg-secondary text-muted-foreground border-border'
          }`}
        >
          {clasificacion.texto}
        </span>
      </div>
      <ul className="space-y-1">
        {tolerancia?.desviacionCaloriasPct !== undefined && (
          <li className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              Calorías: {checkin.caloriasReportadas ?? '—'} /{' '}
              {metas?.caloriasObjetivo ?? '—'} kcal
            </span>
            <span className="font-mono font-bold text-foreground">
              {formatearDesviacionPct(tolerancia.desviacionCaloriasPct)}
            </span>
          </li>
        )}
        {tolerancia?.desviacionProteinasPct !== undefined && (
          <li className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              Proteína: {checkin.proteinaGramosReportada ?? '—'} /{' '}
              {metas?.proteinaGramosObjetivo ?? '—'} g
            </span>
            <span className="font-mono font-bold text-foreground">
              {formatearDesviacionPct(tolerancia.desviacionProteinasPct)}
            </span>
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Margen de tolerancia: ±10 % de las metas de tu entrenador.
      </p>
    </div>
  );
}
