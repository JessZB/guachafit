/**
 * Módulo `monitor-adherencia` · cabecera con chips del semáforo y búsqueda.
 *
 * Extraída verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:517-656`.
 * Clasificación: ÚNICO (copys propios de la vista, R3).
 *
 * UX-14 (SEG-13, 14): chips con `ChipFiltro` (`aria-pressed`, `min-h-11`) dentro de un grupo
 * "Filtrar por estado", con etiqueta corta y conteo ("En riesgo 3"). El punto de color de los
 * chips con tono es `aria-hidden`: el nombre accesible no depende del color. "Actualizar" con
 * `BotonTactil` y buscador táctil (`min-h-11`, texto base en móvil para evitar el zoom de iOS).
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacional: solo props y callbacks, sin `useQuery` ni `api-client` (R1).
 */

import type { Dispatch, SetStateAction } from 'react';
import { Activity, RefreshCw, Search, X } from 'lucide-react';
import type { ResumenMonitorAdherenciaDTO } from '@guachafit/shared';
import { DESTINOS_ENTRENADOR } from '../../../lib/etiquetas-dominio';
import { triggerHaptic } from '../../../lib/haptics';
import type { TonoSemaforo } from '../../../lib/adherencia';
import { CLASES_TONO } from '../../../lib/monitor-adherencia-presentacion';
import { BotonTactil } from '../../ui/BotonTactil';
import { ChipFiltro } from '../../ui/ChipFiltro';
import type { FiltroSemaforoMonitor } from './use-monitor-adherencia';

export interface CabeceraMonitorProps {
  resumen: ResumenMonitorAdherenciaDTO | null;
  totalCartera: number;
  total: number;
  filtroSemaforo: FiltroSemaforoMonitor;
  onCambiarFiltroSemaforo: Dispatch<SetStateAction<FiltroSemaforoMonitor>>;
  busqueda: string;
  onCambiarBusqueda: (valor: string) => void;
  filtroActivo: boolean;
  isLoading: boolean;
  error: string | null;
  cargando: boolean;
  onRecargar: () => void;
}

export function CabeceraMonitor({
  resumen,
  totalCartera,
  total,
  filtroSemaforo,
  onCambiarFiltroSemaforo,
  busqueda,
  onCambiarBusqueda,
  filtroActivo,
  isLoading,
  error,
  cargando,
  onRecargar,
}: CabeceraMonitorProps) {
  // Chips con el `resumen` GLOBAL del servidor (cartera completa). El `tono` solo añade el punto de color.
  const chips: ReadonlyArray<{
    clave: FiltroSemaforoMonitor;
    etiqueta: string;
    valor: number;
    tono?: TonoSemaforo;
  }> = [
    { clave: 'todos', etiqueta: 'Todos', valor: resumen?.total ?? 0 },
    { clave: 'rojo', etiqueta: 'En riesgo', valor: resumen?.rojo ?? 0, tono: 'danger' },
    {
      clave: 'amarillo',
      etiqueta: 'En observación',
      valor: resumen?.amarillo ?? 0,
      tono: 'warning',
    },
    { clave: 'verde', etiqueta: 'Al día', valor: resumen?.verde ?? 0, tono: 'success' },
    { clave: 'sin_plan', etiqueta: 'Sin plan', valor: resumen?.sinPlan ?? 0, tono: 'neutral' },
  ];

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Activity className="h-4 w-4" />
            <span>Cumplimiento semanal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            {DESTINOS_ENTRENADOR.seguimiento.etiqueta}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Cumplimiento de la semana por alumno, ordenado por nivel de riesgo.
            Las horas se muestran en tu hora local.
          </p>
        </div>

        <BotonTactil
          variante="secundaria"
          disabled={isLoading}
          onClick={() => {
            triggerHaptic('light');
            onRecargar();
          }}
          className="self-start border border-border"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${cargando ? 'motion-safe:animate-spin' : ''}`}
          />
          <span>Actualizar</span>
        </BotonTactil>
      </div>

      {/* WU25a: chips con el `resumen` GLOBAL del servidor (cartera completa) + búsqueda */}
      {!isLoading && !error && totalCartera > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
            {chips.map(({ clave, etiqueta, valor, tono }) => (
              <ChipFiltro
                key={clave}
                activo={filtroSemaforo === clave}
                onClick={() => {
                  triggerHaptic('selection');
                  // Toggle: volver a tocar el chip activo limpia el filtro.
                  onCambiarFiltroSemaforo((prev) =>
                    clave === 'todos' || prev === clave ? 'todos' : clave
                  );
                }}
              >
                {tono && (
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${CLASES_TONO[tono].punto}`}
                  />
                )}
                {`${etiqueta} ${valor}`}
              </ChipFiltro>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => onCambiarBusqueda(e.target.value)}
                placeholder="Buscar alumno por nombre…"
                aria-label="Buscar alumno por nombre"
                className="min-h-11 w-full pl-9 pr-11 py-2.5 rounded-xl bg-card border border-border text-base sm:text-xs text-foreground focus:outline-hidden focus:border-primary"
              />
              {busqueda.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCambiarBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {filtroActivo && (
              <span className="text-xs font-bold text-muted-foreground" role="status" aria-live="polite">
                {total} {total === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
