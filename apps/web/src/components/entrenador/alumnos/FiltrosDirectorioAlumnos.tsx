/**
 * Módulo `alumnos` (fase B, prompt 53) · controles del directorio "Mis alumnos".
 *
 * Mis alumnos (2026-10-19), en tres filas:
 * 1. Búsqueda + "Ordenar por" (select nativo con etiqueta visible).
 * 2. Chips de estado con conteo: Vigentes, Activos, Pausados, En mora y Archivados. El conteo sale de
 *    `resumen`; sin resumen el chip no muestra número (nunca "0"). Pulsar el chip activo vuelve a
 *    "Vigentes".
 * 3. Modalidad (Todas / Presencial / Remoto) y alternancia de vista (tarjetas / tabla).
 *
 * Clasificación: CANDIDATO (chips con `aria-pressed` en otras vistas; ver `ui/ChipFiltro`).
 * §6: controles de 44px (`min-h-11`), texto ≥ 12px, foco visible.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { LayoutGrid, Search, Table as TableIcon } from 'lucide-react';
import { OrdenDirectorioAlumnos, type ResumenDirectorioAlumnosDTO } from '@guachafit/shared';
import type {
  FiltroEstadoDirectorio,
  FiltroModalidadDirectorio,
} from '../../../lib/directorio-alumnos';
import type { ModoVistaDirectorio } from '../../../lib/alumnos-directorio-filtros';
import { ChipFiltro } from '../../ui/ChipFiltro';

export interface FiltrosDirectorioAlumnosProps {
  resumen: ResumenDirectorioAlumnosDTO | null;
  filterEstado: FiltroEstadoDirectorio;
  filterModalidad: FiltroModalidadDirectorio;
  search: string;
  orden: OrdenDirectorioAlumnos;
  viewMode: ModoVistaDirectorio;
  onCambiarEstado: (estado: FiltroEstadoDirectorio) => void;
  onCambiarModalidad: (modalidad: FiltroModalidadDirectorio) => void;
  onCambiarBusqueda: (valor: string) => void;
  onCambiarOrden: (orden: OrdenDirectorioAlumnos) => void;
  onCambiarVista: (modo: ModoVistaDirectorio) => void;
}

const OPCIONES_ORDEN: ReadonlyArray<{ valor: OrdenDirectorioAlumnos; texto: string }> = [
  { valor: OrdenDirectorioAlumnos.ALTA_RECIENTE, texto: 'Alta más reciente' },
  { valor: OrdenDirectorioAlumnos.NOMBRE, texto: 'Nombre (A-Z)' },
  { valor: OrdenDirectorioAlumnos.SIN_ENTRENAR, texto: 'Sin entrenar primero' },
  { valor: OrdenDirectorioAlumnos.MAYOR_RACHA, texto: 'Mayor racha' },
];

/** El conteo solo se muestra cuando el resumen ya llegó: sin datos, el chip no inventa un "0". */
function etiquetaConConteo(texto: string, conteo: number | undefined): string {
  return conteo === undefined ? texto : `${texto} ${conteo}`;
}

export function FiltrosDirectorioAlumnos({
  resumen,
  filterEstado,
  filterModalidad,
  search,
  orden,
  viewMode,
  onCambiarEstado,
  onCambiarModalidad,
  onCambiarBusqueda,
  onCambiarOrden,
  onCambiarVista,
}: FiltrosDirectorioAlumnosProps) {
  // Mis alumnos (2026-10-19): "Vigentes" = cartera sin bajas lógicas.
  const vigentes = resumen ? resumen.total - resumen.archivados : undefined;

  // Pulsar el chip activo devuelve al neutro "Vigentes".
  const alternarEstado = (estado: FiltroEstadoDirectorio) =>
    onCambiarEstado(filterEstado === estado ? 'vigentes' : estado);

  return (
    <div className="space-y-3">
      {/* Búsqueda y orden */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="h-4 w-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onCambiarBusqueda(e.target.value)}
            placeholder="Buscar alumno..."
            aria-label="Buscar alumnos"
            className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary focus-visible:outline-2 focus-visible:outline-primary shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="orden-directorio" className="text-xs font-bold text-muted-foreground whitespace-nowrap">
            Ordenar por
          </label>
          <select
            id="orden-directorio"
            value={orden}
            onChange={(e) => onCambiarOrden(e.target.value as OrdenDirectorioAlumnos)}
            className="min-h-11 flex-1 sm:flex-none rounded-xl bg-card border border-border px-3 text-xs text-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            {OPCIONES_ORDEN.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chips de estado con conteo */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Estado de los alumnos">
        <ChipFiltro activo={filterEstado === 'vigentes'} onClick={() => onCambiarEstado('vigentes')}>
          {etiquetaConConteo('Vigentes', vigentes)}
        </ChipFiltro>
        <ChipFiltro activo={filterEstado === 'activo'} onClick={() => alternarEstado('activo')}>
          {etiquetaConConteo('Activos', resumen?.activos)}
        </ChipFiltro>
        <ChipFiltro activo={filterEstado === 'pausado'} onClick={() => alternarEstado('pausado')}>
          {etiquetaConConteo('Pausados', resumen?.pausados)}
        </ChipFiltro>
        <ChipFiltro activo={filterEstado === 'mora'} onClick={() => alternarEstado('mora')}>
          {etiquetaConConteo('En mora', resumen?.morosos)}
        </ChipFiltro>
        <ChipFiltro activo={filterEstado === 'archivados'} onClick={() => alternarEstado('archivados')}>
          {etiquetaConConteo('Archivados', resumen?.archivados)}
        </ChipFiltro>
      </div>

      {/* Modalidad y vista */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5" role="group" aria-label="Modalidad">
          <ChipFiltro activo={filterModalidad === 'todas'} onClick={() => onCambiarModalidad('todas')}>
            Todas
          </ChipFiltro>
          <ChipFiltro
            activo={filterModalidad === 'presencial'}
            onClick={() => onCambiarModalidad('presencial')}
          >
            Presencial
          </ChipFiltro>
          <ChipFiltro activo={filterModalidad === 'remoto'} onClick={() => onCambiarModalidad('remoto')}>
            Remoto
          </ChipFiltro>
        </div>

        <div className="flex items-center p-1 rounded-xl bg-secondary/80 border border-border/80">
          <button
            type="button"
            onClick={() => onCambiarVista('cards')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
              viewMode === 'cards'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vista en tarjetas"
            aria-label="Vista en tarjetas"
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onCambiarVista('table')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vista en tabla"
            aria-label="Vista en tabla"
            aria-pressed={viewMode === 'table'}
          >
            <TableIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
