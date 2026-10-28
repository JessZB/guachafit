/**
 * Pestaña Medidas del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone la cabecera con el botón de registro de control, las métricas con deltas, el gráfico
 * de la serie completa, la tabla paginada y, plegado al final, el calendario de check-in. Los
 * datos van primero; el calendario es un ajuste que se consulta menos (decisión del dueño).
 * Recibe los hooks de dominio y conecta sus datos con los hijos (SL-5, recompuesta en SL-8).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos.
 */
import { AlertCircle, Plus } from 'lucide-react';
import { PeriodicidadAntropometria, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { GraficoEvolucion } from '../../common/GraficoEvolucion';
import { CalendarioCheckinAntropometrico } from './CalendarioCheckinAntropometrico';
import { MetricasAntropometricas } from './MetricasAntropometricas';
import { TablaControlesAntropometricos } from './TablaControlesAntropometricos';
import type { RetornoCalendarioAntropometrico } from './use-calendario-antropometrico';
import type { RetornoControlesAntropometricos } from './use-controles-antropometricos';
import type { RetornoSerieEvolucion } from './use-serie-evolucion';

/** Nombre de cada periodicidad, tal como lo muestra el selector del calendario. */
const ETIQUETA_PERIODICIDAD: Partial<Record<PeriodicidadAntropometria, string>> = {
  [PeriodicidadAntropometria.SEMANAL]: 'Semanal',
  [PeriodicidadAntropometria.QUINCENAL]: 'Quincenal',
  [PeriodicidadAntropometria.MENSUAL]: 'Mensual',
};

interface PestanaAntropometriaAlumnoProps {
  propsPanel: PropsPanel;
  alumno: PerfilAlumnoDetalleDTO | null;
  onRegistrarControl: () => void;
  periodicidad: PeriodicidadAntropometria | '';
  inicio: string;
  onCambiarPeriodicidad: (valor: PeriodicidadAntropometria | '') => void;
  onCambiarInicio: (valor: string) => void;
  calendario: RetornoCalendarioAntropometrico;
  controles: RetornoControlesAntropometricos;
  serie: RetornoSerieEvolucion;
}

export function PestanaAntropometriaAlumno({
  propsPanel,
  alumno,
  onRegistrarControl,
  periodicidad,
  inicio,
  onCambiarPeriodicidad,
  onCambiarInicio,
  calendario,
  controles,
  serie,
}: PestanaAntropometriaAlumnoProps) {
  // El resumen plegado lee el valor GUARDADO: `periodicidad` es el borrador del calendario, que
  // aún no se persiste hasta pulsar "Guardar Calendario".
  const periodicidadGuardada = alumno?.periodicidadAntropometria;
  const estadoCalendario =
    (periodicidadGuardada && ETIQUETA_PERIODICIDAD[periodicidadGuardada]) || 'Sin configurar';

  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* Cabecera con el botón de registro de control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 rounded-3xl bg-card border border-border shadow-xs">
        <div>
          <h3 className="text-lg font-bold text-foreground">Medidas y evolución</h3>
          <p className="text-xs text-muted-foreground">
            Control antropométrico multieje, porcentaje graso y registros de pesaje.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegistrarControl}
          className="min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 active:scale-95 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus className="h-4 w-4" />
          <span>Registrar control</span>
        </button>
      </div>

      {/* Métricas Actuales con Deltas */}
      <MetricasAntropometricas controles={controles.controlesAntro} />

      {/* RF-004 RN-01: gráfico multieje de la serie completa (la tabla de abajo pagina aparte). */}
      {serie.isCargandoGrafico ? (
        <div className="p-6 rounded-3xl bg-card border border-border flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : serie.graficoErrorMsg ? (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{serie.graficoErrorMsg}</span>
        </div>
      ) : (
        <GraficoEvolucion evaluaciones={serie.evaluacionesGrafico} />
      )}

      {/* Historial Tabular */}
      <TablaControlesAntropometricos
        fuente={controles}
        usuarioId={alumno?.usuarioId}
      />

      {/* RF-003 RN-01 (WU RF-003b): calendario de check-in del alumno (periodicidad + ancla).
          Va plegado al final: los datos van primero y el ajuste se abre bajo demanda. */}
      <details className="rounded-3xl bg-card border border-border shadow-xs">
        <summary className="min-h-11 cursor-pointer flex items-center justify-between gap-3 p-6 rounded-3xl font-bold text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          <span>Calendario de check-in</span>
          <span className="text-xs font-semibold text-muted-foreground">{estadoCalendario}</span>
        </summary>
        <div className="px-3 pb-3">
          <CalendarioCheckinAntropometrico
            alumno={alumno}
            periodicidad={periodicidad}
            inicio={inicio}
            onCambiarPeriodicidad={onCambiarPeriodicidad}
            onCambiarInicio={onCambiarInicio}
            calendario={calendario}
          />
        </div>
      </details>
    </div>
  );
}
