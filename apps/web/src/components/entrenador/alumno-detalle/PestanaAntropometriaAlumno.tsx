/**
 * Pestaña Antropometría del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone el header con el botón de control en sala, el calendario de check-in, las
 * métricas con deltas, el gráfico de la serie completa y la tabla paginada. Recibe los
 * hooks de dominio y conecta sus datos con los hijos (SL-5, recompuesta en SL-8).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos.
 */
import { AlertCircle, Plus } from 'lucide-react';
import type { PerfilAlumnoDetalleDTO, PeriodicidadAntropometria } from '@guachafit/shared';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { GraficoEvolucion } from '../../common/GraficoEvolucion';
import { CalendarioCheckinAntropometrico } from './CalendarioCheckinAntropometrico';
import { MetricasAntropometricas } from './MetricasAntropometricas';
import { TablaControlesAntropometricos } from './TablaControlesAntropometricos';
import type { RetornoCalendarioAntropometrico } from './use-calendario-antropometrico';
import type { RetornoControlesAntropometricos } from './use-controles-antropometricos';
import type { RetornoSerieEvolucion } from './use-serie-evolucion';

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
  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* Header con botón de nuevo control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 rounded-3xl bg-card border border-border shadow-xs">
        <div>
          <h3 className="text-lg font-bold text-foreground">Evolución Corporal & Medidas</h3>
          <p className="text-xs text-muted-foreground">
            Control antropométrico multieje, porcentaje graso y registros de pesaje.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegistrarControl}
          className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 active:scale-95 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Plus className="h-4 w-4" />
          <span>Registrar Control en Sala</span>
        </button>
      </div>

      {/* RF-003 RN-01 (WU RF-003b): calendario de check-in del alumno (periodicidad + ancla).
          Decisión del WU: vive en este tab porque es un ajuste del control antropométrico; el
          formulario del expediente (Resumen) queda enfocado en datos personales y plan. */}
      <CalendarioCheckinAntropometrico
        alumno={alumno}
        periodicidad={periodicidad}
        inicio={inicio}
        onCambiarPeriodicidad={onCambiarPeriodicidad}
        onCambiarInicio={onCambiarInicio}
        calendario={calendario}
      />

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
    </div>
  );
}
