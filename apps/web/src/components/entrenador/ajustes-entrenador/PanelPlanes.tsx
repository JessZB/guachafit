/**
 * RF-018 · Ajustes del entrenador: pestaña del catálogo de planes.
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:519-641`.
 * Presentacional: compone `TarjetaPlanComercial` y los estados de carga, error, honesto y vacío.
 * El error de carga (`planesError`) y el de activación (`errorToggle`) van en avisos separados
 * (UX-18, CFG-13). El error con reintento y el vacío usan los átomos `ui/EstadoError` y
 * `ui/EstadoVacio` (filas M7 de la consolidación 48); textos conservados.
 */
import { CreditCard, Plus, X } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { pluralizar } from '../../../lib/pluralizar';
import { AvisosAjustes } from '../../ajustes/CampoAjustes';
import { BotonTactil } from '../../ui/BotonTactil';
import { CargaConEsqueleto } from '../../ui/CargaConEsqueleto';
import { EsqueletoRejillaTarjetas } from '../../ui/esqueletos';
import { EstadoError } from '../../ui/EstadoError';
import { EstadoVacio } from '../../ui/EstadoVacio';
import { TarjetaPlanComercial } from './TarjetaPlanComercial';

export interface PanelPlanesProps {
  planes: PlanMembresiaDetalleDTO[];
  isLoadingPlanes: boolean;
  planesError: string | null;
  /** Error de la última activación o desactivación (aparte del error de carga). */
  errorToggle?: string | null;
  /** Id del plan con un cambio de activación en curso. */
  planEnCurso?: string | null;
  onCerrarErrorToggle?: () => void;
  onEditar: (plan: PlanMembresiaDetalleDTO) => void;
  onToggleActivo: (plan: PlanMembresiaDetalleDTO) => void;
  onCrear: () => void;
  onReintentar: () => void;
}

export function PanelPlanes({
  planes,
  isLoadingPlanes,
  planesError,
  errorToggle = null,
  planEnCurso = null,
  onCerrarErrorToggle,
  onEditar,
  onToggleActivo,
  onCrear,
  onReintentar,
}: PanelPlanesProps) {
  // Primera carga: indicador en lugar de una lista vacía sin explicación.
  if (isLoadingPlanes && planes.length === 0) {
    return (
      <CargaConEsqueleto texto="Cargando planes…">
        <EsqueletoRejillaTarjetas cantidad={3} />
      </CargaConEsqueleto>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Con planes, la acción de alta vive aquí; sin planes la sugiere el EstadoVacio (no se duplica). */}
      {planes.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">
            {pluralizar(planes.length, 'plan', 'planes')}
          </p>
          <BotonTactil onClick={onCrear}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo plan
          </BotonTactil>
        </div>
      )}

      {errorToggle && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <AvisosAjustes error={errorToggle} />
          </div>
          {onCerrarErrorToggle && (
            <button
              type="button"
              onClick={onCerrarErrorToggle}
              aria-label="Cerrar aviso"
              className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div
        aria-busy={isLoadingPlanes}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {planes.map((plan) => (
          <TarjetaPlanComercial
            key={plan.id}
            plan={plan}
            onEditar={onEditar}
            onToggleActivo={onToggleActivo}
            procesando={planEnCurso !== null}
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
