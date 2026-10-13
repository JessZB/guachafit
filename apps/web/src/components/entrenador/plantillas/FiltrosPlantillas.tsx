/**
 * M8 plantillas (fase B, prompt 58) · filtros del banco (estado + búsqueda + nivel).
 *
 * Origen: `PlantillasPage.tsx:70-74, 538-604`. Componente único (R3: filtros
 * específicos del banco; la lógica ya vive en `lib/plantillas-filtros.ts`).
 * Solo props y callbacks (R1): sin `useQuery` ni `api-client`. Usa
 * `ui/ChipFiltro` (consolidación 48 §M8, fila 5; `aria-pressed` + `min-h-11`
 * adoptados a conciencia). Conserva labels, `aria-pressed` y el texto
 * "Mostrando N de M" que usan los specs (R5).
 *
 * §6: español claro, controles táctiles 44px (chips `min-h-11`), piso 11px
 * (`text-[11px]` exacto en el contador), tokens con variante claro/oscuro,
 * peso ≤ 700.
 */
import { Search } from 'lucide-react';
import { ChipFiltro } from '../../ui/ChipFiltro';
import {
  ETIQUETAS_NIVEL_PLANTILLA,
  NIVELES_PLANTILLA_ORDEN,
} from '../../../lib/plantillas-rutina';
import type {
  FiltroEstadoPlantilla,
  FiltroNivelPlantilla,
} from '../../../lib/plantillas-filtros';

const OPCIONES_FILTRO: Array<{ valor: FiltroEstadoPlantilla; label: string }> = [
  { valor: 'activas', label: 'Activas' },
  { valor: 'desactivadas', label: 'Desactivadas' },
  { valor: 'todas', label: 'Todas' },
];

export interface FiltrosPlantillasProps {
  filtro: FiltroEstadoPlantilla;
  conteos: Record<FiltroEstadoPlantilla, number>;
  onCambiarFiltro: (filtro: FiltroEstadoPlantilla) => void;
  busqueda: string;
  onCambiarBusqueda: (valor: string) => void;
  filtroNivel: FiltroNivelPlantilla;
  onCambiarNivel: (nivel: FiltroNivelPlantilla) => void;
  visiblesCount: number;
  mostrarContador: boolean;
}

export function FiltrosPlantillas({
  filtro,
  conteos,
  onCambiarFiltro,
  busqueda,
  onCambiarBusqueda,
  filtroNivel,
  onCambiarNivel,
  visiblesCount,
  mostrarContador,
}: FiltrosPlantillasProps) {
  return (
    <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {OPCIONES_FILTRO.map((opcion) => {
            const activo = filtro === opcion.valor;
            return (
              <ChipFiltro
                key={opcion.valor}
                activo={activo}
                onClick={() => onCambiarFiltro(opcion.valor)}
                className="gap-1.5 px-3 py-1.5"
              >
                <span>{opcion.label}</span>
                <span className={`font-mono text-xs ${activo ? 'opacity-80' : 'opacity-60'}`}>
                  {conteos[opcion.valor]}
                </span>
              </ChipFiltro>
            );
          })}
        </div>

        <div className="flex flex-1 flex-col sm:flex-row gap-2 lg:justify-end">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => onCambiarBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
              aria-label="Buscar plantilla por nombre"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <select
            value={filtroNivel}
            onChange={(e) => onCambiarNivel(e.target.value as FiltroNivelPlantilla)}
            aria-label="Filtrar plantillas por nivel objetivo"
            className="px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
          >
            <option value="todos">Todos los niveles</option>
            {NIVELES_PLANTILLA_ORDEN.map((nivel) => (
              <option key={nivel} value={nivel}>
                {ETIQUETAS_NIVEL_PLANTILLA[nivel]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mostrarContador && (
        <p className="text-[11px] text-muted-foreground font-mono">
          Mostrando {visiblesCount} de {conteos[filtro]}{' '}
          {filtro === 'todas' ? 'plantillas' : filtro}
        </p>
      )}
    </div>
  );
}

