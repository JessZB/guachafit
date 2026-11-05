import { FilaSerieCompletada } from '../FilaSerieCompletada';
import { FilaSerieEdicion } from '../FilaSerieEdicion';
import type {
  SerieRegistroDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { UnidadPeso } from '../../../lib/weight-unit';
import { formatearPesoDesdeKg } from '../../../lib/weight-unit';
import { pesoPrescritoConCarga } from '../../../lib/entrenamiento-prescripcion';
import { pesoEfectivoKg, pesoVieneDelPlan } from '../../../lib/entrenamiento-peso-plan';
import { descansosRealesEntreSeries } from '../../../lib/sesion-tiempos';

export interface FilaSerieProps {
  sesion: SesionEntrenamientoDetalleDTO;
  ejercicioIndex: number;
  serieIndex: number;
  unidadPeso: UnidadPeso;
  inputDrafts: Record<string, string>;
  inputErrors: Record<string, string>;
  seriesEnCorreccion: Set<string>;
  soloLectura: boolean;
  onCorregir: (serieId: string) => void;
  onCambiar: (
    ejercicioIndex: number,
    serieIndex: number,
    campo: 'pesoKg' | 'repsLogradas' | 'rpe',
    texto: string
  ) => void;
  onPaso: (
    ejercicioIndex: number,
    serieIndex: number,
    campo: 'pesoKg' | 'repsLogradas',
    delta: number
  ) => void;
  onSalirPeso: (serieId: string) => void;
  onSalirReps: (serieId: string) => void;
  onSalirRpe: (serieId: string) => void;
  onMarcar: (ejercicioIndex: number, serieIndex: number) => void;
  onIniciar: (ejercicioIndex: number, serieIndex: number) => void;
}

/**
 * Lote E5: fila de una serie, compartida por el modo foco y la lista completa.
 * Serie completada sin corrección ni error → compacta; si no, edición.
 */
export function FilaSerie({
  sesion,
  ejercicioIndex,
  serieIndex,
  unidadPeso,
  inputDrafts,
  inputErrors,
  seriesEnCorreccion,
  soloLectura,
  onCorregir,
  onCambiar,
  onPaso,
  onSalirPeso,
  onSalirReps,
  onSalirRpe,
  onMarcar,
  onIniciar,
}: FilaSerieProps) {
  const ejercicioSesion = sesion.ejercicios[ejercicioIndex];
  const serie: SerieRegistroDetalleDTO = ejercicioSesion.series[serieIndex];
  const descansosReales = descansosRealesEntreSeries(ejercicioSesion.series);
  const clavePeso = `${serie.id}:pesoKg`;
  const claveRpe = `${serie.id}:rpe`;
  const claveReps = `${serie.id}:repsLogradas`;
  const borradorPeso = inputDrafts[clavePeso];
  const borradorRpe = inputDrafts[claveRpe];
  const errorPeso = inputErrors[clavePeso];
  const errorRpe = inputErrors[claveRpe];
  const errorReps = inputErrors[claveReps];
  // D6: rechazo del servidor al guardar la serie (se muestra junto a ella).
  const errorEnvio = inputErrors[`${serie.id}:envio`];
  const errorSerie = errorPeso ?? errorRpe ?? errorReps ?? errorEnvio ?? null;
  // Precarga con el plan: sin peso propio (`null`) el campo parte del peso prescrito, editable y
  // enviable; un `''` (el alumno lo borró) no vuelve a mostrar el plan.
  const pesoEfectivo = pesoEfectivoKg(serie);
  const pesoMostrado =
    borradorPeso !== undefined
      ? borradorPeso
      : Number(pesoEfectivo) > 0
      ? formatearPesoDesdeKg(pesoEfectivo, unidadPeso) ?? ''
      : '';
  const pesoDelPlan = borradorPeso === undefined && pesoVieneDelPlan(serie);
  const rpeMostrado = borradorRpe !== undefined ? borradorRpe : serie.rpe || '';
  const borradorReps = inputDrafts[claveReps];
  const repsMostradas =
    borradorReps !== undefined
      ? borradorReps
      : String(serie.repsLogradas ?? serie.repsObjetivo);
  const prescritoSerie = pesoPrescritoConCarga(serie);

  if (serie.completada && !seriesEnCorreccion.has(serie.id) && !errorSerie) {
    return (
      <FilaSerieCompletada
        key={serie.id}
        serie={serie}
        unidadPeso={unidadPeso}
        onCorregir={soloLectura ? undefined : () => onCorregir(serie.id)}
      />
    );
  }

  return (
    <FilaSerieEdicion
      key={serie.id}
      serie={serie}
      unidadPeso={unidadPeso}
      soloLectura={soloLectura}
      pesoMostrado={pesoMostrado}
      pesoDelPlan={pesoDelPlan}
      repsMostradas={repsMostradas}
      rpeMostrado={rpeMostrado}
      pesoPrescritoKg={prescritoSerie}
      descansoRealSegundos={descansosReales[serieIndex]}
      errorPeso={errorPeso}
      errorReps={errorReps}
      errorRpe={errorRpe}
      errorSerie={errorSerie}
      onCambiar={(campo, texto) => onCambiar(ejercicioIndex, serieIndex, campo, texto)}
      onPaso={(campo, delta) => onPaso(ejercicioIndex, serieIndex, campo, delta)}
      onSalirPeso={() => onSalirPeso(serie.id)}
      onSalirReps={() => onSalirReps(serie.id)}
      onSalirRpe={() => onSalirRpe(serie.id)}
      onMarcar={() => onMarcar(ejercicioIndex, serieIndex)}
      onIniciar={() => onIniciar(ejercicioIndex, serieIndex)}
    />
  );
}
