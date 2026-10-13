/**
 * Módulo `monitor-adherencia` · estados honestos del monitor (§6.6).
 *
 * Extraídos verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:659-725`.
 * Clasificación: ÚNICOS (copys propios de la vista, R3).
 *
 * R5: conserva idénticos los sr-only de carga, el error con "Reintentar" y los dos vacíos
 * ("Todavía no tienes alumnos activos" + enlace al directorio; "Sin resultados" +
 * "Limpiar filtros"). CANDIDATOS (no sustituyen aquí, R6): `EstadoCarga`/`EstadoError`/
 * `EstadoVacio` de `ui/` (roles y jerarquías propios: `role="alert"`/`h3` vs `h2`).
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacionales: solo props y callbacks, sin `useQuery` ni `api-client` (R1).
 */

import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, RefreshCw, Search, Users } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';

export function CargaMonitor() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">Cargando monitor de adherencia…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="p-5 rounded-3xl bg-card border border-border/80 animate-pulse h-28"
        />
      ))}
    </div>
  );
}

export function ErrorMonitor({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3 max-w-lg mx-auto">
      <AlertTriangle className="h-9 w-9 text-destructive mx-auto" />
      <h2 className="text-base font-bold text-foreground">No se pudo cargar el monitor</h2>
      <p className="text-xs text-muted-foreground">{mensaje}</p>
      <button
        type="button"
        onClick={() => onReintentar()}
        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <RefreshCw className="h-4 w-4" />
        <span>Reintentar</span>
      </button>
    </div>
  );
}

export function VacioCarteraMonitor() {
  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border/70 text-center space-y-3">
      <Users className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
      <h2 className="text-base font-bold text-foreground">Todavía no tienes alumnos activos</h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        Cuando registres alumnos y les asignes una rutina semanal, aquí verás su semáforo de
        adherencia de la semana en curso.
      </p>
      <Link
        to="/coach/alumnos"
        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 transition-all"
      >
        <span>Ir al directorio de alumnos</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function VacioFiltrosMonitor({ onLimpiarFiltros }: { onLimpiarFiltros: () => void }) {
  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border/70 text-center space-y-3">
      <Search className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
      <h2 className="text-base font-bold text-foreground">Sin resultados</h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        Ningún alumno coincide con la búsqueda o el filtro seleccionado.
      </p>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onLimpiarFiltros();
        }}
        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span>Limpiar filtros</span>
      </button>
    </div>
  );
}
