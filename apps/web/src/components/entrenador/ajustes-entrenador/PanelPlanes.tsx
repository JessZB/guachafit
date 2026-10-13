/**
 * RF-018 · Ajustes del entrenador: pestaña del catálogo de planes.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:519-641`.
 * Presentacional: compone `TarjetaPlanComercial` y los estados honesto/vacío.
 * El error con reintento y el vacío usan los átomos `ui/EstadoError` y
 * `ui/EstadoVacio` (filas M7 de la consolidación 48); textos conservados.
 */
import { CreditCard } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { EstadoError } from '../../ui/EstadoError';
import { EstadoVacio } from '../../ui/EstadoVacio';
import { TarjetaPlanComercial } from './TarjetaPlanComercial';

export interface PanelPlanesProps {
  planes: PlanMembresiaDetalleDTO[];
  isLoadingPlanes: boolean;
  planesError: string | null;
  onEditar: (plan: PlanMembresiaDetalleDTO) => void;
  onToggleActivo: (plan: PlanMembresiaDetalleDTO) => void;
  onCrear: () => void;
  onReintentar: () => void;
}

export function PanelPlanes({
  planes,
  isLoadingPlanes,
  planesError,
  onEditar,
  onToggleActivo,
  onCrear,
  onReintentar,
}: PanelPlanesProps) {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planes.map((plan) => (
          <TarjetaPlanComercial
            key={plan.id}
            plan={plan}
            onEditar={onEditar}
            onToggleActivo={onToggleActivo}
          />
        ))}
      </div>

      {planesError && (
        <EstadoError mensaje={planesError} onReintentar={onReintentar} />
      )}

      {planes.length === 0 && !isLoadingPlanes && !planesError && (
        <EstadoVacio
          titulo="No tienes planes comerciales creados"
          detalle="Crea tu primer plan estándar para poder asignarlo a tus alumnos y facturar cuotas."
          icono={CreditCard}
          accion={{ texto: 'Crear Primer Plan', onAccion: onCrear }}
        />
      )}
    </div>
  );
}
