/**
 * Pestaña Entrenamiento del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone, en este orden: la rutina semanal asignada en lectura, la tarjeta del último
 * entrenamiento y el historial paginado de sesiones. Recibe el hook de sesiones y conecta sus
 * datos con los hijos (SL-6, recompuesta en SL-8; red de caracterización C-1/C-2 en verde).
 *
 * La rutina va primero por decisión del dueño (2026-10-26), y se retiró la navegación por anclas
 * de la versión WU16. La tarjeta del último entrenamiento conserva su acceso directo al historial.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type {
  BloqueDiaRutinaDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
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

  // Acceso directo "Ver historial completo" de la tarjeta: el historial va justo debajo.
  const irAlHistorial = () => {
    triggerHaptic('light');
    const movimientoReducido =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('seccion-historial-sesiones')
      ?.scrollIntoView({ behavior: movimientoReducido ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* 1. Subsección: Rutina Semanal Asignada (primero, decisión del dueño) */}
      <RutinaSemanalAlumno
        bloques={bloquesRutina}
        archivado={archivado}
        onCargarPlantilla={onCargarPlantilla}
        onEditarRutina={onEditarRutina}
        errorRutina={errorRutina}
        onReintentarRutina={onReintentarRutina}
      />

      {/* 2. Auditoría del Último Entrenamiento del Alumno (solo sesiones realizadas) */}
      {ultimoEntrenamiento && etiquetaUltimoEntrenamiento && (
        <TarjetaUltimoEntrenamiento
          sesion={ultimoEntrenamiento}
          etiqueta={etiquetaUltimoEntrenamiento}
          onVerHistorial={irAlHistorial}
        />
      )}

      {/* 3. Subsección: Historial Cronológico de Entrenamientos Realizados */}
      <HistorialSesionesAlumno
        fuente={sesiones}
        rutina={bloquesRutina}
        expandidaId={expandidaId}
        onAlternarExpandida={onAlternarExpandida}
      />
    </div>
  );
}
