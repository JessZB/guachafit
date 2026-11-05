/**
 * Módulo `monitor-adherencia` · estados honestos del monitor (§6.6).
 *
 * Extraídos de `pages/entrenador/MonitorAdherenciaPage.tsx:659-725`.
 * Clasificación: ÚNICOS (copys propios de la vista, R3).
 *
 * UX-14 (SEG-18): carga, error y vacío de filtros usan los átomos de `ui/` (`EstadoCarga`,
 * `EstadoError`, `EstadoVacio`), con los mismos textos. `VacioCarteraMonitor` conserva su
 * marcado porque `EstadoVacio` no admite enlace y el directorio de alumnos debe seguir
 * accesible desde ese estado.
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacionales: solo props y callbacks, sin `useQuery` ni `api-client` (R1).
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Search, Users } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import { CargaConEsqueleto } from '../../ui/CargaConEsqueleto';
import { EsqueletoListaFilas } from '../../ui/esqueletos';
import { EstadoError } from '../../ui/EstadoError';
import { EstadoVacio } from '../../ui/EstadoVacio';

export function CargaMonitor() {
  return (
    <CargaConEsqueleto texto="Cargando monitor de adherencia…">
      <EsqueletoListaFilas filas={5} />
    </CargaConEsqueleto>
  );
}

export function ErrorMonitor({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <EstadoError
      titulo="No se pudo cargar el monitor"
      mensaje={mensaje}
      onReintentar={onReintentar}
      nivelTitulo={2}
    />
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
        className="inline-flex min-h-11 items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 transition-all"
      >
        <span>Ir al directorio de alumnos</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function VacioFiltrosMonitor({ onLimpiarFiltros }: { onLimpiarFiltros: () => void }) {
  return (
    <EstadoVacio
      titulo="Sin resultados"
      detalle="Ningún alumno coincide con la búsqueda o el filtro seleccionado."
      icono={Search}
      nivelTitulo={2}
      accion={{
        texto: 'Limpiar filtros',
        variante: 'primaria',
        onAccion: () => {
          triggerHaptic('light');
          onLimpiarFiltros();
        },
      }}
    />
  );
}
