/**
 * Átomo de estado vacío (fase C, prompt 48).
 *
 * Consolida la tarjeta `border-dashed` duplicada en 20+ sitios
 * (`PlantillasPage.tsx:636-650` y `:652-674`, `AlumnosPage.tsx:791-823`,
 * `PagosPage.tsx:589-598` y `:1020-1041`, `ProgresoPage.tsx:1036-1048`,
 * `AntropometriaPage.tsx:319`, `ConciliacionPage.tsx:416`,
 * `TablaCartera.tsx:256-265`, `MonitorAdherenciaPage.tsx:688-725`).
 *
 * - La acción opcional se renderiza con `BotonTactil` (44px, §6.8).
 * - §6.6: vacío explícito con título y detalle honesto; sin dominio ni datos (R9).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SearchX } from 'lucide-react';
import { BotonTactil, type VarianteBotonTactil } from './BotonTactil';

export interface AccionEstadoVacio {
  texto: string;
  onAccion: () => void;
  variante?: VarianteBotonTactil;
}

export interface EstadoVacioProps {
  titulo: string;
  detalle?: ReactNode;
  icono?: LucideIcon;
  accion?: AccionEstadoVacio;
}

export function EstadoVacio({
  titulo,
  detalle,
  icono: Icono = SearchX,
  accion,
}: EstadoVacioProps) {
  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
      <Icono aria-hidden="true" className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
      <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
      {detalle ? (
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{detalle}</p>
      ) : null}
      {accion ? (
        <BotonTactil
          variante={accion.variante ?? 'secundaria'}
          onClick={accion.onAccion}
        >
          {accion.texto}
        </BotonTactil>
      ) : null}
    </div>
  );
}
