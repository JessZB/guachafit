/**
 * Módulo `alumnos` (fase B, prompt 53) · fila de KPIs interactivos de la cartera.
 *
 * Extraída de `pages/entrenador/AlumnosPage.tsx:454-581` (grid config-driven de 6
 * tarjetas-filtro). Clasificación: ÚNICO (composición sin dato propio, solo de esta
 * vista; guía 48 fila 25: `MetricCard` NO 1:1 → único hoy → D).
 *
 * R5: cada tarjeta conserva su nombre accesible ("Total Cartera {n}", "Activos {n}",
 * "Pausados {n}", "En Mora {n}", "Presenciales {n}", "Archivados {n}") y su efecto
 * sobre los filtros; "En Mora" conserva el punto pulsante con `morosos > 0`.
 * §6: texto ≥ 12px, peso ≤ 700. Presentacional: composición sin dato propio (R1).
 */

import type { ResumenDirectorioAlumnosDTO } from '@guachafit/shared';
import type {
  FiltroEstadoDirectorio,
  FiltroModalidadDirectorio,
} from '../../../lib/directorio-alumnos';
import { TarjetaKpiFiltro } from './TarjetaKpiFiltro';

export interface FilaKpisCarteraProps {
  kpis: ResumenDirectorioAlumnosDTO;
  filterEstado: FiltroEstadoDirectorio;
  filterModalidad: FiltroModalidadDirectorio;
  onCambiarEstado: (estado: FiltroEstadoDirectorio) => void;
  onCambiarModalidad: (modalidad: FiltroModalidadDirectorio) => void;
  onVerCarteraCompleta: () => void;
}

export function FilaKpisCartera({
  kpis,
  filterEstado,
  filterModalidad,
  onCambiarEstado,
  onCambiarModalidad,
  onVerCarteraCompleta,
}: FilaKpisCarteraProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-border/60 text-xs">
      <TarjetaKpiFiltro
        titulo="Total Cartera"
        valor={kpis.total}
        activo={filterEstado === 'todos' && filterModalidad === 'todas'}
        tono="primary"
        valorNeutro
        onClick={onVerCarteraCompleta}
      />

      <TarjetaKpiFiltro
        titulo="Activos"
        valor={kpis.activos}
        activo={filterEstado === 'activo'}
        tono="success"
        onClick={() => onCambiarEstado('activo')}
      />

      <TarjetaKpiFiltro
        titulo="Pausados"
        valor={kpis.pausados}
        activo={filterEstado === 'pausado'}
        tono="warning"
        onClick={() => onCambiarEstado('pausado')}
      />

      <TarjetaKpiFiltro
        titulo="En Mora"
        valor={kpis.morosos}
        activo={filterEstado === 'mora'}
        tono="danger"
        encabezado={
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              En Mora
            </span>
            {kpis.morosos > 0 && (
              <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
            )}
          </div>
        }
        onClick={() => onCambiarEstado('mora')}
      />

      <TarjetaKpiFiltro
        titulo="Presenciales"
        valor={kpis.presenciales}
        activo={filterModalidad === 'presencial'}
        tono="primary"
        onClick={() => onCambiarModalidad('presencial')}
      />

      <TarjetaKpiFiltro
        titulo="Archivados"
        valor={kpis.archivados}
        activo={filterEstado === 'archivados'}
        tono="muted"
        onClick={() => onCambiarEstado('archivados')}
      />
    </div>
  );
}
