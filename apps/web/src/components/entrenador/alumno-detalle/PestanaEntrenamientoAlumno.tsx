/**
 * Pestaña Entrenamiento del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone las anclas internas, la tarjeta del último entrenamiento, el historial paginado
 * y la rutina semanal en lectura. Recibe el hook de sesiones y conecta sus datos con los
 * hijos (SL-6, recompuesta en SL-8; red de caracterización C-1/C-2 en verde).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type {
  BloqueDiaRutinaDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { ClipboardList, Dumbbell, History } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { etiquetaEstadoSesion, type EtiquetaVisual } from '../../../lib/adherencia';
import { resolverUltimoEntrenamiento } from '../../../lib/alumno-detalle-metricas';
import { TarjetaUltimoEntrenamiento } from './TarjetaUltimoEntrenamiento';
import {
  HistorialSesionesAlumno,
  type SesionesHistorialFuente,
} from './HistorialSesionesAlumno';
import { RutinaSemanalAlumno } from './RutinaSemanalAlumno';

/** WU16: pills de navegación interna del tab de entrenamiento (scroll suave entre secciones). */
const CLASES_PILL_ANCLA_ENTRENAMIENTO =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary';

interface PestanaEntrenamientoAlumnoProps {
  propsPanel: PropsPanel;
  sesiones: SesionesHistorialFuente & {
    ultimaSesion: SesionEntrenamientoDetalleDTO | null;
  };
  bloquesRutina: BloqueDiaRutinaDTO[];
  expandidaId: string | null;
  onAlternarExpandida: (id: string | null) => void;
  archivado: boolean;
  onCargarPlantilla: () => void;
  onEditarRutina: () => void;
  errorRutina?: string | null;
  onReintentarRutina?: () => void;
}

export function PestanaEntrenamientoAlumno({
  propsPanel,
  sesiones,
  bloquesRutina,
  expandidaId,
  onAlternarExpandida,
  archivado,
  onCargarPlantilla,
  onEditarRutina,
  errorRutina,
  onReintentarRutina,
}: PestanaEntrenamientoAlumnoProps) {
  // WU5: "Último Entrenamiento Realizado" solo considera sesiones completadas o en progreso.
  // WU25b: la fuente canónica del "último" es el endpoint `/ultima` y el historial solo es
  // respaldo (página 1 ya es lo más reciente).
  const ultimoEntrenamiento = resolverUltimoEntrenamiento(
    sesiones.ultimaSesion,
    sesiones.historialSesiones
  );
  const etiquetaUltimoEntrenamiento: EtiquetaVisual | null =
    ultimoEntrenamiento
      ? etiquetaEstadoSesion(ultimoEntrenamiento.estado, ultimoEntrenamiento.motivoOmision)
      : null;

  /**
   * WU16: navegación interna del tab "Entrenamiento & Rutinas". El historial quedó arriba,
   * inmediatamente después del último entrenamiento; estas anclas llevan a cada sección con
   * scroll suave y respetan `prefers-reduced-motion`. Las secciones destino usan `scroll-mt-24`
   * para no quedar debajo del header sticky, y la URL no cambia (sin ruido en el historial).
   */
  const irASeccionEntrenamiento = (idSeccion: string) => {
    triggerHaptic('light');
    const movimientoReducido =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(idSeccion)
      ?.scrollIntoView({ behavior: movimientoReducido ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* WU16: anclas internas — el historial vive arriba; estas pills evitan buscar a ciegas */}
      <nav
        aria-label="Secciones del entrenamiento"
        className="flex flex-wrap items-center gap-2"
      >
        {ultimoEntrenamiento && (
          <button
            type="button"
            onClick={() => irASeccionEntrenamiento('seccion-ultimo-entrenamiento')}
            className={CLASES_PILL_ANCLA_ENTRENAMIENTO}
          >
            <Dumbbell className="h-3.5 w-3.5 text-primary" />
            Último entrenamiento
          </button>
        )}
        <button
          type="button"
          onClick={() => irASeccionEntrenamiento('seccion-historial-sesiones')}
          className={CLASES_PILL_ANCLA_ENTRENAMIENTO}
        >
          <History className="h-3.5 w-3.5 text-primary" />
          Historial ({sesiones.historialTotal})
        </button>
        <button
          type="button"
          onClick={() => irASeccionEntrenamiento('seccion-rutina-semanal')}
          className={CLASES_PILL_ANCLA_ENTRENAMIENTO}
        >
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          Rutina semanal
        </button>
      </nav>

      {/* Auditoría del Último Entrenamiento del Alumno (solo sesiones realizadas) */}
      {ultimoEntrenamiento && etiquetaUltimoEntrenamiento && (
        <TarjetaUltimoEntrenamiento
          sesion={ultimoEntrenamiento}
          etiqueta={etiquetaUltimoEntrenamiento}
          onVerHistorial={() => irASeccionEntrenamiento('seccion-historial-sesiones')}
        />
      )}

      {/* 1. Subsección: Historial Cronológico de Entrenamientos Realizados
          (WU16: sube al tope, inmediatamente después del último entrenamiento) */}
      <HistorialSesionesAlumno
        fuente={sesiones}
        rutina={bloquesRutina}
        expandidaId={expandidaId}
        onAlternarExpandida={onAlternarExpandida}
      />

      {/* 2. Subsección: Rutina Semanal Asignada (WU16: debajo del historial) */}
      <RutinaSemanalAlumno
        bloques={bloquesRutina}
        archivado={archivado}
        onCargarPlantilla={onCargarPlantilla}
        onEditarRutina={onEditarRutina}
        errorRutina={errorRutina}
        onReintentarRutina={onReintentarRutina}
      />
    </div>
  );
}
