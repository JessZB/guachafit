/**
 * Módulo `alumnos` (fase B, prompt 53) · filtros y búsqueda del directorio.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:642-746`.
 * Clasificación: CANDIDATO (hoy único: chips con `aria-pressed` repetidos en
 * `MonitorAdherenciaPage.tsx:557-611`, `PlantillasPage.tsx:553`, `ProgresoPage.tsx:472`;
 * input de búsqueda repetido en `CarteraPage.tsx:489`, `PlantillasPage.tsx:577`,
 * `MonitorAdherenciaPage.tsx:635`; convergencia en D según guía 48 fila 30).
 *
 * - Los chips de estado usan `ui/ChipFiltro` (consolidación 48 fila 5, guía M3):
 *   impone `aria-pressed` (la copia no lo declaraba) y `min-h-11` (la copia usaba
 *   `py-1.5` ≈ 32px; adopción a conciencia, los specs consultan por rol y nombre).
 * - El selector de modalidad y el input conservan clases verbatim (el campo de
 *   búsqueda queda ÚNICO según la guía).
 * - R5: nombres accesibles idénticos ("Todos ({n})", "Activos ({n})"...,
 *   "Todas"/"Presencial"/"Remoto", `aria-label="Buscar alumnos"`).
 * - Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { Search } from 'lucide-react';
import type { ResumenDirectorioAlumnosDTO } from '@guachafit/shared';
import type {
  FiltroEstadoDirectorio,
  FiltroModalidadDirectorio,
} from '../../../lib/directorio-alumnos';
import { ChipFiltro } from '../../ui/ChipFiltro';

export interface FiltrosDirectorioAlumnosProps {
  kpis: ResumenDirectorioAlumnosDTO;
  filterEstado: FiltroEstadoDirectorio;
  filterModalidad: FiltroModalidadDirectorio;
  search: string;
  onCambiarEstado: (estado: FiltroEstadoDirectorio) => void;
  onCambiarModalidad: (modalidad: FiltroModalidadDirectorio) => void;
  onCambiarBusqueda: (valor: string) => void;
}

export function FiltrosDirectorioAlumnos({
  kpis,
  filterEstado,
  filterModalidad,
  search,
  onCambiarEstado,
  onCambiarModalidad,
  onCambiarBusqueda,
}: FiltrosDirectorioAlumnosProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Chips de Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <ChipFiltro activo={filterEstado === 'todos'} onClick={() => onCambiarEstado('todos')}>
            Todos ({kpis.total})
          </ChipFiltro>
          <ChipFiltro activo={filterEstado === 'activo'} onClick={() => onCambiarEstado('activo')}>
            Activos ({kpis.activos})
          </ChipFiltro>
          <ChipFiltro
            activo={filterEstado === 'pausado'}
            onClick={() => onCambiarEstado('pausado')}
          >
            Pausados ({kpis.pausados})
          </ChipFiltro>
          <ChipFiltro
            activo={filterEstado === 'mora'}
            onClick={() => onCambiarEstado('mora')}
          >
            En Mora ({kpis.morosos})
          </ChipFiltro>
          <ChipFiltro
            activo={filterEstado === 'archivados'}
            onClick={() => onCambiarEstado('archivados')}
          >
            Archivados ({kpis.archivados})
          </ChipFiltro>
        </div>

        {/* Selector de Modalidad */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCambiarModalidad('todas')}
            className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterModalidad === 'todas'
                ? 'bg-foreground text-background font-bold'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => onCambiarModalidad('presencial')}
            className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterModalidad === 'presencial'
                ? 'bg-foreground text-background font-bold'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            Presencial
          </button>
          <button
            onClick={() => onCambiarModalidad('remoto')}
            className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterModalidad === 'remoto'
                ? 'bg-foreground text-background font-bold'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
            }`}
          >
            Remoto
          </button>
        </div>
      </div>

      {/* Input de Búsqueda */}
      <div className="relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-3.5" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => onCambiarBusqueda(e.target.value)}
          placeholder="Buscar por nombre, apellido, correo o documento..."
          aria-label="Buscar alumnos"
          className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary shadow-xs"
        />
      </div>
    </div>
  );
}
