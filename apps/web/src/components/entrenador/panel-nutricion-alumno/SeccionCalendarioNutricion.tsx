/**
 * Sección del calendario de reportes del panel de nutrición del alumno (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: resumen de la ventana,
 * estados honestos de carga/error, lista paginada en cliente (`Paginacion`,
 * cuyo copy declara el alcance) y filas por día. Presentacional (R1): recibe
 * props y callbacks, no pide datos.
 */
import { Paginacion } from '../../common/Paginacion';
import { FilaDiaNutricional } from './FilaDiaNutricional';
import { pluralizar } from '../../../lib/pluralizar';
import type { DiaCalendarioNutricional } from '../../../lib/nutricion-metas';
import type {
  FotoComidaDetalleDTO,
  MetasNutricionalesDetalleDTO,
} from '@guachafit/shared';
import { Activity, Loader2, RefreshCw } from 'lucide-react';

export function SeccionCalendarioNutricion({
  reportadosVentana,
  noReportadosVentana,
  isCargandoCheckins,
  checkinsError,
  diasPagina,
  metas,
  zonaHorariaAlumno,
  pagina,
  tamano,
  total,
  onCambiarPagina,
  onCambiarTamano,
  onRecargar,
  onVerFoto,
}: {
  reportadosVentana: number;
  noReportadosVentana: number;
  isCargandoCheckins: boolean;
  checkinsError: string | null;
  diasPagina: DiaCalendarioNutricional[];
  metas: MetasNutricionalesDetalleDTO | null;
  zonaHorariaAlumno: string;
  pagina: number;
  tamano: number;
  total: number;
  onCambiarPagina: (pagina: number) => void;
  onCambiarTamano: (tamano: number) => void;
  onRecargar: () => void;
  onVerFoto: (foto: FotoComidaDetalleDTO, fecha: string) => void;
}) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Reportes de los últimos 30 días</h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {pluralizar(reportadosVentana, 'día reportado', 'días reportados')} ·{' '}
          {noReportadosVentana} sin reporte
        </span>
      </div>

      {isCargandoCheckins && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando reportes…
        </p>
      )}

      {checkinsError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
          <p role="alert" className="text-xs text-destructive font-semibold">{checkinsError}</p>
          <button
            type="button"
            onClick={onRecargar}
            className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {!isCargandoCheckins && !checkinsError && (
        <ul className="space-y-2.5">
          {diasPagina.map((dia) => (
            <FilaDiaNutricional
              key={dia.fecha}
              dia={dia}
              metas={metas}
              zonaHoraria={zonaHorariaAlumno}
              onVerFoto={(foto) => onVerFoto(foto, dia.fecha)}
            />
          ))}
        </ul>
      )}

      {!isCargandoCheckins && !checkinsError && total > 0 && (
        <div className="space-y-2 pt-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={onCambiarPagina}
            onCambiarTamano={(nuevo) => {
              onCambiarTamano(nuevo);
              onCambiarPagina(1);
            }}
            cargando={isCargandoCheckins}
          />
          <p className="text-xs text-muted-foreground">
            Se muestran los últimos 30 días; los reportes anteriores no aparecen en esta lista.
          </p>
        </div>
      )}
    </section>
  );
}
