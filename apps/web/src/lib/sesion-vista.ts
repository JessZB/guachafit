/**
 * Textos compactos de la sesión del alumno (RF-001, lote E4): la vista previa del plan antes
 * de iniciar y la fila de una serie ya completada. Funciones puras, sin React.
 */
import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { pluralizar } from './pluralizar';
import { formatearPesoConUnidad, formatearPesoDesdeKg, type UnidadPeso } from './weight-unit';

const SEPARADOR = ' · ';

/** '8.0' → '8'; '8.5' → '8.5'. */
function formatearEsfuerzo(rpe: string): string {
  return rpe.trim().replace(/\.0$/, '');
}

function pesoConCarga(kg: string | null | undefined): number | null {
  if (kg === null || kg === undefined || kg === '') return null;
  const numerico = Number(kg);
  return Number.isFinite(numerico) && numerico > 0 ? numerico : null;
}

/** Prescripción de un ejercicio en una línea: '4 × 10 · 60 kg · Esfuerzo 8'. */
export function textoPrescripcionCompacta(
  ejercicio: EjercicioSesionDetalleDTO,
  unidad: UnidadPeso,
  rpeSugerido?: string | null
): string {
  const series = ejercicio.series;
  const reps = Array.from(new Set(series.map((s) => s.repsObjetivo))).sort((a, b) => a - b);
  const repsTexto =
    reps.length <= 1 ? String(reps[0] ?? 0) : `${reps[0]}–${reps[reps.length - 1]}`;
  const partes = [`${series.length} × ${repsTexto}`];

  const pesos = Array.from(
    new Set(series.map((s) => pesoConCarga(s.pesoPrescritoKg)).filter((kg): kg is number => kg !== null))
  ).sort((a, b) => a - b);
  if (pesos.length === 1) {
    partes.push(formatearPesoConUnidad(pesos[0], unidad) ?? '');
  } else if (pesos.length > 1) {
    partes.push(
      `${formatearPesoDesdeKg(pesos[0], unidad)}–${formatearPesoConUnidad(pesos[pesos.length - 1], unidad)}`
    );
  }

  if (rpeSugerido) partes.push(`Esfuerzo ${formatearEsfuerzo(rpeSugerido)}`);
  return partes.join(SEPARADOR);
}

/** Serie completada en una línea: 'Serie 2 · 60 kg × 10 · Esfuerzo 8'. */
export function textoSerieCompletada(serie: SerieRegistroDetalleDTO, unidad: UnidadPeso): string {
  const reps = serie.repsLogradas ?? serie.repsObjetivo;
  const peso = pesoConCarga(serie.pesoKg) !== null ? formatearPesoConUnidad(serie.pesoKg, unidad) : null;
  const partes = [
    `Serie ${serie.numeroSerie}`,
    peso ? `${peso} × ${reps}` : pluralizar(reps, 'repetición', 'repeticiones'),
  ];
  if (serie.rpe) partes.push(`Esfuerzo ${formatearEsfuerzo(serie.rpe)}`);
  return partes.join(SEPARADOR);
}

/** Totales de la sesión para la vista previa: '5 ejercicios · 18 series'. */
export function resumirSesionParaVistaPrevia(sesion: SesionEntrenamientoDetalleDTO): {
  totalEjercicios: number;
  totalSeries: number;
  texto: string;
} {
  const totalEjercicios = sesion.ejercicios.length;
  const totalSeries = sesion.ejercicios.reduce((total, ej) => total + ej.series.length, 0);
  return {
    totalEjercicios,
    totalSeries,
    texto: `${pluralizar(totalEjercicios, 'ejercicio', 'ejercicios')}${SEPARADOR}${pluralizar(
      totalSeries,
      'serie',
      'series'
    )}`,
  };
}
