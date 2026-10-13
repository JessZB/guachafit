/**
 * Fila del calendario nutricional del panel del entrenador (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: día con estado, totales vs
 * metas, tolerancia, fotos y notas. Presentacional (R1): recibe props y un
 * callback, no pide datos (`useQuery`/`api-client` prohibidos aquí).
 */
import {
  clasificarTolerancia,
  etiquetaEstadoDia,
  describirComparacionMeta,
  describirRegistroCheckin,
  evaluarToleranciaDia,
  formatearDesviacionPct,
  notaBaseTolerancia,
  type DiaCalendarioNutricional,
} from '../../../lib/nutricion-metas';
import { tonoDe } from '../../../lib/panel-nutricion-alumno-tono';
import { HORARIO_VENTANA_CHECKIN } from '../../../lib/nutricion-checkin';
import { horaDeZona } from '../../../lib/zona-horaria';
import { formatFechaLargaCalendario } from '../../../lib/date-format';
import { MiniaturaFotoPlato } from '../../common/MiniaturaFotoPlato';
import {
  EstadoDiaNutricional,
  type FotoComidaDetalleDTO,
  type MetasNutricionalesDetalleDTO,
} from '@guachafit/shared';
import { Camera, Clock, Gauge } from 'lucide-react';

/** Fila del calendario: día con estado, totales vs metas, tolerancia, fotos y notas. */
export function FilaDiaNutricional({
  dia,
  metas,
  zonaHoraria,
  onVerFoto,
}: {
  dia: DiaCalendarioNutricional;
  metas: MetasNutricionalesDetalleDTO | null;
  zonaHoraria: string;
  onVerFoto: (foto: FotoComidaDetalleDTO) => void;
}) {
  const etiqueta = etiquetaEstadoDia(dia.estado);
  const checkin = dia.checkin;
  // ADR-019: cada día se evalúa con las metas vigentes ese día (copia del reporte) o, en reportes
  // anteriores a la copia, con las actuales, y se dice cuál.
  const evaluacion = checkin ? evaluarToleranciaDia(checkin, metas) : null;
  const tolerancia = evaluacion?.tolerancia ?? null;
  const clasificacion = tolerancia ? clasificarTolerancia(tolerancia) : null;
  const notaBase = evaluacion ? notaBaseTolerancia(evaluacion.base) : null;
  const registro = checkin
    ? describirRegistroCheckin(checkin, checkin.zonaHoraria ?? zonaHoraria)
    : null;

  return (
    <li className="p-3.5 rounded-2xl bg-secondary/30 border border-border/70 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">
            {formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tonoDe(etiqueta.tono)}`}>
            {etiqueta.texto}
          </span>
        </div>
        {clasificacion && (
          <span className="inline-flex items-center gap-1 text-xs font-bold">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`px-2 py-0.5 rounded-full border ${tonoDe(clasificacion.tono)}`}>
              {clasificacion.texto}
            </span>
          </span>
        )}
      </div>

      {!checkin && (
        <p className="text-xs text-muted-foreground">
          {dia.estado === EstadoDiaNutricional.NO_REPORTADO
            ? 'Sin reporte ese día. No penaliza la racha de entrenamiento; cuenta en el resumen semanal.'
            : `El día sigue en curso: el reporte se habilita de ${HORARIO_VENTANA_CHECKIN} (${horaDeZona(zonaHoraria)}).`}
        </p>
      )}

      {checkin && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Calorías:{' '}
              <span className="font-mono font-bold text-foreground">
                {describirComparacionMeta(checkin.caloriasReportadas, evaluacion?.caloriasMeta ?? null, 'kcal') ?? '—'}
              </span>
              {tolerancia?.desviacionCaloriasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionCaloriasPct)})</span>
              )}
            </span>
            <span>
              Proteína:{' '}
              <span className="font-mono font-bold text-foreground">
                {describirComparacionMeta(checkin.proteinaGramosReportada, evaluacion?.proteinaMeta ?? null, 'g') ?? '—'}
              </span>
              {tolerancia?.desviacionProteinasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionProteinasPct)})</span>
              )}
            </span>
            {checkin.aguaLitros && <span>Agua: {checkin.aguaLitros} L</span>}
          </div>

          {(registro || notaBase) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {registro && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {registro}
                </span>
              )}
              {notaBase && <span className="italic">{notaBase}</span>}
            </div>
          )}

          {checkin.fotosPlatos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {checkin.fotosPlatos.map((foto) => (
                <li key={foto.id}>
                  <MiniaturaFotoPlato
                    foto={foto}
                    fechaTexto={formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}
                    onAbrir={() => onVerFoto(foto)}
                  />
                </li>
              ))}
            </ul>
          )}

          {checkin.notasAlumno && (
            <p className="text-xs text-muted-foreground italic">"{checkin.notasAlumno}"</p>
          )}

          {checkin.fotosPlatos.length === 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Ese día no adjuntó fotos de platos.
            </p>
          )}
        </>
      )}
    </li>
  );
}
