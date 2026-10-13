/**
 * Módulo `monitor-adherencia` · cabecera con chips del semáforo y búsqueda.
 *
 * Extraída verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:517-656`.
 * Clasificación: ÚNICO (chips con anillos por tono + toggle + copys propios, R3).
 *
 * R5: conserva idénticos heading "Seguimiento de Alumnos", botón "Actualizar", los 5 chips
 * (`aria-pressed`, `title`), el searchbox ("Buscar alumno por nombre") y el status de resultados.
 * CANDIDATO (no sustituye en este refactor, R6): `ChipFiltro`/`BotonTactil` de `ui/`
 * (variantes por tono y `min-h-11` cambiarían el alto observable).
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacional: solo props y callbacks, sin `useQuery` ni `api-client` (R1).
 */

import type { Dispatch, SetStateAction } from 'react';
import { Activity, RefreshCw, Search, X } from 'lucide-react';
import type { ResumenMonitorAdherenciaDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { CLASES_TONO } from '../../../lib/monitor-adherencia-presentacion';
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
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Activity className="h-4 w-4" />
            <span>Cumplimiento semanal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            Seguimiento de Alumnos
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Cumplimiento de la semana por alumno, ordenado por nivel de riesgo.
            Las horas se muestran en tu hora local.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onRecargar();
          }}
          disabled={isLoading}
          className="self-start inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs border border-border transition-all active:scale-95 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* WU25a: chips con el `resumen` GLOBAL del servidor (cartera completa) + búsqueda */}
      {!isLoading && !error && totalCartera > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onCambiarFiltroSemaforo('todos');
              }}
              aria-pressed={filtroSemaforo === 'todos'}
              title="Ver todos los alumnos en seguimiento"
              className={`p-3.5 rounded-2xl bg-secondary/30 border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                filtroSemaforo === 'todos'
                  ? 'border-primary/50 ring-1 ring-primary/30 shadow-xs'
                  : 'border-border/60 hover:border-border'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                Todos
              </span>
              <span className="text-2xl font-bold font-mono text-foreground">
                {resumen?.total ?? 0}
              </span>
            </button>

            {[
              {
                clave: 'rojo' as const,
                etiqueta: 'En riesgo (Rojo)',
                valor: resumen?.rojo ?? 0,
                clase: CLASES_TONO.danger.texto,
                anillo: 'border-danger/50 ring-danger/30',
              },
              {
                clave: 'amarillo' as const,
                etiqueta: 'En observación (Amarillo)',
                valor: resumen?.amarillo ?? 0,
                clase: CLASES_TONO.warning.texto,
                anillo: 'border-warning/50 ring-warning/30',
              },
              {
                clave: 'verde' as const,
                etiqueta: 'Al día (Verde)',
                valor: resumen?.verde ?? 0,
                clase: CLASES_TONO.success.texto,
                anillo: 'border-success/50 ring-success/30',
              },
              {
                clave: 'sin_plan' as const,
                etiqueta: 'Sin plan activo',
                valor: resumen?.sinPlan ?? 0,
                clase: CLASES_TONO.neutral.texto,
                anillo: 'border-border ring-border',
              },
            ].map(({ clave, etiqueta, valor, clase, anillo }) => (
              <button
                key={clave}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  // Toggle: volver a tocar el chip activo limpia el filtro.
                  onCambiarFiltroSemaforo((prev) => (prev === clave ? 'todos' : clave));
                }}
                aria-pressed={filtroSemaforo === clave}
                title={`Filtrar: ${etiqueta}`}
                className={`p-3.5 rounded-2xl bg-secondary/30 border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                  filtroSemaforo === clave
                    ? `${anillo} ring-1 shadow-xs`
                    : 'border-border/60 hover:border-border'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  {etiqueta}
                </span>
                <span className={`text-2xl font-bold font-mono ${clase}`}>{valor}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => onCambiarBusqueda(e.target.value)}
                placeholder="Buscar alumno por nombre…"
                aria-label="Buscar alumno por nombre"
                className="w-full pl-9 pr-9 py-2 rounded-xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
              />
              {busqueda.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCambiarBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1.5 p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
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
